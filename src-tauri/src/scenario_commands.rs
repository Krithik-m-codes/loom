use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use scenario_core::{
    ConfigParseResult, EngineBundle, EngineConfigFile, EngineFileRole, ParseContext, ParseResult,
    ScenarioDiagnostic, ScenarioDocument, ScenarioRegistry, SourceDocument,
};
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Default)]
pub struct ScenarioCommandState {
    active: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ScenarioCommandState {
    fn start(&self, cancel_id: &str) -> Result<Arc<AtomicBool>, String> {
        if cancel_id.trim().is_empty() {
            return Err("A scenario parse requires a cancellation ID".into());
        }
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Scenario parse state is unavailable")?;
        if active.contains_key(cancel_id) {
            return Err("A scenario parse with this ID is already running".into());
        }
        let token = Arc::new(AtomicBool::new(false));
        active.insert(cancel_id.to_owned(), token.clone());
        Ok(token)
    }

    fn cancel(&self, cancel_id: &str) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Scenario parse state is unavailable")?;
        let token = active
            .get(cancel_id)
            .ok_or_else(|| "No active parse has this cancellation ID".to_owned())?;
        token.store(true, Ordering::Relaxed);
        Ok(())
    }

    fn finish(&self, cancel_id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(cancel_id);
        }
    }
}

fn parse_source_for_engine(
    engine_id: &str,
    source: &SourceDocument,
    context: &ParseContext,
) -> Result<ParseResult, String> {
    let registry = ScenarioRegistry::builtins();
    let adapter = registry
        .adapter(engine_id)
        .ok_or_else(|| format!("Unknown scenario engine: {engine_id}"))?;
    Ok(adapter.parse_script(source, context))
}

fn parse_config_for_engine(
    engine_id: &str,
    source: &EngineConfigFile,
) -> Result<ConfigParseResult, String> {
    let registry = ScenarioRegistry::builtins();
    let adapter = registry
        .adapter(engine_id)
        .ok_or_else(|| format!("Unknown scenario engine: {engine_id}"))?;
    Ok(adapter.parse_config(source))
}

#[tauri::command]
pub fn list_scenario_adapters() -> Vec<scenario_core::EngineAdapterMetadata> {
    ScenarioRegistry::builtins().metadata()
}

#[tauri::command]
pub async fn parse_scenario_source(
    state: State<'_, ScenarioCommandState>,
    engine_id: String,
    source: SourceDocument,
    mut context: ParseContext,
) -> Result<ParseResult, String> {
    let command_state = state.inner().clone();
    let cancel_id = context.cancel_id.clone();
    context.cancellation = Some(command_state.start(&cancel_id)?);
    let result =
        tokio::task::spawn_blocking(move || parse_source_for_engine(&engine_id, &source, &context))
            .await
            .map_err(|error| format!("Scenario parser task failed: {error}"));
    command_state.finish(&cancel_id);
    result?
}

#[tauri::command]
pub fn cancel_scenario_parse(
    state: State<'_, ScenarioCommandState>,
    cancel_id: String,
) -> Result<(), String> {
    state.cancel(&cancel_id)
}

#[tauri::command]
pub fn parse_engine_config(
    engine_id: String,
    source: EngineConfigFile,
) -> Result<ConfigParseResult, String> {
    parse_config_for_engine(&engine_id, &source)
}

#[tauri::command]
pub fn generate_scenario_bundle(
    engine_id: String,
    document: ScenarioDocument,
) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
    let registry = ScenarioRegistry::builtins();
    let Some(adapter) = registry.adapter(&engine_id) else {
        return Err(vec![ScenarioDiagnostic {
            code: "ENGINE_UNKNOWN".into(),
            severity: scenario_core::DiagnosticSeverity::Error,
            message: format!("Unknown scenario engine: {engine_id}"),
            span: None,
        }]);
    };
    adapter.generate(&document)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBundle {
    config_path: Option<String>,
}

fn atomic_replace_artifact(
    parent: &Path,
    destination: &Path,
    content: &[u8],
) -> Result<(), String> {
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(content).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist(destination)
        .map(|_| ())
        .map_err(|error| error.error.to_string())
}

