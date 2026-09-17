<div align="center">

# 🪢 Loom

**The local-first, multi-engine load testing desktop platform with Bruno-inspired simplicity and Locust-grade telemetry.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Tauri 2.x](https://img.shields.io/badge/Tauri-2.x-24C8DB.svg?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.80+-DEA584.svg?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React 19](https://img.shields.io/badge/React-19.x-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Engines](https://img.shields.io/badge/Engines-Locust%20|%20Goose%20|%20k6-A3E635.svg?style=flat-square)](https://github.com/krithik-m-dev/loom)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

[Features](#-key-features) •
[Quick Start](#-quick-start) •
[Architecture](#-architecture--license-compliance) •
[User Guide](#-user-guide--workflows) •
[Contributing](#-contributing) •
[License](#-license)

</div>

---

## 📖 Overview

**Loom** bridges the gap between lightweight HTTP clients (like Bruno and Postman) and industrial-strength load testing frameworks (Locust, Goose, and k6). 

Most load testing tools force developers to choose between clunky web UIs, complex cloud-vendor subscriptions, or opaque command-line terminal streams. Loom provides a **local-first desktop studio** with:

- **Zero-Install Execution**: Native high-throughput Tokio load generator embedded directly into Loom alongside vendored Locust support.
- **Locust-Grade Telemetry**: Streaming real-time SVG charts (RPS vs Errors/s, Latency Percentiles P50/P90/P95/P99, Concurrency Ramp), interactive VU load sliders, and full Locust-spec endpoint statistics tables.
- **Multi-Engine Freedom**: Run Python scripts via **Locust**, high-concurrency Rust via **Goose**, or modern JavaScript via **k6** from a single unified interface.
- **Strict License Isolation**: Copyleft engines like k6 (AGPL-3.0) are strictly decoupled across process boundaries with zero linkage or binary redistribution.
- **Visual Scenario Authoring**: Drag-and-drop flowchart builder that auto-generates runnable Locust and k6 code with 1-click execution.

---

## ⚡ Key Features

### 1. Unified Multi-Engine Load Orchestration
Execute and compare tests across three premier open-source engines from a single interface:

| Engine | Default Language | Tier | Architecture | User Prerequisite |
| :--- | :--- | :--- | :--- | :--- |
| **Goose** | Rust / Async Tokio | `LicenseTier::Core` | **Embedded Native Tokio Worker** | **Zero dependencies** (built directly into Loom binary) |
| **Locust** | Python | `LicenseTier::Core` | **Vendored Official Engine** + Poller | Subprocess via system or bundled Python runtime |
| **k6** | JavaScript | `LicenseTier::Plugin` | **Strict Process Boundary** + JSON Tailer | **BYO Binary** (download k6 to keep binary clean) |

### 2. Locust- & Goose-Grade Live Telemetry
- **Dynamic VU Load Slider**: Adjust target virtual users on the fly while tests run without stopping execution.
- **3 Real-Time SVG Charts**:
  - *Throughput vs. Errors*: Requests/sec (Electric Lime) overlaid with Errors/sec (Crimson Red).
  - *Response Time Percentiles*: Streaming curves for P50, P90, P95, and P99 latencies in milliseconds.
  - *Virtual Users Ramp-Up*: Real-time concurrency visualization.
- **Locust-Spec Endpoint Statistics Table**:
  - Full schema matching Locust's web UI: `Method`, `Name`, `Requests`, `Failures`, `Median (ms)`, `Average (ms)`, `Min (ms)`, `Max (ms)`, and `Current RPS`.
  - Sticky aggregated `Total` footer row calculating workspace-wide metrics.
- **Failures & Exceptions Inspector**: Real-time breakdown of error messages, HTTP status codes, and occurrence frequencies.
- **Live Process Console**: Real-time stdout/stderr log stream with keyword search filter and copy.

### 3. Project & Hierarchical Test Suite Management
- Manage multiple distinct projects (e.g., *E-Commerce Benchmark*, *API Gateway & Auth Stress*).
- Organize scenarios into project-specific suites with custom base targets, concurrency profiles, and engines.
- Active project switcher dropdown in the sidebar with instant context switching.

### 4. Visual Flowchart Scenario Builder
- Visual node canvas for designing multi-step user journeys.
- Palette of node types: **HTTP Requests**, **Think Times**, **Assertions**, and **Loop Blocks**.
- Bidirectional code export: Compiles visual flowcharts into production-ready **Python Locust** and **JavaScript k6** scripts with a 1-click **Transfer to Runner** button.

### 5. Export Center & Persistent SQLite Audit
- 1-click export to:
  - `statistics.csv` (Locust-compatible summary CSV)
  - `history.csv` (Second-by-second time-series metrics CSV)
  - `report.json` (Structured test results and hardware telemetry)
  - Markdown Summary (Formatted table ready for PR comments and Slack)
- Embedded SQLite database logs every run with complete configuration snapshots for 1-click re-runs.

---

## 🏛 Architecture & License Compliance

Loom adheres to a **Subprocess-Only Invocation Model** to ensure 100% license compliance:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Loom Desktop GUI                              │
│                      (Tauri 2.x + React 19 + TypeScript)                │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Tauri IPC (Async Commands & Events)
┌────────────────────────────────────▼────────────────────────────────────┐
│                           Loom Rust Core Binary                         │
│                    (rusqlite + Tokio Process Orchestrator)              │
└──────────┬─────────────────────────┬─────────────────────────┬──────────┘
           │ Subprocess boundary     │ Subprocess boundary     │ Process boundary
           ▼                         ▼                         ▼
 ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
 │   Locust Engine   │     │   Goose Engine    │     │     k6 Engine     │
 │ (MIT - Core Tier) │     │(MIT/Apache - Core)│     │(AGPL-3.0 - Plugin)│
 │  CSV Poller Tail  │     │ Tokio Async Worker│     │  JSON Output Tail │
 └───────────────────┘     └───────────────────┘     └───────────────────┘
```

> **Mandatory Copyleft Isolation Rule**:
> - **Core Tier (`LicenseTier::Core`)**: Permissively licensed engines (Locust, Goose). Adapters and embedded native worker runtimes are bundled into Loom.
> - **Plugin Tier (`LicenseTier::Plugin`)**: Copyleft engines (k6 - AGPL-3.0). Loom distributes **ONLY** the adapter code, **NEVER** the engine binary. Users bring their own binary (`BYO binary`), preventing license contamination.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+) & [pnpm](https://pnpm.io/) (`corepack enable pnpm`)
- [Rust](https://rustup.rs/) (v1.80+)
- *(Optional for Locust)*: [Python](https://www.python.org/) 3.10+
- *(Optional for k6)*: [k6](https://k6.io/docs/get-started/installation/) (`winget install k6` / `brew install k6`)

### Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/krithik-m-dev/loom.git
cd loom

# 2. Install frontend dependencies
pnpm install

# 3. Check workspace Rust crates
cargo check --workspace
cargo test --workspace

# 4. Launch desktop app in development mode
pnpm tauri dev
```

### Production Desktop Build

To build the native production installer for your operating system:

```bash
pnpm run build          # Typecheck & build production React bundle
pnpm tauri build        # Compile release desktop installer (.msi / .dmg / .deb)
```

Generated release installers are placed in `src-tauri/target/release/bundle/`.

---

## 🐳 Self-Hosted Headless Execution (Docker)

Loom includes self-hosted headless runner support for CI/CD environments and automated pipelines:

```bash
# Launch Loom self-hosted headless telemetry runner
docker compose up --build -d
```

Check health status:
```bash
curl http://localhost:8080/health
```

---

## 📁 Repository Directory Structure

```text
loom/
├── Cargo.toml                    # Rust workspace root
├── package.json                  # Frontend dependencies (pnpm)
├── vite.config.ts                # Vite config (React 19 + Tailwind v4)
├── tsconfig.json                 # TypeScript strict compiler config
├── .github/                      # GitHub Actions workflows & templates
│   ├── workflows/ci.yml          # Automated CI matrix (Rust + Frontend)
│   ├── workflows/release.yml     # Multi-platform desktop build & release
│   └── ISSUE_TEMPLATE/           # Structured bug & feature templates
├── crates/
│   ├── engine-core/              # LoadEngine trait, NormalizedMetric, types
│   ├── engine-locust/            # Locust subprocess adapter + CSV poller
│   ├── engine-goose/             # Goose native Tokio worker + stdout parser
│   └── engine-k6/                # k6 Plugin adapter + JSON metrics tailer
├── src-tauri/                    # Tauri 2.x backend binary
│   ├── src/lib.rs                # Tauri IPC commands & subprocess management
│   ├── src/main.rs               # Worker mode CLI interceptor
│   ├── src/db.rs                 # SQLite schema & persistence
│   └── tauri.conf.json           # Tauri desktop packaging configuration
├── src/                          # React + TypeScript frontend
│   ├── components/
│   │   ├── Sidebar.tsx           # Active project switcher & navigation
│   │   ├── TopNav.tsx            # Test controls & target configuration
│   │   ├── DashboardView.tsx     # System gauges & recent run audit
│   │   ├── RunnerView.tsx        # Live SVG charts, stats table, & export
│   │   ├── FlowchartBuilderView.tsx # Visual scenario flow designer
│   │   ├── ScriptEditorView.tsx  # Code editor with templates
│   │   ├── HistoryView.tsx       # SQLite run history table with re-run
│   │   ├── EnginesView.tsx       # Engine license compliance center
│   │   ├── CommandPaletteModal.tsx # Ctrl+K command menu
│   │   └── projects/             # NewProjectModal & suite configuration
│   ├── lib/ipc.ts                # Tauri invoke & event listeners
│   ├── types.ts                  # Shared TypeScript models
│   ├── index.css                 # Electric Lime design tokens & styles
│   └── App.tsx                   # Main state orchestration
├── examples/                     # Sample load testing scripts
│   ├── locust/basic_test.py      # Python Locust test script
│   ├── k6/basic_test.js          # JavaScript k6 test script
│   └── goose/loadtest.rs         # Rust Goose test script
└── vendor/
    └── locust/                   # Official vendored Locust source
```

---

## 🛠 Adding a New Engine Adapter

Loom's modular crate architecture makes adding new engine adapters straightforward:

1. Create a new crate: `crates/engine-<name>`.
2. Implement `engine_core::LoadEngine`:
   ```rust
   #[async_trait]
   impl LoadEngine for MyEngine {
       fn id(&self) -> &'static str { "myengine" }
       fn display_name(&self) -> &'static str { "MyEngine" }
       fn license_tier(&self) -> LicenseTier { LicenseTier::Core }
       // Implement detect, validate_config, prepare_workspace, launch, stream_metrics, stop
   }
   ```
3. Register the engine in `src-tauri/src/lib.rs`.
4. Add unit tests verifying config validation and metric output parsing.

For comprehensive guidelines, review [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before submitting pull requests.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Ensure all tests pass (`cargo test --workspace` & `pnpm run build`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## 📄 License

Loom is open-source software licensed under either the [MIT License](LICENSE) or [Apache License 2.0](LICENSE-APACHE) at your option.

All third-party engine integrations are strictly invoked as external subprocesses and adhere to their respective upstream licenses. See [LICENSES.md](LICENSES.md) for full attribution details.
