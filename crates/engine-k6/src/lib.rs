//! # engine-k6
//!
//! k6 engine adapter for Loom. Implements the `LoadEngine` trait from `engine-core`.
//!
//! ## License & Distribution Boundary
//!
//! k6 is licensed under AGPL-3.0-only. Per Loom's license architecture:
//! - This crate belongs to the `Plugin` license tier.
//! - Loom NEVER distributes, bundles, downloads, or statically/dynamically links
//!   the k6 binary.
//! - The user must install k6 themselves (e.g. `winget install k6` or `brew install k6`).
//! - Communication happens strictly via process boundary (subprocess invocation) and
//!   file tailing / stdout streaming.

use std::collections::HashMap;
use std::path::Path;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use engine_core::*;
use futures::stream::BoxStream;
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

/// k6 engine adapter — Plugin tier (AGPL-3.0-only).
pub struct K6Engine;

impl K6Engine {
    pub fn new() -> Self {
        K6Engine
    }

    /// Parse a single JSON line from k6's JSON output stream.
    ///
    /// k6 JSON line format:
    /// `{"type":"Point","data":{"time":"2023-01-01T00:00:00Z","value":123.4,"tags":{...}},"metric":"http_req_duration"}`
    pub fn parse_json_line(line: &str, run_id: Uuid) -> Option<NormalizedMetric> {
        let v: serde_json::Value = serde_json::from_str(line).ok()?;
        let metric_name = v.get("metric")?.as_str()?;
        let data = v.get("data")?;
        let value = data.get("value")?.as_f64()?;
        let timestamp = data
            .get("time")
            .and_then(|t| t.as_str())
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let mut labels = HashMap::new();
        if let Some(tags) = data.get("tags").and_then(|t| t.as_object()) {
            for (k, val) in tags {
                if let Some(s) = val.as_str() {
                    labels.insert(k.clone(), s.to_string());
                }
            }
        }

        let metric_kind = match metric_name {
            "http_reqs" => MetricKind::RequestsPerSecond,
            "http_req_duration" => MetricKind::LatencyMs,
            "http_req_failed" => MetricKind::FailedRequests,
            "vus" | "vus_active" => MetricKind::ActiveUsers,
            _ => return None,
        };

        Some(NormalizedMetric {
            timestamp,
            engine: "k6".to_string(),
            run_id,
            metric: metric_kind,
            value,
            labels,
        })
    }
}

impl Default for K6Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LoadEngine for K6Engine {
    fn id(&self) -> &'static str {
        "k6"
    }

    fn display_name(&self) -> &'static str {
        "k6"
    }

    fn engine_language(&self) -> &'static str {
        "Go"
    }

    fn license(&self) -> &'static str {
        "AGPL-3.0-only"
    }

    fn license_tier(&self) -> LicenseTier {
        LicenseTier::Plugin
    }

    fn supported_script_languages(&self) -> Vec<&'static str> {
        vec!["JavaScript", "TypeScript"]
    }

    fn detect(&self) -> EngineAvailability {
        match which::which("k6") {
            Ok(path) => {
                let version = std::process::Command::new(&path)
                    .arg("version")
                    .output()
                    .ok()
                    .and_then(|out| String::from_utf8(out.stdout).ok())
                    .map(|s| s.trim().to_string());
                EngineAvailability::Ready { version }
            }
            Err(_) => EngineAvailability::NotInstalled {
                install_hint: "Install k6:\n  Windows: winget install k6.k6\n  macOS: brew install k6\n  Linux / Official: https://grafana.com/docs/k6/latest/set-up/install-k6/".to_string(),
            },
        }
    }

    fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError> {
        if !cfg.script_path.exists() {
            return Err(EngineError::Validation(format!(
                "k6 script file not found: {}",
                cfg.script_path.display()
            )));
        }

        let is_js = cfg
            .script_path
            .extension()
            .is_some_and(|ext| ext == "js" || ext == "ts");
        if !is_js {
            return Err(EngineError::Validation(
                "k6 test scripts must be JavaScript or TypeScript (.js, .ts)".to_string(),
            ));
        }

        if cfg.target.host.is_empty() {
            return Err(EngineError::Validation(
                "Target host must not be empty".to_string(),
            ));
        }

        if cfg.load_profile.users == 0 {
            return Err(EngineError::Validation(
                "VUs (users) must be > 0".to_string(),
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

        let k6_path = which::which("k6").map_err(|_| EngineError::NotInstalled {
            install_hint: "k6 binary not found on PATH".to_string(),
        })?;

        let duration_secs = parse_duration_secs(&cfg.load_profile.duration)?;
        let json_out = run_dir.join("metrics.json");

        let args = vec![
            "run".to_string(),
            cfg.script_path.to_string_lossy().to_string(),
            "--vus".to_string(),
            cfg.load_profile.users.to_string(),
            "--duration".to_string(),
            format!("{duration_secs}s"),
            "--out".to_string(),
            format!("json={}", json_out.to_string_lossy()),
        ];

        let mut env = HashMap::new();
        env.insert("TARGET_HOST".to_string(), cfg.target.host.clone());

        Ok(PreparedJob {
            run_id: Uuid::new_v4(),
            work_dir: run_dir.to_path_buf(),
            binary_path: k6_path,
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
            .map_err(|e| EngineError::LaunchFailed(format!("Failed to spawn k6: {e}")))?;

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
        let json_out = handle.work_dir.join("metrics.json");

        let stream = async_stream::stream! {
            let mut file_offset: u64 = 0;

            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                if !json_out.exists() {
                    continue;
                }

                if let Ok(file) = tokio::fs::File::open(&json_out).await {
                    let reader = BufReader::new(file);
                    let mut lines = reader.lines();
                    let mut current_offset: u64 = 0;

                    while let Ok(Some(line)) = lines.next_line().await {
                        current_offset += line.len() as u64 + 1;
                        if current_offset <= file_offset {
                            continue;
                        }

                        if let Some(metric) = Self::parse_json_line(&line, run_id) {
                            yield Ok(metric);
                        }
                    }
                    file_offset = current_offset;
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
            engine: "k6".to_string(),
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

    #[test]
    fn test_k6_engine_info() {
        let engine = K6Engine::new();
        assert_eq!(engine.id(), "k6");
        assert_eq!(engine.display_name(), "k6");
        assert_eq!(engine.license(), "AGPL-3.0-only");
        assert_eq!(engine.license_tier(), LicenseTier::Plugin);
        assert_eq!(engine.engine_language(), "Go");
    }

    #[test]
    fn test_k6_not_installed_hint() {
        let engine = K6Engine::new();
        let availability = engine.detect();
        if let EngineAvailability::NotInstalled { install_hint } = availability {
            assert!(install_hint.contains("winget") || install_hint.contains("brew") || install_hint.contains("k6"));
        }
    }

    #[test]
    fn test_parse_json_line() {
        let run_id = Uuid::new_v4();
        let line = r#"{"type":"Point","data":{"time":"2023-01-01T00:00:00Z","value":52.4,"tags":{"status":"200"}},"metric":"http_req_duration"}"#;
        let metric = K6Engine::parse_json_line(line, run_id).expect("Should parse");

        assert_eq!(metric.metric, MetricKind::LatencyMs);
        assert_eq!(metric.value, 52.4);
        assert_eq!(metric.engine, "k6");
        assert_eq!(metric.labels.get("status"), Some(&"200".to_string()));
    }
}
