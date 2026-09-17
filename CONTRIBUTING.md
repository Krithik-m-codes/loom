# Contributing to Loom

Thank you for your interest in contributing to Loom! Loom is an open-source, local-first load testing desktop platform. We welcome contributions of all kinds: bug reports, documentation, feature proposals, and engine adapter implementations.

---

## 🛠 Development Environment Setup

### Prerequisites
- **Node.js**: v18 or later
- **pnpm**: v9 or later (`corepack enable pnpm`)
- **Rust**: 1.80+ (`rustup default stable`)
- **C/C++ Build Tools**: Visual Studio Build Tools (Windows) / Xcode CLI Tools (macOS) / `build-essential` (Linux)

### Getting the Code
```bash
git clone https://github.com/krithik-m-dev/loom.git
cd loom
pnpm install
```

### Running Locally
```bash
# Frontend only in Vite dev server (runs on port 1420)
pnpm run dev

# Tauri desktop application in development mode
pnpm tauri dev
```

### Running Workspace Tests
```bash
# Typecheck & build frontend
pnpm run build

# Typecheck Rust workspace crates
cargo check --workspace

# Run unit tests across all engine adapters and core traits
cargo test --workspace
```

---

## 📐 Architecture & License Compliance Rules

Before contributing code, please review Loom's non-negotiable architectural constraints:

### 1. Subprocess-Only Invocation
> **CRITICAL RULE**: Engines are **ALWAYS** invoked as subprocesses using `tokio::process::Command`. No engine is **EVER** statically or dynamically linked, embedded as a C/FFI dependency, or compiled into Loom’s main binary in violation of upstream licenses.

### 2. License Tiers
- **Core Tier (`LicenseTier::Core`)**: Permissively licensed adapters (MIT, Apache-2.0, BSD). Loom can distribute adapter code and bundled native worker components.
- **Plugin Tier (`LicenseTier::Plugin`)**: Copyleft engines (GPL, AGPL, MPL) such as k6. Loom distributes **ONLY** the adapter code, **NEVER** the engine binary. Users must bring their own binary (`BYO binary`).

---

## 🔌 Adding a New Engine Adapter

1. **Create Engine Crate**:
   Create a new crate under `crates/engine-<name>`.
2. **Add to Workspace**:
   Add `"crates/engine-<name>"` to the `members` array in root `Cargo.toml`.
3. **Implement the `LoadEngine` Trait**:
   ```rust
   use async_trait::async_trait;
   use engine_core::*;

   pub struct MyEngine;

   #[async_trait]
   impl LoadEngine for MyEngine {
       fn id(&self) -> &'static str { "myengine" }
       fn display_name(&self) -> &'static str { "My Engine" }
       fn engine_language(&self) -> &'static str { "Python" }
       fn license(&self) -> &'static str { "MIT" }
       fn license_tier(&self) -> LicenseTier { LicenseTier::Core }
       fn supported_script_languages(&self) -> Vec<&'static str> { vec!["Python"] }
       
       fn detect(&self) -> EngineAvailability { /* check binary availability */ }
       fn validate_config(&self, cfg: &TestConfig) -> Result<(), EngineError> { /* ... */ }
       fn prepare_workspace(&self, cfg: &TestConfig, run_dir: &Path) -> Result<PreparedJob, EngineError> { /* ... */ }
       async fn launch(&self, job: &PreparedJob) -> Result<RunHandle, EngineError> { /* ... */ }
       fn stream_metrics(&self, handle: &mut RunHandle) -> BoxStream<'_, Result<NormalizedMetric, EngineError>> { /* ... */ }
       async fn stop(&self, handle: &mut RunHandle) -> Result<RunSummary, EngineError> { /* ... */ }
       fn cleanup(&self, job: &PreparedJob) -> Result<(), EngineError> { Ok(()) }
   }
   ```
4. **Register in Tauri Backend**:
   Add your engine to `src-tauri/src/lib.rs` in the `engines` list.
5. **Add Unit Tests**:
   Ensure `cargo test -p engine-<name>` covers config validation and metric output parsing.

---

## 🌿 Contribution Workflow

1. **Fork & Branch**:
   Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. **Coding Standards**:
   - **Frontend**: React 19, TypeScript strict mode, Vanilla CSS/design tokens in `index.css`. Follow Bruno/Kubus dark aesthetics.
   - **Rust**: Format with `cargo fmt --all`, lint with `cargo clippy --workspace --all-targets`.
3. **Commit Messages**:
   Use Conventional Commits:
   - `feat: add artillery load engine adapter`
   - `fix: resolve locust csv poller EOF race condition`
   - `docs: update architecture guide with license tier definitions`
4. **Submitting Pull Requests**:
   - Push your branch to GitHub and open a PR against `main`.
   - Complete the PR checklist in `.github/pull_request_template.md`.
   - Ensure all automated CI checks pass.

Thank you for helping build Loom!
