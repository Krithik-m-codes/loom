# Loom application architecture

Loom is a desktop application. The React interface is compiled into static files and loaded inside the operating system's Tauri webview; the installed application does not need a browser tab, a hosted web server, or an internet connection to render its workspace. Internet is only needed when a user chooses to download runtimes or update the app.

## What ships in the desktop package

```text
Loom installer (MSI / platform package)
└─ Loom desktop executable (Tauri + Rust)
   ├─ bundled React/Vite interface (local webview assets)
   ├─ SQLite and project/suite IPC commands
   ├─ Rust engine adapters (not the load-testing engines)
   └─ runtime manager (downloads and verifies tools after consent)
```

The installer contains Loom, not Python, Locust, Rust, Goose, or k6 engine binaries. A first launch presents the Loom terms, then offers Locust and Goose by default and k6 as a separate opt-in with its own AGPL-3.0 acceptance. Installation runs at user scope and stores files under the platform's Loom application-data directory. It does not edit system PATH or require an administrator account. The UI can still be opened if one runtime fails; users can retry from Engine settings.

The Windows `.exe`/MSI is the desktop app installer—not a web server executable. macOS and Linux use their corresponding Tauri packages. The product website is a separate static-site deliverable and must not be substituted for the Tauri `frontendDist` used in desktop packaging.

## Runtime and simulation flow

```text
First-run UI ──Tauri IPC──> Runtime Manager ──HTTPS + pinned SHA-256──> user runtime directory
                                  │                                           │
                                  └──progress / cancel──> UI                  │
                                                                              ▼
Project + suite UI ──IPC──> Rust engine adapter ──subprocess──> Locust / Cargo+Goose / k6
                                  │                                  │
                                  └──SQLite + script files           └──logs / CSV / JSON metrics
```

The Runtime Manager uses an explicit artifact manifest, checksum verification, safe extraction, process-tree cancellation, per-runtime inter-process locking, runtime probes, and atomic active-runtime metadata. The engine adapters receive resolved executable paths and scoped environment variables. They always launch load engines as child processes; they never link or embed those engine binaries into Loom.

- Locust uses Loom-managed Python and an isolated virtual environment with a pinned Locust package.
- Goose scenarios are user-authored Rust source compiled as an external Cargo scenario; Goose itself remains a dependency of that scenario, not Loom.
- k6 is license-gated separately and remains outside the Loom executable. The adapter invokes a managed, consented binary or a user-provided binary discovered on PATH.

## Projects and data

Project, suite, test configuration, run history, and visual-flow metadata live in the local `loom.db` SQLite database. Suite scripts are regular files under the app-data `scripts/<project-id>/` directory so users can edit and run actual Locust Python, Goose Rust, and k6 JavaScript/TypeScript source. Simulation workspaces and live engine output are kept in per-run directories; normalized metrics and logs are streamed back to the desktop UI and run history.

Runtime binaries and runtime metadata are kept in their own app-data subtree, separate from projects and scripts. Repairing or cancelling a runtime must not delete project data, suite source, run history, or a previously working runtime.

## Current boundaries and next architecture work

The installed desktop app is the product surface for authoring, running, and inspecting simulations. A public website should be built as a distinct static-site root/output and deployed independently; it should describe and link to Loom, not try to host the desktop workspace. Docker/self-host mode is a separate future service architecture: it will need an explicit server/API boundary, persistent volumes, secrets/authentication, worker execution model, and deployment documentation rather than wrapping the desktop executable in a container and claiming it is a web service.

The managed runtime flow still needs cross-platform packaged-install smoke tests and platform-specific prerequisite validation. In particular, compiling Goose scenarios may require native build tools on a machine; the runtime manager must detect/report that honestly instead of marking a toolchain Ready solely because `cargo --version` works.
