//! # engine-core
//!
//! Core trait and types for Loom's load-testing engine adapters.
//!
//! Every engine — Core (permissive license, bundled) or Plugin (copyleft, BYO binary)
//! — implements the `LoadEngine` trait. Engines are ALWAYS invoked as subprocesses.
//! No engine is ever linked, embedded, or compiled into Loom's binary.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::stream::BoxStream;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// License & availability
// ---------------------------------------------------------------------------

/// Whether this engine is bundled with Loom or must be installed by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LicenseTier {
    /// Permissive license (MIT, Apache-2.0, BSD). Bundled with Loom.
    Core,
    /// Copyleft license (GPL, AGPL). User must install the binary separately.
    /// Loom ships only the adapter code, never the engine binary.
    Plugin,
}

/// Result of checking whether an engine's binary is available on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EngineAvailability {
    /// Engine binary found and ready to use.
    Ready { version: Option<String> },
    /// Engine binary not found. `install_hint` tells the user how to install it.
    NotInstalled { install_hint: String },
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// A load-test configuration, deserialized from `.loom/config.yaml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConfig {
    pub project_name: String,
    pub engine: String,
    pub script_path: PathBuf,
    pub load_profile: LoadProfile,
    pub target: TargetConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadProfile {
    pub users: u32,
    pub spawn_rate: u32,
    pub duration: String, // e.g. "30s", "5m"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetConfig {
    pub host: String,
    pub headers: Option<HashMap<String, String>>,
}

// ---------------------------------------------------------------------------
// Job & run types
// ---------------------------------------------------------------------------

/// A prepared job ready to launch — resolved paths, computed args.
#[derive(Debug, Clone)]
pub struct PreparedJob {
    pub run_id: Uuid,
    pub work_dir: PathBuf,
    pub binary_path: PathBuf,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

/// Handle to a running subprocess.
pub struct RunHandle {
    pub run_id: Uuid,
    pub child: tokio::process::Child,
    pub work_dir: PathBuf,
}

/// Summary of a completed test run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSummary {
    pub run_id: Uuid,
    pub engine: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub total_requests: u64,
    pub failed_requests: u64,
    pub avg_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub rps: f64,
    pub error_rate: f64,
}

// ---------------------------------------------------------------------------
// Normalized metrics
// ---------------------------------------------------------------------------

/// A single metric data point, normalized across all engines.
/// Every adapter maps its engine's native output format into this shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedMetric {
    pub timestamp: DateTime<Utc>,
    pub engine: String,
    pub run_id: Uuid,
    pub metric: MetricKind,
    pub value: f64,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MetricKind {
    RequestsTotal,
    RequestsPerSecond,
    LatencyMs,
    ErrorRate,
    ActiveUsers,
    FailedRequests,
}

// ---------------------------------------------------------------------------
// Engine info (serializable summary for the frontend)
// ---------------------------------------------------------------------------

/// Serializable engine information sent to the frontend via IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineInfo {
    pub id: String,
    pub display_name: String,
    pub engine_language: String,
    pub license: String,
    pub license_tier: LicenseTier,
    pub supported_script_languages: Vec<String>,
    pub availability: EngineAvailability,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Engine not installed: {install_hint}")]
    NotInstalled { install_hint: String },

    #[error("Launch failed: {0}")]
    LaunchFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("{0}")]
    Other(String),
}

// ---------------------------------------------------------------------------
// The trait
// ---------------------------------------------------------------------------

/// The core abstraction every load-testing engine must implement.
///
/// # Subprocess-only rule
///
/// `launch()` ALWAYS spawns the engine as a subprocess. No engine implementation
/// may skip this and link/embed itself directly into the Loom binary — even when
/// its license would technically permit that. This is the single consistent
/// boundary that keeps the license story simple and auditable.
///
/// See ARCHITECTURE.md §3 for the rationale.
#[async_trait]
pub trait LoadEngine: Send + Sync {
    /// Unique identifier, e.g. "locust", "k6", "goose".
    fn id(&self) -> &'static str;

