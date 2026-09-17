//! # engine-locust
//!
//! Locust engine adapter for Loom. Implements the `LoadEngine` trait from `engine-core`.
//!
//! ## Invocation
//!
//! ```text
//! locust -f <script.py> --headless --host <target> \
//!   --users <N> --spawn-rate <N> --run-time <duration>s \
//!   --csv <run_dir>/stats
//! ```
//!
//! ## Real-time metrics (design decision)
//!
//! Locust's headless mode disables its web UI and stats API. The `--csv` flag writes
//! `stats_stats_history.csv` during the run (overwritten periodically). There is no
//! clean streaming channel from a headless Locust process.
//!
//! This adapter:
//! 1. Launches Locust with `--csv <run_dir>/stats` (no `--json`, no web UI).
//! 2. Polls `<run_dir>/stats_stats_history.csv` on a 1-second timer.
//! 3. Parses new rows, diffs against the last seen row count, and emits
//!    `NormalizedMetric` events for each new sample.
//! 4. Accepts a 1–2 second lag between reality and the UI as a known limitation.

use std::collections::HashMap;
use std::path::Path;

use async_trait::async_trait;
use chrono::Utc;
use engine_core::*;
use futures::stream::BoxStream;
use uuid::Uuid;

/// Locust engine adapter — Core tier (MIT license).
pub struct LocustEngine;

impl LocustEngine {
    pub fn new() -> Self {
        LocustEngine
    }

    /// Parse Locust stats_stats_history.csv rows into normalized metrics.
    ///
    /// CSV columns (Locust 2.x):
    /// Type, Name, User count, Timestamp, Requests/s, Failures/s,
    /// 50%, 66%, 75%, 80%, 90%, 95%, 98%, 99%, 99.9%, 99.99%, 100%,
    /// Total Request Count, Total Failure Count, Total Median Response Time,
    /// Total Average Response Time, Total Min Response Time, Total Max Response Time,
    /// Total Average Content Size
    pub fn parse_stats_history_row(
        row: &csv::StringRecord,
        run_id: Uuid,
    ) -> Vec<NormalizedMetric> {
        let mut metrics = Vec::new();
        let now = Utc::now();

        // We only care about "Aggregated" rows for overall stats
        let request_type = row.get(0).unwrap_or("").trim();
        let name = row.get(1).unwrap_or("").trim();
        if name != "Aggregated" {
            return metrics;
        }

        let user_count: f64 = row.get(2).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let rps: f64 = row.get(4).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let _failures_per_sec: f64 = row.get(5).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let p50: f64 = row.get(6).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let p95: f64 = row.get(11).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let p99: f64 = row.get(13).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let total_requests: f64 = row.get(17).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        let total_failures: f64 = row.get(18).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);

        let base_labels: HashMap<String, String> = HashMap::from([
            ("type".to_string(), request_type.to_string()),
        ]);

        // Active users
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::ActiveUsers,
            value: user_count,
            labels: base_labels.clone(),
        });

        // RPS
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::RequestsPerSecond,
            value: rps,
            labels: base_labels.clone(),
        });

        // Total requests
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::RequestsTotal,
            value: total_requests,
            labels: base_labels.clone(),
        });

        // Failed requests
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::FailedRequests,
            value: total_failures,
            labels: base_labels.clone(),
        });

        // Error rate
        let error_rate = if total_requests > 0.0 {
            total_failures / total_requests
        } else {
            0.0
        };
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::ErrorRate,
            value: error_rate,
            labels: base_labels.clone(),
        });

        // Latency p50
        let mut p50_labels = base_labels.clone();
        p50_labels.insert("percentile".to_string(), "p50".to_string());
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::LatencyMs,
            value: p50,
            labels: p50_labels,
        });

        // Latency p95
        let mut p95_labels = base_labels.clone();
        p95_labels.insert("percentile".to_string(), "p95".to_string());
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::LatencyMs,
            value: p95,
            labels: p95_labels,
        });

        // Latency p99
        let mut p99_labels = base_labels;
        p99_labels.insert("percentile".to_string(), "p99".to_string());
        metrics.push(NormalizedMetric {
            timestamp: now,
            engine: "locust".to_string(),
            run_id,
            metric: MetricKind::LatencyMs,
            value: p99,
            labels: p99_labels,
        });

        metrics
    }
}

