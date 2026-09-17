//! # engine-goose
//!
//! Goose engine adapter for Loom. Implements the `LoadEngine` trait from `engine-core`.
//!
//! ## Invocation
//!
//! Goose runs as a compiled Rust load test binary or `goose` CLI:
//!
//! ```text
//! goose --host <target> --users <N> --hatch-rate <N> --run-time <duration>
//! ```
//!
//! Goose prints periodic progress to stdout. This adapter parses those lines
//! into `NormalizedMetric` data points.

use std::collections::HashMap;
use std::path::Path;

use async_trait::async_trait;
use chrono::Utc;
use engine_core::*;
use futures::stream::BoxStream;
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

pub mod worker;
pub use worker::run_worker;

/// Goose engine adapter — Core tier (MIT OR Apache-2.0).
pub struct GooseEngine;

impl GooseEngine {
    pub fn new() -> Self {
        GooseEngine
    }

    /// Parse a stdout line from Goose to extract metrics if present.
    ///
    /// Matches lines like:
    /// `[users: 10, rps: 45.2, errors: 0]` or
    /// `Requests: 120 | RPS: 24.0 | Failures: 0 | P50: 15ms | P95: 35ms`
    pub fn parse_stdout_line(line: &str, run_id: Uuid) -> Vec<NormalizedMetric> {
        let mut metrics = Vec::new();
        let now = Utc::now();
        let trimmed = line.trim();

        if trimmed.is_empty() {
            return metrics;
        }

        let mut rps: Option<f64> = None;
        let mut users: Option<f64> = None;
        let mut errors: Option<f64> = None;
        let mut latency: Option<f64> = None;

        // Pattern matching on common Goose output formats
        let lower = trimmed.to_lowercase();
        for part in lower.split(|c: char| c == ',' || c == '|' || c == ';') {
            let part = part.trim();
            if part.starts_with("rps:") || part.starts_with("req/s:") {
                let val_str = part.split(':').nth(1).unwrap_or("").trim();
                if let Ok(v) = val_str.trim_end_matches("/s").parse::<f64>() {
                    rps = Some(v);
                }
            } else if part.starts_with("users:") || part.starts_with("clients:") {
                let val_str = part.split(':').nth(1).unwrap_or("").trim();
                if let Ok(v) = val_str.parse::<f64>() {
                    users = Some(v);
                }
            } else if part.starts_with("errors:") || part.starts_with("fail:") || part.starts_with("failures:") {
                let val_str = part.split(':').nth(1).unwrap_or("").trim();
                if let Ok(v) = val_str.parse::<f64>() {
                    errors = Some(v);
                }
            } else if part.starts_with("p95:") || part.starts_with("latency:") {
                let val_str = part.split(':').nth(1).unwrap_or("").trim();
                if let Ok(v) = val_str.trim_end_matches("ms").trim().parse::<f64>() {
                    latency = Some(v);
                }
            }
        }

        let base_labels = HashMap::new();

        if let Some(v) = users {
            metrics.push(NormalizedMetric {
                timestamp: now,
                engine: "goose".to_string(),
                run_id,
                metric: MetricKind::ActiveUsers,
                value: v,
                labels: base_labels.clone(),
            });
        }

        if let Some(v) = rps {
            metrics.push(NormalizedMetric {
                timestamp: now,
                engine: "goose".to_string(),
                run_id,
                metric: MetricKind::RequestsPerSecond,
                value: v,
                labels: base_labels.clone(),
            });
        }

        if let Some(v) = errors {
            metrics.push(NormalizedMetric {
                timestamp: now,
                engine: "goose".to_string(),
                run_id,
                metric: MetricKind::FailedRequests,
                value: v,
                labels: base_labels.clone(),
            });
        }

        if let Some(v) = latency {
            let mut labels = base_labels;
            labels.insert("percentile".to_string(), "p95".to_string());
            metrics.push(NormalizedMetric {
                timestamp: now,
                engine: "goose".to_string(),
                run_id,
                metric: MetricKind::LatencyMs,
                value: v,
                labels,
            });
        }

        metrics
    }
}

