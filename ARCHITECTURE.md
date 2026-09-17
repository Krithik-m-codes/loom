# Loom Architecture Document

Loom is a local-first, multi-engine load testing desktop application built using Tauri 2.x, Rust, and React with a developer-focused, Bruno-inspired user experience.

---

## 1. System Overview

```mermaid
graph TD
    subgraph Frontend["React 19 + TypeScript (Bruno Aesthetic)"]
        UI[App Shell & Runner View]
        Charts[Real-Time uPlot / Recharts]
        Logs[Terminal Log Streamer]
        DBView[SQLite Run History]
        CmdK[Command Palette (Ctrl+K)]
    end

    subgraph TauriBackend["Tauri 2.x Desktop Core (Rust)"]
        IPC[IPC Command Handlers]
        State[AppState: Active Runs & Engines]
        SQLite[(SQLite: runs + metrics)]
    end

    subgraph EngineAdapters["Engine Adapter Layer (crates/)"]
        Trait["LoadEngine Trait (engine-core)"]
        Locust["Locust Adapter (engine-locust)"]
        Goose["Goose Adapter (engine-goose)"]
        K6["k6 Adapter (engine-k6)"]
    end

    subgraph Subprocesses["External Subprocesses (Process Boundary)"]
        LocustProc["locust.exe (Python, CSV Stats)"]
        GooseProc["goose.exe (Rust, Stdout Stream)"]
        K6Proc["k6.exe (Go, JSON Metrics)"]
    end

    UI -->|Invoke Commands| IPC
    IPC -->|Manage Runs| State
    IPC -->|Persist Runs & Metrics| SQLite
    State -->|Calls Trait Methods| Trait
    Trait --> Locust
    Trait --> Goose
    Trait --> K6

    Locust -->|Spawns Subprocess| LocustProc
    Goose -->|Spawns Subprocess| GooseProc
    K6 -->|Spawns Subprocess| K6Proc

    LocustProc -->|CSV Poller 1s| Locust
    GooseProc -->|Stdout Pipe| Goose
    K6Proc -->|JSON File Tailer| K6

    Locust -->|Emit NormalizedMetric| IPC
    Goose -->|Emit NormalizedMetric| IPC
    K6 -->|Emit NormalizedMetric| IPC

    IPC -->|Tauri Events: 'metric', 'run-log'| UI
```

---

## 2. The `LoadEngine` Trait

All load-testing engines implement the trait defined in `crates/engine-core`:

```rust
#[async_trait]
pub trait LoadEngine: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn engine_language(&self) -> &'static str;
    fn license(&self) -> &'static str;
    fn license_tier(&self) -> LicenseTier;
    fn supported_script_languages(&self) -> Vec<&'static str>;

    fn detect(&self) -> EngineAvailability;
    fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError>;
    fn prepare_workspace(&self, cfg: &TestConfig, run_dir: &Path) -> Result<PreparedJob, EngineError>;
    async fn launch(&self, job: &PreparedJob) -> Result<RunHandle, EngineError>;
    fn stream_metrics(&self, handle: &mut RunHandle) -> BoxStream<'_, Result<NormalizedMetric, EngineError>>;
    async fn stop(&self, handle: &mut RunHandle) -> Result<RunSummary, EngineError>;
    fn cleanup(&self, job: &PreparedJob) -> Result<(), EngineError>;
}
```

---

## 3. Subprocess-Only Invocation Rule & License Compliance

### Why Subprocess-Only?

1. **Licensing Boundary**: Engines with copyleft licenses (e.g. k6 under AGPL-3.0) cannot be linked into proprietary or permissively licensed desktop applications. By restricting all interaction to standard OS subprocess boundaries (`fork/exec`, CLI flags, stdout/stderr, and output file tailing), Loom never triggers linking obligations.
2. **Crash Isolation**: High-concurrency load tests run in dedicated processes. If an engine runs out of memory or panics, the Loom desktop application remains completely unaffected.
3. **Bring-Your-Own-Binary (BYO Binary)**: Plugin-tier engines (like k6) are never packaged or downloaded automatically. Loom detects whether the binary is present on PATH, displays clear installation commands if absent, and executes the user's installed binary.

---

## 4. Real-Time Metrics & The Locust Polling Design Decision

Locust's headless mode (`--headless`) disables its internal web server and live REST API. The `--csv` flag causes Locust to flush `stats_stats_history.csv` periodically.

Loom's Locust adapter implements an intentional polling design:
1. Locust is spawned with `--csv <run_dir>/stats`.
2. A background Tokio task polls `<run_dir>/stats_stats_history.csv` every 1 second.
3. Rows are diffed against the previous row count. New samples are converted into `NormalizedMetric` structs.
4. Each `NormalizedMetric` is:
   - Emitted to the frontend via Tauri event `metric`.
   - Inserted into the local SQLite `metrics` table.
5. A nominal 1–2 second lag between physical execution and the UI is an explicit and intentional architectural compromise.

---

## 5. Local-First SQLite Persistence

Loom stores all test metadata in a local SQLite database (`loom.db`) located in the user's app data directory:

- **`runs` table**: `id`, `engine`, `project`, `config_json`, `started_at`, `finished_at`, `status`, `summary_json`.
- **`metrics` table**: `id`, `run_id`, `timestamp`, `metric_name`, `value`, `labels_json`.

All operations remain completely local to the user's computer with zero cloud telemetry or external network dependencies.