impl Default for LocustEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LoadEngine for LocustEngine {
    fn id(&self) -> &'static str {
        "locust"
    }

    fn display_name(&self) -> &'static str {
        "Locust"
    }

    fn engine_language(&self) -> &'static str {
        "Python"
    }

    fn license(&self) -> &'static str {
        "MIT"
    }

    fn license_tier(&self) -> LicenseTier {
        LicenseTier::Core
    }

    fn supported_script_languages(&self) -> Vec<&'static str> {
        vec!["Python"]
    }

    fn detect(&self) -> EngineAvailability {
        if let Ok(path) = which::which("locust") {
            let version = std::process::Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .map(|s| s.trim().to_string());
            return EngineAvailability::Ready { version };
        }

        // Fallback: check python / python3 -m locust
        for py in &["python", "python3"] {
            if let Ok(path) = which::which(py) {
                if let Ok(out) = std::process::Command::new(&path)
                    .args(["-m", "locust", "--version"])
                    .output()
                {
                    if out.status.success() {
                        let version = String::from_utf8(out.stdout).ok().map(|s| s.trim().to_string());
                        return EngineAvailability::Ready { version };
                    }
                }
            }
        }

        if std::path::Path::new("vendor/locust").exists() {
            return EngineAvailability::Ready {
                version: Some("2.44.1 (Vendored)".to_string()),
            };
        }

        EngineAvailability::NotInstalled {
            install_hint: "Install Locust via pip:\n  pip install locust\n\nOr see: https://docs.locust.io/en/stable/installation.html".to_string(),
        }
    }

    fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError> {
        if !cfg.script_path.exists() {
            return Err(EngineError::Validation(format!(
                "Script file not found: {}",
                cfg.script_path.display()
            )));
        }

        if !cfg.script_path.extension().is_some_and(|ext| ext == "py") {
            return Err(EngineError::Validation(
                "Locust scripts must be Python files (.py)".to_string(),
            ));
        }

        if cfg.target.host.is_empty() {
            return Err(EngineError::Validation(
                "Target host must not be empty".to_string(),
            ));
        }

        if cfg.load_profile.users == 0 {
            return Err(EngineError::Validation(
                "Number of users must be > 0".to_string(),
            ));
        }

        parse_duration_secs(&cfg.load_profile.duration)?;

        Ok(())
    }

    fn prepare_workspace(
        &self,
        cfg: &TestConfig,
        run_dir: &Path,
    ) -> Result<PreparedJob, EngineError> {
        std::fs::create_dir_all(run_dir)?;

        let (binary_path, base_args, env) = if let Ok(locust_path) = which::which("locust") {
            (locust_path, vec![], HashMap::new())
        } else if let Ok(py_path) = which::which("python") {
            let mut env = HashMap::new();
            if std::path::Path::new("vendor/locust").exists() {
                if let Ok(abs) = std::fs::canonicalize("vendor/locust") {
                    env.insert("PYTHONPATH".to_string(), abs.to_string_lossy().to_string());
                }
            }
            (py_path, vec!["-m".to_string(), "locust".to_string()], env)
        } else if let Ok(py3_path) = which::which("python3") {
            let mut env = HashMap::new();
            if std::path::Path::new("vendor/locust").exists() {
                if let Ok(abs) = std::fs::canonicalize("vendor/locust") {
                    env.insert("PYTHONPATH".to_string(), abs.to_string_lossy().to_string());
                }
            }
            (py3_path, vec!["-m".to_string(), "locust".to_string()], env)
        } else {
            return Err(EngineError::NotInstalled {
                install_hint: "locust or python not found on PATH".to_string(),
            });
        };

        let duration_secs = parse_duration_secs(&cfg.load_profile.duration)?;
        let stats_prefix = run_dir.join("stats");

        let mut args = base_args;
        args.extend(vec![
            "-f".to_string(),
            cfg.script_path.to_string_lossy().to_string(),
            "--headless".to_string(),
            "--host".to_string(),
            cfg.target.host.clone(),
            "--users".to_string(),
            cfg.load_profile.users.to_string(),
            "--spawn-rate".to_string(),
            cfg.load_profile.spawn_rate.to_string(),
            "--run-time".to_string(),
            format!("{duration_secs}s"),
            "--csv".to_string(),
            stats_prefix.to_string_lossy().to_string(),
        ]);

        Ok(PreparedJob {
            run_id: Uuid::new_v4(),
            work_dir: run_dir.to_path_buf(),
            binary_path,
            args,
            env,
        })
    }

    async fn launch(&self, job: &PreparedJob) -> Result<RunHandle, EngineError> {
        let child = tokio::process::Command::new(&job.binary_path)
            .args(&job.args)
            .envs(&job.env)
            .current_dir(&job.work_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| EngineError::LaunchFailed(format!("Failed to spawn locust: {e}")))?;

        Ok(RunHandle {
            run_id: job.run_id,
            child,
            work_dir: job.work_dir.clone(),
        })
    }

    fn stream_metrics(
        &self,
        handle: &mut RunHandle,
    ) -> BoxStream<'_, Result<NormalizedMetric, EngineError>> {
        let run_id = handle.run_id;
        let stats_file = handle.work_dir.join("stats_stats_history.csv");

        // Poll the CSV file on a 1-second interval, diff against last seen row count
        let stream = async_stream::stream! {
            let mut last_row_count: usize = 0;

            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                if !stats_file.exists() {
                    continue;
                }

                let content = match tokio::fs::read_to_string(&stats_file).await {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                let mut reader = csv::ReaderBuilder::new()
                    .has_headers(true)
                    .from_reader(content.as_bytes());

                let records: Vec<csv::StringRecord> = reader
                    .records()
                    .filter_map(|r| r.ok())
                    .collect();

                let new_rows = if records.len() > last_row_count {
                    &records[last_row_count..]
                } else {
                    continue;
                };

                for row in new_rows {
                    let metrics = Self::parse_stats_history_row(row, run_id);
                    for metric in metrics {
                        yield Ok(metric);
                    }
                }

                last_row_count = records.len();
            }
        };

        Box::pin(stream)
    }

    async fn stop(&self, handle: &mut RunHandle) -> Result<RunSummary, EngineError> {
        // Send kill signal to the locust process
        let _ = handle.child.kill().await;
        let _ = handle.child.wait().await;

        // Try to read the final stats CSV
        let stats_file = handle.work_dir.join("stats_stats.csv");
        let summary = if stats_file.exists() {
            let content = tokio::fs::read_to_string(&stats_file)
                .await
                .unwrap_or_default();
            parse_final_stats(&content, handle.run_id)
        } else {
            default_summary(handle.run_id)
        };

        Ok(summary)
    }

    fn cleanup(&self, job: &PreparedJob) -> Result<(), EngineError> {
        // Optionally clean up the work directory
        // For now, keep it so users can inspect raw outputs
        let _ = &job.work_dir;
        Ok(())
    }
}