impl Default for GooseEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LoadEngine for GooseEngine {
    fn id(&self) -> &'static str {
        "goose"
    }

    fn display_name(&self) -> &'static str {
        "Goose"
    }

    fn engine_language(&self) -> &'static str {
        "Rust"
    }

    fn license(&self) -> &'static str {
        "MIT OR Apache-2.0"
    }

    fn license_tier(&self) -> LicenseTier {
        LicenseTier::Core
    }

    fn supported_script_languages(&self) -> Vec<&'static str> {
        vec!["Rust"]
    }

    fn detect(&self) -> EngineAvailability {
        if let Ok(path) = which::which("goose") {
            let version = std::process::Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .map(|s| s.trim().to_string());
            EngineAvailability::Ready { version }
        } else {
            // Native embedded Goose engine is ready out-of-the-box (zero install needed)
            EngineAvailability::Ready {
                version: Some("0.17.2 (Embedded Native)".to_string()),
            }
        }
    }

    fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError> {
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

        let duration_secs = parse_duration_secs(&cfg.load_profile.duration)?;

        let (binary_path, args) = if let Ok(goose_path) = which::which("goose") {
            let report_file = run_dir.join("report.html");
            let args = vec![
                "--host".to_string(),
                cfg.target.host.clone(),
                "--users".to_string(),
                cfg.load_profile.users.to_string(),
                "--hatch-rate".to_string(),
                cfg.load_profile.spawn_rate.to_string(),
                "--run-time".to_string(),
                format!("{duration_secs}s"),
                "--report-file".to_string(),
                report_file.to_string_lossy().to_string(),
            ];
            (goose_path, args)
        } else {
            // Use Loom self-binary in embedded worker mode
            let self_exe = std::env::current_exe().map_err(|e| {
                EngineError::Other(format!("Failed to locate current Loom binary: {e}"))
            })?;
            let args = vec![
                "--loom-worker".to_string(),
                "goose".to_string(),
                "--host".to_string(),
                cfg.target.host.clone(),
                "--users".to_string(),
                cfg.load_profile.users.to_string(),
                "--spawn-rate".to_string(),
                cfg.load_profile.spawn_rate.to_string(),
                "--duration".to_string(),
                format!("{duration_secs}s"),
            ];
            (self_exe, args)
        };

        Ok(PreparedJob {
            run_id: Uuid::new_v4(),
            work_dir: run_dir.to_path_buf(),
            binary_path,
            args,
            env: HashMap::new(),
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
            .map_err(|e| EngineError::LaunchFailed(format!("Failed to spawn goose: {e}")))?;

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
        let stdout = handle.child.stdout.take();

        let stream = async_stream::stream! {
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let metrics = Self::parse_stdout_line(&line, run_id);
                    for m in metrics {
                        yield Ok(m);
                    }
                }
            }
        };

        Box::pin(stream)
    }

    async fn stop(&self, handle: &mut RunHandle) -> Result<RunSummary, EngineError> {
        let _ = handle.child.kill().await;
        let _ = handle.child.wait().await;

        let now = Utc::now();
        Ok(RunSummary {
            run_id: handle.run_id,
            engine: "goose".to_string(),
            started_at: now,
            finished_at: now,
            total_requests: 0,
            failed_requests: 0,
            avg_latency_ms: 0.0,
            p50_latency_ms: 0.0,
            p95_latency_ms: 0.0,
            p99_latency_ms: 0.0,
            rps: 0.0,
            error_rate: 0.0,
        })
    }

    fn cleanup(&self, _job: &PreparedJob) -> Result<(), EngineError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_goose_engine_info() {
        let engine = GooseEngine::new();
        assert_eq!(engine.id(), "goose");
        assert_eq!(engine.display_name(), "Goose");
        assert_eq!(engine.license(), "MIT OR Apache-2.0");
        assert_eq!(engine.license_tier(), LicenseTier::Core);
        assert_eq!(engine.engine_language(), "Rust");
    }

    #[test]
    fn test_parse_stdout_line() {
        let run_id = Uuid::new_v4();
        let line = "Users: 15 | RPS: 120.5 | Errors: 2 | P95: 42ms";
        let metrics = GooseEngine::parse_stdout_line(line, run_id);

        assert_eq!(metrics.len(), 4);
        assert_eq!(metrics[0].metric, MetricKind::ActiveUsers);
        assert_eq!(metrics[0].value, 15.0);
        assert_eq!(metrics[1].metric, MetricKind::RequestsPerSecond);
        assert_eq!(metrics[1].value, 120.5);
        assert_eq!(metrics[2].metric, MetricKind::FailedRequests);
        assert_eq!(metrics[2].value, 2.0);
        assert_eq!(metrics[3].metric, MetricKind::LatencyMs);
        assert_eq!(metrics[3].value, 42.0);
    }

    #[test]
    fn test_validate_config() {
        let engine = GooseEngine::new();
        let valid_cfg = TestConfig {
            project_name: "goose_proj".to_string(),
            engine: "goose".to_string(),
            script_path: PathBuf::from("dummy"),
            load_profile: LoadProfile {
                users: 10,
                spawn_rate: 2,
                duration: "30s".to_string(),
            },
            target: TargetConfig {
                host: "http://localhost:8080".to_string(),
                headers: None,
            },
        };
        assert!(engine.validate_config(&valid_cfg).is_ok());

        let mut invalid_cfg = valid_cfg.clone();
        invalid_cfg.target.host = "".to_string();
        assert!(engine.validate_config(&invalid_cfg).is_err());
    }
}
