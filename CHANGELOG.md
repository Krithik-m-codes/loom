# Changelog

All notable changes to Loom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-09-27

### Added
- **Multi-Format Packaging & Installers**:
  - Windows: NSIS interactive setup installer (`.exe`), Enterprise WiX installer (`.msi`), and portable zip archive (`.zip`).
  - Linux: Debian/Ubuntu package (`.deb`), Universal standalone AppImage (`.AppImage`), and portable tarball.
  - macOS: Apple Disk Image installer (`.dmg`) and `.app.tar.gz` bundle.
- **Unified Visual System & Accessible UI Primitives**:
  - Reusable primitive components: `LoomButton`, `MetricCard`, `Panel`, `TelemetryPanel`, `StatusBadge`, and `SearchInput`.
  - Over 3,000 lines of structured CSS tokens in `src/index.css` following the Bruno-inspired Electric Lime (`#A3E635`) palette.
  - Complete adoption of official high-resolution geometric woven branding assets.
- **Automated Frontend Test Suite & Governance**:
  - Vitest and React Testing Library foundation with 15 test suites and 19 unit tests across all main views and primitives.
  - Automated design token audit script (`scripts/audit-design-tokens.mjs`) and test to prevent styling drift.
- **Loom Runtime Manager Architecture Specification**:
  - Comprehensive design specification for automated engine detection, zero-friction local installation, and process isolation.

### Changed
- **Subprocess Isolation Architecture**:
  - Refactored `engine-goose` to execute generated scenario projects as external subprocesses, completely removing embedded engine threads and ensuring 100% subprocess isolation.
  - Completely redesigned all application surfaces (`RunnerView`, `DashboardView`, `FlowchartBuilderView`, `ScriptEditorView`, `EnginesView`, `HistoryView`, `Sidebar`, `TopNav`, and modals) to consume modular primitives instead of inline Tailwind utilities.

---

## [0.1.0] - 2026-09-17

### Added
- **Multi-Engine Orchestrator**: Support for Python Locust, Rust Goose, and JavaScript k6.
- **External Goose Scenario Runner**: Rust scenarios run as generated Cargo projects in a subprocess; no Goose engine code is embedded in Loom.
- **Vendored Locust Engine**: Official `locustio/locust` repository vendored for seamless execution.
- **Strict License Isolation**: Copyleft engines (k6 - AGPL-3.0) decoupled across process boundaries with zero linkage.
- **Locust- & Goose-Grade Live Telemetry**:
  - Dynamic virtual user (VU) slider for real-time load adjustments.
  - 3 streaming SVG charts: Throughput vs. Failures, Latency Percentiles (P50/P90/P95/P99), and Virtual Users Ramp-Up.
  - Full Locust-spec Endpoint Statistics table with sticky aggregate Total footer row.
  - Failures and Exceptions real-time inspector.
  - Live Process Console with keyword search filter.
- **Visual Scenario Flowchart Builder**: Drag-and-drop node canvas with bidirectional code generation for Python Locust and JavaScript k6.
- **Script Editor**: In-app code editor with instant syntax templates and disk synchronization.
- **Project & Hierarchical Test Suite Management**: Manage multiple test projects with custom base hosts, load profiles, and suite collections.
- **Export & Reports Center**: 1-click download for `statistics.csv`, `history.csv`, `report.json`, and Markdown summary tables.
- **Run History Audit**: Embedded SQLite persistence for all past test runs with 1-click re-runs.
- **Enterprise Design System**: Bruno- and Kubus-inspired Electric Lime (`#A3E635`) and Deep Slate aesthetic with custom geometric woven brand icon.
- **Open Source Infrastructure**: CI matrix test workflow, multi-platform release packaging workflow, issue and PR templates, and comprehensive contribution documentation.
