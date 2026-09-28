use engine_core::*;
use engine_goose::GooseEngine;
use engine_k6::K6Engine;
use engine_locust::LocustEngine;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

mod db;
mod runtime_commands;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/// Application state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub engines: Vec<Box<dyn LoadEngine>>,
    pub active_runs: Arc<Mutex<HashMap<Uuid, tokio::sync::oneshot::Sender<()>>>>,
    pub runtime_context: Arc<std::sync::RwLock<RuntimeContext>>,
}

fn script_extension_for_engine(engine: &str) -> &'static str {
    match engine {
        "locust" => "py",
        "k6" => "js",
        "goose" => "rs",
        _ => "txt",
    }
}

fn validate_suite_engine(engine: &str) -> Result<(), String> {
    match engine {
        "locust" | "k6" | "goose" => Ok(()),
        other => Err(format!("Unsupported engine: {other}")),
    }
}

fn apply_pragmas(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRecord {
    id: String,
    name: String,
    description: String,
    target_host: String,
    default_engine: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteRecord {
    id: String,
    project_id: String,
    name: String,
    engine: String,
    script_path: String,
    config: TestConfig,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteWithContent {
    id: String,
    project_id: String,
    name: String,
    engine: String,
    script_path: String,
    config: TestConfig,
    created_at: String,
    updated_at: String,
    script_content: String,
    visual_nodes: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// List all registered engines and their availability.
#[tauri::command]
fn list_engines(state: tauri::State<'_, AppState>) -> Vec<EngineInfo> {
    let runtime = state
        .runtime_context
        .read()
        .map(|context| context.clone())
        .unwrap_or_default();
    state
        .engines
        .iter()
        .map(|e| e.info_with_runtime(&runtime))
        .collect()
}

/// Start a load test run.
#[tauri::command]
async fn start_run(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    engine_id: String,
    config: TestConfig,
) -> Result<String, String> {
    // Find the engine
    let engine = state
        .engines
        .iter()
        .find(|e| e.id() == engine_id)
        .ok_or_else(|| format!("Engine not found: {engine_id}"))?;

    // Check availability
    let runtime_context = state
        .runtime_context
        .read()
        .map(|context| context.clone())
        .unwrap_or_default();
    match engine.detect_with_runtime(&runtime_context) {
        EngineAvailability::Ready { .. } => {}
        EngineAvailability::NotInstalled { install_hint } => {
            return Err(format!("Engine not installed: {install_hint}"));
        }
    }

    // Validate config
    engine.validate_config(&config).map_err(|e| e.to_string())?;

    // Create run directory
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {e}"))?;
    let run_id = Uuid::new_v4();
    let run_dir = app_data_dir.join("runs").join(run_id.to_string());

    // Prepare workspace
    let job = engine
        .prepare_workspace_with_runtime(&config, &run_dir, &runtime_context)
        .map_err(|e| e.to_string())?;

    // Record run in DB
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let config_json = serde_json::to_string(&config).unwrap_or_default();
        db.execute(
            "INSERT INTO runs (id, engine, project, config_json, started_at, status)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), 'running')",
            rusqlite::params![
                job.run_id.to_string(),
                engine_id,
                config.project_name,
                config_json,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let final_run_id = job.run_id;
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();

    // Track active run
    {
        let mut active = state.active_runs.lock().map_err(|e| e.to_string())?;
        active.insert(final_run_id, cancel_tx);
    }

    // Launch engine subprocess
    let mut run_handle = engine.launch(&job).await.map_err(|e| e.to_string())?;

    // Emit run-started event
    let _ = app.emit(
        "run-started",
        serde_json::json!({
            "run_id": final_run_id.to_string(),
            "engine": engine_id,
            "project": config.project_name,
        }),
    );

    let app_handle = app.clone();
    let db_arc = Arc::clone(&state.db);
    let active_runs_arc = Arc::clone(&state.active_runs);
    let engine_type = engine_id.clone();
    let run_dir_clone = run_dir.clone();

    // Take stdout/stderr for logging if present
    let stdout_opt = run_handle.child.stdout.take();
    let stderr_opt = run_handle.child.stderr.take();

    // Stream stdout logs to UI
    if let Some(stdout) = stdout_opt {
        let app_log = app_handle.clone();
        let log_run_id = final_run_id.to_string();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_log.emit(
                    "run-log",
                    serde_json::json!({
                        "run_id": log_run_id,
                        "stream": "stdout",
                        "message": line,
                    }),
                );
            }
        });
    }

    // Stream stderr logs to UI
    if let Some(stderr) = stderr_opt {
        let app_log = app_handle.clone();
        let log_run_id = final_run_id.to_string();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_log.emit(
                    "run-log",
                    serde_json::json!({
                        "run_id": log_run_id,
                        "stream": "stderr",
                        "message": line,
                    }),
                );
            }
        });
    }

    // Background task for monitoring, polling metrics, and DB insertion
    tokio::spawn(async move {
        let mut last_locust_row: usize = 0;
        let mut k6_offset: u64 = 0;

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    // Canceled by user
                    let _ = run_handle.child.kill().await;
                    let _ = run_handle.child.wait().await;

                    if let Ok(db) = db_arc.lock() {
                        let _ = db.execute(
                            "UPDATE runs SET status = 'stopped', finished_at = datetime('now') WHERE id = ?1",
                            rusqlite::params![final_run_id.to_string()],
                        );
                    }

                    let _ = app_handle.emit(
                        "run-finished",
                        serde_json::json!({
                            "run_id": final_run_id.to_string(),
                            "status": "stopped",
                        }),
                    );
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(1000)) => {
                    // Check if process exited
                    let exited = match run_handle.child.try_wait() {
                        Ok(Some(status)) => Some(status),
                        Ok(None) => None,
                        Err(_) => Some(std::process::ExitStatus::default()),
                    };

                    // Engine-specific metric collection
                    if engine_type == "locust" {
                        let stats_file = run_dir_clone.join("stats_stats_history.csv");
                        if stats_file.exists() {
                            if let Ok(content) = tokio::fs::read_to_string(&stats_file).await {
                                let mut reader = csv::ReaderBuilder::new()
                                    .has_headers(true)
                                    .from_reader(content.as_bytes());

                                let records: Vec<csv::StringRecord> = reader
                                    .records()
                                    .filter_map(|r| r.ok())
                                    .collect();

                                if records.len() > last_locust_row {
                                    for row in &records[last_locust_row..] {
                                        let metrics = LocustEngine::parse_stats_history_row(row, final_run_id);
                                        for metric in metrics {
                                            let _ = app_handle.emit("metric", &metric);
                                            // Insert into DB
                                            if let Ok(db) = db_arc.lock() {
                                                let labels_json = serde_json::to_string(&metric.labels).unwrap_or_default();
                                                let _ = db.execute(
                                                    "INSERT INTO metrics (run_id, timestamp, metric_name, value, labels_json)
                                                     VALUES (?1, ?2, ?3, ?4, ?5)",
                                                    rusqlite::params![
                                                        final_run_id.to_string(),
                                                        metric.timestamp.to_rfc3339(),
                                                        format!("{:?}", metric.metric),
                                                        metric.value,
                                                        labels_json,
                                                    ],
                                                );
                                            }
                                        }
                                    }
                                    last_locust_row = records.len();
                                }
                            }
                        }
                    } else if engine_type == "k6" {
                        let json_out = run_dir_clone.join("metrics.json");
                        if json_out.exists() {
                            if let Ok(file) = tokio::fs::File::open(&json_out).await {
                                let reader = BufReader::new(file);
                                let mut lines = reader.lines();
                                let mut cur: u64 = 0;
                                while let Ok(Some(line)) = lines.next_line().await {
                                    cur += line.len() as u64 + 1;
                                    if cur <= k6_offset {
                                        continue;
                                    }
                                    if let Some(metric) = K6Engine::parse_json_line(&line, final_run_id) {
                                        let _ = app_handle.emit("metric", &metric);
                                        if let Ok(db) = db_arc.lock() {
                                            let labels_json = serde_json::to_string(&metric.labels).unwrap_or_default();
                                            let _ = db.execute(
                                                "INSERT INTO metrics (run_id, timestamp, metric_name, value, labels_json)
                                                 VALUES (?1, ?2, ?3, ?4, ?5)",
                                                rusqlite::params![
                                                    final_run_id.to_string(),
                                                    metric.timestamp.to_rfc3339(),
                                                    format!("{:?}", metric.metric),
                                                    metric.value,
                                                    labels_json,
                                                ],
                                            );
                                        }
                                    }
                                }
                                k6_offset = cur;
                            }
                        }
                    }

                    if let Some(status) = exited {
                        let final_status = if status.success() { "finished" } else { "failed" };
                        if let Ok(db) = db_arc.lock() {
                            let _ = db.execute(
                                "UPDATE runs SET status = ?1, finished_at = datetime('now') WHERE id = ?2",
                                rusqlite::params![final_status, final_run_id.to_string()],
                            );
                        }

                        let _ = app_handle.emit(
                            "run-finished",
                            serde_json::json!({
                                "run_id": final_run_id.to_string(),
                                "status": final_status,
                            }),
                        );
                        break;
                    }
                }
            }
        }

        // Remove from active runs map
        if let Ok(mut active) = active_runs_arc.lock() {
            active.remove(&final_run_id);
        }
    });

    Ok(final_run_id.to_string())
}

