use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use scenario_core::{
    ConfigParseResult, EngineBundle, EngineConfigFile, ParseContext, ParseResult,
    ScenarioDiagnostic, ScenarioDocument, ScenarioRegistry, SourceDocument,
};
use tauri::State;

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
}