/// Parse Locust's final stats_stats.csv into a RunSummary.
fn parse_final_stats(csv_content: &str, run_id: Uuid) -> RunSummary {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(csv_content.as_bytes());

    let mut total_requests: u64 = 0;
    let mut failed_requests: u64 = 0;
    let mut avg_latency: f64 = 0.0;
    let mut p50: f64 = 0.0;
    let mut p95: f64 = 0.0;
    let mut p99: f64 = 0.0;
    let mut rps: f64 = 0.0;

    for record in reader.records().flatten() {
        let name = record.get(1).unwrap_or("").trim();
        if name == "Aggregated" {
            total_requests = record.get(2).and_then(|v| v.trim().parse().ok()).unwrap_or(0);
            failed_requests = record.get(3).and_then(|v| v.trim().parse().ok()).unwrap_or(0);
            avg_latency = record.get(5).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
            p50 = record.get(6).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
            p95 = record.get(11).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
            p99 = record.get(13).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
            rps = record.get(9).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0);
        }
    }

    let error_rate = if total_requests > 0 {
        failed_requests as f64 / total_requests as f64
    } else {
        0.0
    };

    RunSummary {
        run_id,
        engine: "locust".to_string(),
        started_at: Utc::now(),
        finished_at: Utc::now(),
        total_requests,
        failed_requests,
        avg_latency_ms: avg_latency,
        p50_latency_ms: p50,
        p95_latency_ms: p95,
        p99_latency_ms: p99,
        rps,
        error_rate,
    }
}