/// Persist a previewed bundle only inside the app-managed directory belonging to its suite.
#[tauri::command]
pub async fn persist_scenario_bundle(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    suite_id: String,
    bundle: EngineBundle,
) -> Result<PersistedBundle, String> {
    const MAX_FILE_BYTES: usize = 2 * 1024 * 1024;
    const MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;
    if suite_id.is_empty()
        || !suite_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err("Invalid suite identifier".into());
    }
    if bundle.files.is_empty() || bundle.files.len() > 128 {
        return Err("Scenario bundle must contain between 1 and 128 files".into());
    }
    let app_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("scripts");
    let (stored_engine, script_path): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT engine, script_path FROM test_suites WHERE id = ?1",
            rusqlite::params![suite_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Suite not found: {suite_id}"))?
    };
    if stored_engine != bundle.engine_id {
        return Err(format!(
            "Bundle engine '{}' does not match suite engine '{stored_engine}'",
            bundle.engine_id
        ));
    }
    let scripts_root = std::fs::canonicalize(&app_root)
        .map_err(|e| format!("Suite script directory is unavailable: {e}"))?;
    let script_path = std::fs::canonicalize(script_path)
        .map_err(|e| format!("Suite script is unavailable: {e}"))?;
    if !script_path.starts_with(&scripts_root) {
        return Err("Suite script is outside Loom's managed project storage".into());
    }
    let artifact_root = script_path
        .parent()
        .ok_or("Suite script has no parent directory")?
        .join(format!("{suite_id}.artifacts"));
    tokio::fs::create_dir_all(&artifact_root)
        .await
        .map_err(|e| e.to_string())?;
    let artifact_root = std::fs::canonicalize(&artifact_root).map_err(|e| e.to_string())?;
    if !artifact_root.starts_with(&scripts_root) {
        return Err("Scenario artifact directory escapes Loom-managed storage".into());
    }
    let mut total = 0usize;
    let mut seen = std::collections::HashSet::new();
    let mut config_path = None;
    for file in &bundle.files {
        let relative = std::path::Path::new(&file.path);
        if relative.as_os_str().is_empty()
            || relative
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
            || !seen.insert(relative.to_path_buf())
        {
            return Err(format!(
                "Unsafe or duplicate scenario artifact path: {}",
                file.path
            ));
        }
        if file.content.len() > MAX_FILE_BYTES {
            return Err(format!(
                "Scenario artifact exceeds the 2 MiB limit: {}",
                file.path
            ));
        }
        total = total
            .checked_add(file.content.len())
            .ok_or("Scenario bundle size overflow")?;
        if total > MAX_TOTAL_BYTES {
            return Err("Scenario bundle exceeds the 16 MiB total limit".into());
        }
        let is_runtime_file = match stored_engine.as_str() {
            "locust" | "k6" => file.role == EngineFileRole::Config,
            "goose" => file.role == EngineFileRole::Manifest,
            _ => false,
        };
        if is_runtime_file {
            if config_path.is_some() {
                return Err("Only one active config file is supported per suite".into());
            }
            config_path = Some(artifact_root.join(relative));
        }
    }
    for file in &bundle.files {
        let relative = std::path::Path::new(&file.path);
        let destination = artifact_root.join(relative);
        let parent = destination
            .parent()
            .ok_or("Artifact has no parent directory")?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
        let canonical_parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
        if !canonical_parent.starts_with(&artifact_root) {
            return Err(format!(
                "Artifact path escapes its suite directory: {}",
                file.path
            ));
        }
        let content = file.content.as_bytes().to_vec();
        let artifact_path = file.path.clone();
        tokio::task::spawn_blocking(move || {
            atomic_replace_artifact(&canonical_parent, &destination, &content)
        })
        .await
        .map_err(|e| format!("Artifact write task failed: {e}"))?
        .map_err(|e| format!("Could not install scenario artifact '{artifact_path}': {e}"))?;
    }
    Ok(PersistedBundle {
        config_path: config_path.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use scenario_core::{EngineConfigFile, ParseContext, ScenarioNode, SourceDocument};

    fn context() -> ParseContext {
        ParseContext {
            project_id: "project-1".into(),
            suite_id: "suite-1".into(),
            max_bytes: 2 * 1024 * 1024,
            cancel_id: "ipc-test".into(),
            cancellation: None,
        }
    }

    #[test]
    fn unknown_engine_is_rejected_before_source_parsing() {
        let source = SourceDocument {
            id: "s".into(),
            file_name: "test.py".into(),
            language: "python".into(),
            content: "print('not executed')".into(),
        };
        assert!(parse_source_for_engine("unknown", &source, &context()).is_err());
    }

    #[test]
    fn parse_cancellation_ids_cannot_be_reused_while_active() {
        let state = ScenarioCommandState::default();
        let token = state.start("task-1").unwrap();
        assert!(state.start("task-1").is_err());
        state.cancel("task-1").unwrap();
        assert!(token.load(std::sync::atomic::Ordering::Relaxed));
        state.finish("task-1");
        assert!(state.start("task-1").is_ok());
    }

    #[test]
    fn registered_locust_command_path_returns_ast_backed_nodes_without_execution() {
        let source = SourceDocument { id: "locust".into(), file_name: "locustfile.py".into(), language: "python".into(), content: "from locust import HttpUser\nclass User(HttpUser):\n    def task(self):\n        self.client.get(\"/health\")\n".into() };
        let parsed = parse_source_for_engine("locust", &source, &context()).unwrap();
        assert!(parsed
            .nodes
            .iter()
            .any(|node| matches!(node, ScenarioNode::Request { url, .. } if url == "/health")));
        assert_eq!(parsed.source.content, source.content);
    }

    #[test]
    fn config_command_preserves_unknown_json_keys_in_the_original_document() {
        let config = EngineConfigFile {
            id: "k6".into(),
            file_name: "config.json".into(),
            format: "json".into(),
            content: r#"{"vus":5,"plugin_key":1}"#.into(),
        };
        let parsed = parse_config_for_engine("k6", &config).unwrap();
        assert!(parsed
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "CONFIG_UNKNOWN_KEY"));
        assert_eq!(parsed.source.content, config.content);
    }

    #[test]
    fn generate_command_returns_previewable_files_from_the_registered_adapter() {
        let document = ScenarioDocument {
            schema_version: 1,
            engine_id: "locust".into(),
            project_id: "project-1".into(),
            suite_id: "suite-1".into(),
            sources: vec![],
            nodes: vec![ScenarioNode::Request {
                id: "request-1".into(),
                engine_ids: vec!["locust".into()],
                span: None,
                method: "GET".into(),
                url: "/health".into(),
                headers: None,
                body: None,
            }],
            config_files: vec![],
            legacy_payload: None,
        };

        let bundle = generate_scenario_bundle("locust".into(), document).unwrap();

        assert_eq!(bundle.engine_id, "locust");
        assert_eq!(bundle.files[0].path, "locustfile.py");
        assert!(bundle.files[0]
            .content
            .contains("self.client.get(\"/health\")"));
    }

    #[test]
    fn adapter_metadata_is_the_single_source_for_engine_node_compatibility() {
        let metadata = list_scenario_adapters();
        let k6 = metadata.iter().find(|adapter| adapter.id == "k6").unwrap();
        assert!(k6.compatible_node_kinds.contains(&"check".into()));
        let goose = metadata
            .iter()
            .find(|adapter| adapter.id == "goose")
            .unwrap();
        assert!(!goose.compatible_node_kinds.contains(&"check".into()));
    }

    #[test]
    fn artifact_relative_paths_reject_parent_traversal_and_absolute_paths() {
        for path in [
            "../escape.py",
            "nested/../../escape.py",
            "C:/outside.py",
            "/tmp/outside.py",
        ] {
            let relative = std::path::Path::new(path);
            assert!(
                relative
                    .components()
                    .any(|part| !matches!(part, std::path::Component::Normal(_))),
                "accepted {path}"
            );
        }
    }

    #[test]
    fn artifact_replacement_keeps_the_old_file_until_new_contents_are_ready() {
        let root = tempfile::tempdir().unwrap();
        let destination = root.path().join("locust.conf");
        std::fs::write(&destination, "old=1\n").unwrap();
        atomic_replace_artifact(root.path(), &destination, b"users=4\n").unwrap();
        assert_eq!(std::fs::read_to_string(destination).unwrap(), "users=4\n");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
}
