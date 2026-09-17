# AGENTS.md

Welcome to Loom — the local-first, multi-engine load testing desktop application built on Tauri 2.x and React with a Bruno-inspired developer experience.

## Build, Test & Development Commands

Always use **`pnpm`** as the JavaScript package manager and **`cargo`** for Rust.

```bash
# Frontend development & build
pnpm install                  # Install JS dependencies
pnpm run dev                  # Start Vite dev server
pnpm run build                # Typecheck & build production frontend bundle

# Rust workspace
cargo check --workspace       # Typecheck all crates (src-tauri, engine-core, engine-locust, engine-goose, engine-k6)
cargo test --workspace        # Run tests across all workspace crates
cargo test -p engine-core     # Test core types and LoadEngine trait
cargo test -p engine-locust   # Test Locust adapter CSV parsing and traits
cargo test -p engine-goose    # Test Goose adapter stdout parsing
cargo test -p engine-k6       # Test k6 adapter JSON metrics parsing

# Tauri desktop application
cargo tauri dev               # Run desktop app in development mode
cargo tauri build             # Package production desktop binary
```

## Critical Architecture Rule: Subprocess-Only Invocation

> **MANDATORY LICENSE COMPLIANCE RULE**:
> **Engines are ALWAYS invoked as subprocesses. No engine is EVER linked, embedded, or compiled into Loom’s binary.**
> 
> - **Core Tier** (`LicenseTier::Core` — MIT, Apache-2.0, BSD): Permissively licensed adapters. Permitted to bundle adapter code, but still invoked strictly via process boundary.
> - **Plugin Tier** (`LicenseTier::Plugin` — AGPL-3.0, GPL): Copyleft engines like k6. Loom distributes ONLY the adapter code, NEVER the engine binary. The user brings their own binary (BYO binary).

## Repository Directory Map

```text
e:\projects\ktwst\
├── Cargo.toml                    # Rust workspace root
├── package.json                  # Frontend dependencies & scripts
├── vite.config.ts                # Vite config (React + Tailwind v4)
├── tsconfig.json                 # TypeScript compiler configuration
├── examples/                     # Sample test scripts
│   ├── locust/basic_test.py      # Python Locust test script
│   ├── k6/basic_test.js          # JavaScript k6 test script
│   └── goose/loadtest.rs         # Rust Goose test script
├── crates/
│   ├── engine-core/              # LoadEngine trait, NormalizedMetric, types
│   ├── engine-locust/            # Locust subprocess adapter + CSV poller
│   ├── engine-goose/             # Goose subprocess adapter + stdout parser
│   └── engine-k6/                # k6 Plugin adapter + JSON output tailer
├── src-tauri/                    # Tauri 2.x backend binary
│   ├── src/lib.rs                # Tauri IPC commands & subprocess management
│   ├── src/db.rs                 # SQLite schema & persistence
│   ├── Cargo.toml                # Dependencies (rusqlite, tauri-plugin-shell)
│   └── tauri.conf.json           # Tauri desktop configuration
├── src/                          # React + TypeScript frontend (Bruno aesthetic)
│   ├── components/
│   │   ├── Sidebar.tsx           # Collection tree, engines, Ctrl+K footer
│   │   ├── TopNav.tsx            # Bruno horizontal tabs & run actions
│   │   ├── RunnerView.tsx        # Request bar, profile sliders, live telemetry
│   │   ├── ScriptEditorView.tsx  # Code editor with templates & save
│   │   ├── HistoryView.tsx       # SQLite run history table with re-run
│   │   ├── EnginesView.tsx       # Engine license tiers & install hints
│   │   └── CommandPaletteModal.tsx # cmdk Ctrl+K command menu
│   ├── lib/ipc.ts                # Tauri invoke & event listeners
│   ├── types.ts                  # Shared TypeScript models
│   ├── index.css                 # Bruno design system tokens & styles
│   ├── App.tsx                   # Main state orchestration
│   └── main.tsx                  # React entry point
└── docs/                         # Architecture, license, and developer docs
```

## Adding New Engine Adapters

1. Create a new crate under `crates/engine-<name>`.
2. Implement `engine_core::LoadEngine`.
3. Adhere strictly to the subprocess-only rule.
4. If the engine is copyleft (GPL/AGPL), designate it as `LicenseTier::Plugin`.
5. Add unit tests for config validation and metrics output parsing.