fn default_summary(run_id: Uuid) -> RunSummary {
    RunSummary {
        run_id,
        engine: "locust".to_string(),
        started_at: Utc::now(),
        finished_at: Utc::now(),
        total_requests: 0,
        failed_requests: 0,
        avg_latency_ms: 0.0,
        p50_latency_ms: 0.0,
        p95_latency_ms: 0.0,
        p99_latency_ms: 0.0,
        rps: 0.0,
        error_rate: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_detect() {
        let engine = LocustEngine::new();
        let availability = engine.detect();
        // We just test that detect doesn't panic — whether it finds locust
        // depends on the host machine
        match availability {
            EngineAvailability::Ready { .. } => println!("Locust found"),
            EngineAvailability::NotInstalled { install_hint } => {
                assert!(!install_hint.is_empty());
                println!("Locust not found (expected in CI): {install_hint}");
            }
        }
    }

    #[test]
    fn test_engine_info() {
        let engine = LocustEngine::new();
        assert_eq!(engine.id(), "locust");
        assert_eq!(engine.display_name(), "Locust");
        assert_eq!(engine.license(), "MIT");
        assert_eq!(engine.license_tier(), LicenseTier::Core);
        assert_eq!(engine.engine_language(), "Python");
    }

    #[test]
    fn test_validate_config_missing_script() {
        let engine = LocustEngine::new();
        let cfg = TestConfig {
            project_name: "test".to_string(),
            engine: "locust".to_string(),
            script_path: PathBuf::from("/nonexistent/script.py"),
            load_profile: LoadProfile {
                users: 10,
                spawn_rate: 1,
                duration: "30s".to_string(),
            },
            target: TargetConfig {
                host: "http://localhost:8080".to_string(),
                headers: None,
            },
        };
        assert!(engine.validate_config(&cfg).is_err());
    }

    #[test]
    fn test_parse_stats_history_row() {
        let record = csv::StringRecord::from(vec![
            "GET",           // Type
            "Aggregated",    // Name
            "10",            // User count
            "1694000000",    // Timestamp
            "45.5",          // Requests/s
            "0.5",           // Failures/s
            "12.0",          // 50%
            "15.0",          // 66%
            "18.0",          // 75%
            "20.0",          // 80%
            "25.0",          // 90%
            "30.0",          // 95%
            "35.0",          // 98%
            "40.0",          // 99%
            "45.0",          // 99.9%
            "50.0",          // 99.99%
            "55.0",          // 100%
            "1000",          // Total Request Count
            "5",             // Total Failure Count
            "12.0",          // Total Median Response Time
            "15.0",          // Total Average Response Time
            "1.0",           // Total Min Response Time
            "100.0",         // Total Max Response Time
            "512",           // Total Average Content Size
        ]);

        let run_id = Uuid::new_v4();
        let metrics = LocustEngine::parse_stats_history_row(&record, run_id);

        assert_eq!(metrics.len(), 8); // users, rps, total, failed, error_rate, p50, p95, p99

        // Check RPS metric
        let rps = metrics.iter().find(|m| m.metric == MetricKind::RequestsPerSecond).unwrap();
        assert!((rps.value - 45.5).abs() < f64::EPSILON);

        // Check active users
        let users = metrics.iter().find(|m| m.metric == MetricKind::ActiveUsers).unwrap();
        assert!((users.value - 10.0).abs() < f64::EPSILON);

        // Check error rate
        let err = metrics.iter().find(|m| m.metric == MetricKind::ErrorRate).unwrap();
        assert!((err.value - 0.005).abs() < 0.001); // 5/1000
    }
}