/// Stop a running test.
#[tauri::command]
async fn stop_run(state: tauri::State<'_, AppState>, run_id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&run_id).map_err(|e| e.to_string())?;
    let mut active = state.active_runs.lock().map_err(|e| e.to_string())?;

    if let Some(cancel_tx) = active.remove(&uuid) {
        let _ = cancel_tx.send(());
    }

    // Update DB status
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE runs SET status = 'stopped', finished_at = datetime('now') WHERE id = ?1",
        rusqlite::params![run_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get run history from SQLite.
#[tauri::command]
fn get_run_history(state: tauri::State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, engine, project, config_json, started_at, finished_at, status, summary_json
             FROM runs ORDER BY started_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let runs = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "engine": row.get::<_, String>(1)?,
                "project": row.get::<_, String>(2)?,
                "config": row.get::<_, String>(3)?,
                "started_at": row.get::<_, String>(4)?,
                "finished_at": row.get::<_, Option<String>>(5)?,
                "status": row.get::<_, String>(6)?,
                "summary": row.get::<_, Option<String>>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(runs)
}

/// Get stored metrics for a specific run from SQLite.
#[tauri::command]
fn get_run_metrics(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, run_id, timestamp, metric_name, value, labels_json
             FROM metrics WHERE run_id = ?1 ORDER BY id ASC LIMIT 1000",
        )
        .map_err(|e| e.to_string())?;

    let metrics = stmt
        .query_map(rusqlite::params![run_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "run_id": row.get::<_, String>(1)?,
                "timestamp": row.get::<_, String>(2)?,
                "metric_name": row.get::<_, String>(3)?,
                "value": row.get::<_, f64>(4)?,
                "labels": row.get::<_, Option<String>>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(metrics)
}

fn validate_script_path(path: &std::path::Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed_exts = ["py", "js", "ts", "rs", "json", "csv", "md", "txt"];
    if !allowed_exts.contains(&ext.as_str()) {
        return Err(format!(
            "Access denied: extension '.{}' is not permitted for test scripts",
            ext
        ));
    }
    Ok(())
}

/// Read a test script file from disk.
#[tauri::command]
async fn read_script(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    validate_script_path(&path)?;
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read script {file_path}: {e}"))
}

/// Save a test script file to disk.
#[tauri::command]
async fn save_script(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    validate_script_path(&path)?;
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to save script {file_path}: {e}"))
}

#[tauri::command]
fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<ProjectRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT id, name, description, target_host, default_engine, created_at, updated_at FROM projects ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ProjectRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                target_host: row.get(3)?,
                default_engine: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
fn create_project(
    state: tauri::State<'_, AppState>,
    name: String,
    target_host: String,
    default_engine: String,
    description: Option<String>,
) -> Result<ProjectRecord, String> {
    let name = name.trim().to_string();
    let target_host = target_host.trim().to_string();
    let description = description.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return Err("Project name must not be empty".into());
    }
    if target_host.is_empty() {
        return Err("Target host must not be empty".into());
    }
    validate_suite_engine(&default_engine)?;
    let id = format!("proj-{}", Uuid::new_v4());
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO projects (id, name, description, target_host, default_engine) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, description, target_host, default_engine],
    ).map_err(|e| e.to_string())?;
    let rec = db.query_row(
        "SELECT id, name, description, target_host, default_engine, created_at, updated_at FROM projects WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(ProjectRecord {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
            target_host: row.get(3)?, default_engine: row.get(4)?,
            created_at: row.get(5)?, updated_at: row.get(6)?,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(rec)
}

#[tauri::command]
fn update_project(
    state: tauri::State<'_, AppState>,
    id: String,
    name: Option<String>,
    target_host: Option<String>,
    default_engine: Option<String>,
) -> Result<ProjectRecord, String> {
    let name = name.map(|n| n.trim().to_string());
    let target_host = target_host.map(|h| h.trim().to_string());
    if let Some(ref n) = name {
        if n.is_empty() {
            return Err("Project name must not be empty".into());
        }
    }
    if let Some(ref h) = target_host {
        if h.is_empty() {
            return Err("Target host must not be empty".into());
        }
    }
    if let Some(ref e) = default_engine {
        validate_suite_engine(e)?;
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE projects SET name = COALESCE(?1, name), target_host = COALESCE(?2, target_host), default_engine = COALESCE(?3, default_engine), updated_at = datetime('now') WHERE id = ?4",
        rusqlite::params![name, target_host, default_engine, id],
    )
    .map_err(|e| e.to_string())?;
    let rec = db
        .query_row(
            "SELECT id, name, description, target_host, default_engine, created_at, updated_at FROM projects WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(ProjectRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    target_host: row.get(3)?,
                    default_engine: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|_| format!("Project not found: {id}"))?;
    Ok(rec)
}

#[tauri::command]
async fn delete_project(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let script_paths: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT script_path FROM test_suites WHERE project_id = ?1")
            .map_err(|e| e.to_string())?;
        let paths: Vec<String> = stmt
            .query_map(rusqlite::params![id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        paths
    };
    for script_path in script_paths {
        let _ = tokio::fs::remove_file(&script_path).await;
    }
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let changed = db
            .execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("Project not found: {id}"));
        }
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let _ = tokio::fs::remove_dir_all(app_data_dir.join("scripts").join(&id)).await;
    }
    Ok(())
}

