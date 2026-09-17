use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use engine_core::*;
use engine_goose::GooseEngine;
use engine_k6::K6Engine;
use engine_locust::LocustEngine;
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

mod db;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/// Application state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub engines: Vec<Box<dyn LoadEngine>>,
    pub active_runs: Arc<Mutex<HashMap<Uuid, tokio::sync::oneshot::Sender<()>>>>,
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// List all registered engines and their availability.
#[tauri::command]
fn list_engines(state: tauri::State<'_, AppState>) -> Vec<EngineInfo> {
    state.engines.iter().map(|e| e.info()).collect()
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
    match engine.detect() {
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
        .prepare_workspace(&config, &run_dir)
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
async fn stop_run(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> Result<(), String> {
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
fn get_run_history(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
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

/// Read a test script file from disk.
#[tauri::command]
async fn read_script(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read script {file_path}: {e}"))
}

/// Save a test script file to disk.
#[tauri::command]
async fn save_script(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to save script {file_path}: {e}"))
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize SQLite database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("loom.db");
            let conn =
                Connection::open(&db_path).expect("Failed to open SQLite database");

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Loom");
}