    /// Human-readable name, e.g. "Locust".
    fn display_name(&self) -> &'static str;

    /// The programming language of the engine itself, e.g. "Python", "Go", "Rust".
    fn engine_language(&self) -> &'static str;

    /// SPDX license identifier, e.g. "MIT", "AGPL-3.0-only".
    fn license(&self) -> &'static str;

    /// Whether this engine is Core (bundled) or Plugin (BYO binary).
    fn license_tier(&self) -> LicenseTier;

    /// Languages the user can write test scripts in.
    fn supported_script_languages(&self) -> Vec<&'static str>;

    /// Check whether the engine binary is available on this system.
    /// Plugin engines call this before ever offering themselves as runnable.
    fn detect(&self) -> EngineAvailability;

    /// Validate a test configuration before attempting to run it.
    fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError>;

    /// Prepare a workspace directory with everything needed to launch the test.
    fn prepare_workspace(&self, cfg: &TestConfig, run_dir: &Path) -> Result<PreparedJob, EngineError>;

    /// Spawn the engine as a subprocess. Always a subprocess — see trait doc.
    async fn launch(&self, job: &PreparedJob) -> Result<RunHandle, EngineError>;

    /// Stream normalized metrics from the running engine.
    /// For Locust: polls stats_stats_history.csv on a 1s timer.
    /// For Goose: parses stdout.
    /// For k6: tails JSON output file.
    fn stream_metrics(&self, handle: &mut RunHandle) -> BoxStream<'_, Result<NormalizedMetric, EngineError>>;

    /// Stop the running engine (send termination signal) and return a summary.
    async fn stop(&self, handle: &mut RunHandle) -> Result<RunSummary, EngineError>;

    /// Clean up the workspace directory after a run.
    fn cleanup(&self, job: &PreparedJob) -> Result<(), EngineError>;

    /// Build the serializable engine info for the frontend.
    fn info(&self) -> EngineInfo {
        EngineInfo {
            id: self.id().to_string(),
            display_name: self.display_name().to_string(),
            engine_language: self.engine_language().to_string(),
            license: self.license().to_string(),
            license_tier: self.license_tier(),
            supported_script_languages: self.supported_script_languages().iter().map(|s| s.to_string()).collect(),
            availability: self.detect(),
        }
    }
}

// ---------------------------------------------------------------------------
// Utility: parse duration strings like "30s", "5m", "1h"
// ---------------------------------------------------------------------------

/// Parse a human-friendly duration string into seconds.
pub fn parse_duration_secs(s: &str) -> Result<u64, EngineError> {
    let s = s.trim();
    if s.is_empty() {
        return Err(EngineError::Validation("Empty duration string".into()));
    }

    let (num_part, unit) = s.split_at(s.len() - 1);
    let num: u64 = num_part
        .parse()
        .map_err(|_| EngineError::Validation(format!("Invalid duration: {s}")))?;

    match unit {
        "s" => Ok(num),
        "m" => Ok(num * 60),
        "h" => Ok(num * 3600),
        _ => Err(EngineError::Validation(format!("Unknown duration unit: {unit}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration_secs("30s").unwrap(), 30);
        assert_eq!(parse_duration_secs("5m").unwrap(), 300);
        assert_eq!(parse_duration_secs("1h").unwrap(), 3600);
    }

    #[test]
    fn test_parse_duration_invalid() {
        assert!(parse_duration_secs("").is_err());
        assert!(parse_duration_secs("abc").is_err());
        assert!(parse_duration_secs("30x").is_err());
    }

    #[test]
    fn test_license_tier_serialization() {
        let core = serde_json::to_string(&LicenseTier::Core).unwrap();
        assert!(core.contains("Core"));

        let plugin = serde_json::to_string(&LicenseTier::Plugin).unwrap();
        assert!(plugin.contains("Plugin"));
    }
}