#[tauri::command]
fn list_suites(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<SuiteRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, project_id, name, engine, script_path, config_json, created_at, updated_at FROM test_suites WHERE project_id = ?1 ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut suites = Vec::new();
    for row in rows.filter_map(|r| r.ok()) {
        let (id, project_id, name, engine, script_path, config_json, created_at, updated_at) = row;
        let Ok(config) = serde_json::from_str::<TestConfig>(&config_json) else {
            continue;
        };
        suites.push(SuiteRecord {
            id,
            project_id,
            name,
            engine,
            script_path,
            config,
            created_at,
            updated_at,
        });
    }
    Ok(suites)
}

#[tauri::command]
async fn create_suite(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    engine: String,
    script_content: String,
    config: TestConfig,
    visual_nodes: Option<serde_json::Value>,
) -> Result<SuiteRecord, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Suite name must not be empty".into());
    }
    validate_suite_engine(&engine)?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let exists: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = ?1",
                rusqlite::params![project_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err(format!("Project not found: {project_id}"));
        }
    }
    let suite_id = format!("suite-{}", Uuid::new_v4());
    let ext = script_extension_for_engine(&engine);
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {e}"))?;
    let script_dir = app_data_dir.join("scripts").join(&project_id);
    tokio::fs::create_dir_all(&script_dir)
        .await
        .map_err(|e| e.to_string())?;
    let script_file = script_dir.join(format!("{suite_id}.{ext}"));
    tokio::fs::write(&script_file, &script_content)
        .await
        .map_err(|e| e.to_string())?;
    let script_path = script_file.to_string_lossy().to_string();
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO test_suites (id, project_id, name, engine, script_path, config_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![suite_id, project_id, name, engine, script_path, config_json],
        )
        .map_err(|e| e.to_string())?;
        if let Some(nodes) = &visual_nodes {
            let nodes_json = serde_json::to_string(nodes).map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO visual_flows (suite_id, nodes_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(suite_id) DO UPDATE SET nodes_json = excluded.nodes_json, updated_at = datetime('now')",
                rusqlite::params![suite_id, nodes_json],
            )
            .map_err(|e| e.to_string())?;
        }
        let rec = db
            .query_row(
                "SELECT id, project_id, name, engine, script_path, config_json, created_at, updated_at FROM test_suites WHERE id = ?1",
                rusqlite::params![suite_id],
                |row| {
                    let config_json: String = row.get(5)?;
                    let config: TestConfig = serde_json::from_str(&config_json)
                        .map_err(|_| rusqlite::Error::InvalidColumnType(5, "config_json".into(), rusqlite::types::Type::Text))?;
                    Ok(SuiteRecord {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        name: row.get(2)?,
                        engine: row.get(3)?,
                        script_path: row.get(4)?,
                        config,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(rec)
    }
}

#[tauri::command]
async fn update_suite(
    _app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    name: Option<String>,
    script_content: Option<String>,
    config: Option<TestConfig>,
    visual_nodes: Option<serde_json::Value>,
) -> Result<SuiteRecord, String> {
    if let Some(ref n) = name {
        if n.trim().is_empty() {
            return Err("Suite name must not be empty".into());
        }
    }
    let (script_path, _engine): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT script_path, engine FROM test_suites WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Suite not found: {id}"))?
    };
    if let Some(ref content) = script_content {
        if let Some(parent) = std::path::Path::new(&script_path).parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        tokio::fs::write(&script_path, content)
            .await
            .map_err(|e| e.to_string())?;
    }
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(n) = &name {
            db.execute(
                "UPDATE test_suites SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![n, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(c) = &config {
            let config_json = serde_json::to_string(c).map_err(|e| e.to_string())?;
            db.execute(
                "UPDATE test_suites SET config_json = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![config_json, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if script_content.is_some() {
            db.execute(
                "UPDATE test_suites SET updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(nodes) = &visual_nodes {
            let nodes_json = serde_json::to_string(nodes).map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO visual_flows (suite_id, nodes_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(suite_id) DO UPDATE SET nodes_json = excluded.nodes_json, updated_at = datetime('now')",
                rusqlite::params![id, nodes_json],
            )
            .map_err(|e| e.to_string())?;
        }
        let rec = db
            .query_row(
                "SELECT id, project_id, name, engine, script_path, config_json, created_at, updated_at FROM test_suites WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    let config_json: String = row.get(5)?;
                    let config: TestConfig = serde_json::from_str(&config_json)
                        .map_err(|_| rusqlite::Error::InvalidColumnType(5, "config_json".into(), rusqlite::types::Type::Text))?;
                    Ok(SuiteRecord {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        name: row.get(2)?,
                        engine: row.get(3)?,
                        script_path: row.get(4)?,
                        config,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                    })
                },
            )
            .map_err(|_| format!("Suite not found: {id}"))?;
        Ok(rec)
    }
}

#[tauri::command]
async fn delete_suite(
    _app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let script_path: Option<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT script_path FROM test_suites WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok()
    };
    if let Some(path) = script_path {
        let _ = tokio::fs::remove_file(&path).await;
    }
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let changed = db
            .execute(
                "DELETE FROM test_suites WHERE id = ?1",
                rusqlite::params![id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("Suite not found: {id}"));
        }
    }
    Ok(())
}

#[tauri::command]
async fn get_suite(
    _app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<SuiteWithContent, String> {
    let (suite_id, project_id, name, engine, script_path, config_json, created_at, updated_at): (
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
    ) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id, project_id, name, engine, script_path, config_json, created_at, updated_at FROM test_suites WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .map_err(|_| format!("Suite not found: {id}"))?
    };
    let script_content = tokio::fs::read_to_string(&script_path)
        .await
        .unwrap_or_default();
    let config: TestConfig =
        serde_json::from_str(&config_json).map_err(|e| format!("Suite config is corrupt: {e}"))?;
    let visual_nodes: Option<serde_json::Value> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let nodes_json: Option<String> = db
            .query_row(
                "SELECT nodes_json FROM visual_flows WHERE suite_id = ?1",
                rusqlite::params![suite_id],
                |row| row.get(0),
            )
            .ok();
        nodes_json.and_then(|s| serde_json::from_str(&s).ok())
    };
    Ok(SuiteWithContent {
        id: suite_id,
        project_id,
        name,
        engine,
        script_path,
        config,
        created_at,
        updated_at,
        script_content,
        visual_nodes,
    })
}

#[tauri::command]
fn save_visual_flow(
    state: tauri::State<'_, AppState>,
    suite_id: String,
    nodes_json: String,
) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(&nodes_json)
        .map_err(|_| "Visual flow must be valid JSON".to_string())?;
    let canonical = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO visual_flows (suite_id, nodes_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(suite_id) DO UPDATE SET nodes_json = excluded.nodes_json, updated_at = datetime('now')",
        rusqlite::params![suite_id, canonical],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let runtime_context = Arc::new(std::sync::RwLock::new(RuntimeContext::default()));
            let runtime_root = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string());
            app.manage(runtime_commands::RuntimeCommandState::new(
                runtime_root,
                runtime_context.clone(),
            ));
            // Initialize SQLite database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("loom.db");
            let conn = Connection::open(&db_path).expect("Failed to open SQLite database");

            apply_pragmas(&conn).expect("Failed to apply SQLite pragmas");
            db::initialize(&conn).expect("Failed to initialize database schema");

            // Register all engines: Locust, Goose, k6
            let engines: Vec<Box<dyn LoadEngine>> = vec![
                Box::new(LocustEngine::new()),
                Box::new(GooseEngine::new()),
                Box::new(K6Engine::new()),
            ];

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                engines,
                active_runs: Arc::new(Mutex::new(HashMap::new())),
                runtime_context,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_engines,
            start_run,
            stop_run,
            get_run_history,
            get_run_metrics,
            read_script,
            save_script,
            list_projects,
            create_project,
            update_project,
            delete_project,
            list_suites,
            create_suite,
            update_suite,
            delete_suite,
            get_suite,
            save_visual_flow,
            runtime_commands::get_runtime_status,
            runtime_commands::install_runtimes,
            runtime_commands::cancel_runtime_installation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Loom");
}

#[cfg(test)]
mod ipc_shape_tests {
    use super::*;

    #[test]
    fn script_extension_mapping_covers_all_engines() {
        assert_eq!(script_extension_for_engine("locust"), "py");
        assert_eq!(script_extension_for_engine("k6"), "js");
        assert_eq!(script_extension_for_engine("goose"), "rs");
    }

    #[test]
    fn rejects_unsupported_engine_before_touching_disk() {
        let err = validate_suite_engine("jmeter").unwrap_err();
        assert!(err.contains("Unsupported engine"));
    }

    #[test]
    fn pragmas_enable_foreign_keys() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        let on: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(on, 1);
    }
}
