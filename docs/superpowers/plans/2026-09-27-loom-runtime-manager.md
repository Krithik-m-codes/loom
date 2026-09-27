# Loom Runtime Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After accepting terms, a fresh Loom desktop install can provision and verify Locust and Goose runtimes per user, with an explicitly consented optional k6 install, on supported Windows, macOS, and Linux systems.

**Architecture:** A new Rust `runtime-manager` crate owns pinned artifact metadata, download verification, safe extraction, staging, and install state. Tauri exposes narrow IPC commands and progress events; the React first-run wizard presents choices and recovery. Engine adapters resolve Loom-managed tools first and existing PATH tools second, then continue to launch every engine as a subprocess.

**Tech Stack:** Rust workspace, Tauri 2 commands/events, Tokio, reqwest, sha2, archive libraries, React 19/TypeScript, Vitest/Testing Library, cargo test, platform CI runners, and packaged Tauri builds.

**Spec:** `docs/superpowers/specs/2026-09-27-loom-runtime-manager-design.md`

## Global Constraints

- Work on `main`; preserve any existing changes and inspect overlapping diffs before editing.
- Use `pnpm` for JavaScript installation, tests, builds, and Tauri packaging; use `cargo` for Rust.
- Engine binaries are never linked, embedded, or compiled into the Loom executable; Locust, Goose scenarios, and k6 run as child processes.
- Do not bundle Python, Locust, Rust, Goose, or k6 engine binaries in the Loom installer.
- k6 acquisition requires a separate explicit AGPL-3.0 consent and downloads only from the pinned official upstream source.
- Runtime writes stay inside Loom's per-user app data directory; no administrator prompt, system PATH, shell profile, or machine-wide installation.
- Validate TLS, pinned artifact version, published checksums/bootstrap signatures, archive paths, and executable probes before activating a runtime.
- A failed or cancelled engine install must not prevent Loom from opening or erase user project data or completed runtimes.
- Engine adapters prefer the managed runtime and retain existing PATH discovery as a fallback.
- Do not add tests after implementation: each behavior follows test-first red/green/refactor.

## Review Focus

1. Malformed, missing, or mismatched checksums must fail before extraction and leave no active runtime; Task 2 tests these cases.
2. Malicious archives with `..`, absolute paths, symlinks, duplicate paths, or excessive expanded size must not write outside staging or exhaust disk; Task 2 tests crafted archives.
3. Two installs for the same engine, cancellation, and app restart during staging must not corrupt state; Tasks 2-3 test locking and recovery.
4. Offline network, HTTP errors, unsupported OS/CPU, and missing upstream assets must leave Loom usable with accurate per-engine errors; Tasks 1-4 add native tests and Task 8 exercises platform jobs.
5. k6 must not download before separate consent, and its binary must never appear in Tauri bundle resources; Tasks 3, 5, and 8 test consent and bundle inventory.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `crates/runtime-manager/` | Runtime IDs, platform keys, pinned manifest, install state, verified downloads, safe extraction, bootstrap workflows, cancellation, and unit/integration tests. |
| `Cargo.toml`, `src-tauri/Cargo.toml` | Register the crate and native runtime dependencies. |
| `src-tauri/src/runtime_commands.rs` | Tauri commands/events for status, install, retry, and cancel; delegates all work to runtime-manager. |
| `src-tauri/src/lib.rs` | Initialize the manager using the per-user app data directory, manage state, register commands, and prevent a bootstrap error from aborting startup. |
| `crates/engine-{locust,goose,k6}/src/lib.rs` | Accept explicit runtime resolution paths and construct child processes using argument arrays and managed environment. |
| `src/lib/runtime-ipc.ts`, `src/types.ts` | Typed IPC and runtime status/progress/error models. |
| `src/components/setup/OnboardingWizard.tsx` | Terms-gated component selection, progress, cancel, retry, and partial-success navigation. |
| `src/components/EnginesView.tsx`, `src/App.tsx` | Rerun setup from Engine settings and share native runtime state without app-wide failure. |
| `src/components/setup/RuntimeSetup*.test.tsx`, `src-tauri/tests/` | UI state tests and Tauri command integration tests. |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Windows/macOS/Linux tests, desktop packaging smoke checks, and runtime manifest validation. |
| `LICENSES.md`, `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md` | Explain managed paths, upstream acquisition, k6 consent, offline behavior, troubleshooting, and process boundaries. |

### Task 1: Define runtime identities, platform support, and pinned manifests

**Files:**
- Create: `crates/runtime-manager/Cargo.toml`
- Create: `crates/runtime-manager/src/lib.rs`
- Create: `crates/runtime-manager/src/manifest.rs`
- Create: `crates/runtime-manager/src/platform.rs`
- Create: `crates/runtime-manager/tests/manifest.rs`
- Modify: `Cargo.toml`

**Interfaces:**
- Produces `RuntimeId::{Locust, Goose, K6}` and `PlatformKey { os, arch }` with explicit supported/unsupported results.
- Produces `ArtifactId::{UvBootstrap, RustupBootstrap, K6}` and `RuntimeManifest::artifact(artifact, platform) -> Result<&Artifact, ManifestError>`; `Artifact` contains version, URL, SHA-256, archive format, executable path, license, and upstream attribution.
- Produces runtime component pins: Locust CPython build and Locust version; Goose Rust toolchain version; k6 version is inherited from its platform artifact.
- Produces `InstallState::{Missing, Installing { stage }, Ready { version, path }, Failed { stage, message }}` serializable to Tauri.

- [ ] **Step 1: Write failing manifest and platform tests**

Add cases for Windows x64, macOS x64/arm64, Linux x64/arm64, and unsupported combinations. Assert every supported bootstrap/k6 artifact has HTTPS, non-empty version, a 64-hex SHA-256, license metadata, and safe relative executable path. Assert Locust and Goose pins identify exact versions/builds and unsupported targets return `ManifestError::UnsupportedPlatform`.

- [ ] **Step 2: Run the tests and confirm the missing runtime-manager crate is the failure**

Run: `cargo test -p runtime-manager --test manifest`

Expected: FAIL because the new crate and manifest API do not yet exist.

- [ ] **Step 3: Add the crate and typed manifest model**

Register `crates/runtime-manager` in the workspace and define the types above. Pin one currently maintained stable version for uv, rustup, k6, Locust, CPython, and the Rust toolchain when authoring the checked-in manifest. Use Astral's per-artifact SHA-256 assets for uv and the upstream release checksum file for k6; verify rustup bootstrap bytes by a reviewed pinned SHA-256, then rely on rustup's signed channel metadata for toolchain downloads. Reject a target without an upstream artifact and a verifiable checksum/signature path. Keep the Tauri dependency registration for Task 4 so Task 1 does not touch the user's in-progress version bump in `src-tauri/Cargo.toml`.

- [ ] **Step 4: Run manifest tests and Rust type checks**

Run: `cargo test -p runtime-manager --test manifest`

Expected: PASS for supported entries and explicit unsupported results.

Run: `cargo check --workspace`

Expected: PASS.

- [ ] **Step 5: Commit the runtime contract**

```powershell
git add -- Cargo.toml crates/runtime-manager
git commit -m "feat: define managed runtime manifest"
```

### Task 2: Implement safe, verified, cancellable runtime acquisition

**Files:**
- Create: `crates/runtime-manager/src/download.rs`
- Create: `crates/runtime-manager/src/extract.rs`
- Create: `crates/runtime-manager/src/store.rs`
- Create: `crates/runtime-manager/tests/download.rs`
- Create: `crates/runtime-manager/tests/extract.rs`
- Modify: `crates/runtime-manager/src/lib.rs`
- Modify: `crates/runtime-manager/Cargo.toml`

**Interfaces:**
- Produces `RuntimeStore::new(root).status(runtime)` and atomic `activate(runtime, stage_dir, metadata)`.
- Produces async `Downloader::fetch(artifact, staging_dir, cancel, progress) -> Result<PathBuf, InstallError>`.
- Produces `extract_verified(archive, format, staging_dir) -> Result<(), InstallError>` with path and symlink validation.
- Progress carries runtime id, stage, received bytes, optional total bytes, and a human-readable message; cancellation uses a task-scoped token.

- [ ] **Step 1: Write failing security and lifecycle tests**

Use a local test HTTP server, not live upstreams. Cover valid bytes/checksum, bad checksum, 404, interrupted response, cancellation, total-length absent, traversal archive entry, absolute archive entry, symlink entry, existing active runtime preservation, and repeated activation.

- [ ] **Step 2: Run tests and verify expected missing-function failures**

Run: `cargo test -p runtime-manager --test download --test extract`

Expected: FAIL because downloader/store/extraction APIs are absent.

- [ ] **Step 3: Implement HTTPS streaming and checksum verification**

Stream into a unique staging path, update SHA-256 incrementally, emit progress without blocking the async executor, stop when cancelled, and compare the complete digest before making archive bytes available to extraction.

- [ ] **Step 4: Implement archive-safe extraction and atomic activation**

Reject absolute paths, parent traversal, unsafe symlinks/hardlinks, and writes outside the unique staging directory. Probe the candidate executable before updating the active-version metadata. Keep the existing active runtime untouched on every error.

- [ ] **Step 5: Run security tests and formatter/lints**

Run: `cargo test -p runtime-manager --test download --test extract`

Expected: PASS for all valid and adversarial cases.

Run: `cargo fmt --all -- --check`

Expected: PASS.

- [ ] **Step 6: Commit acquisition primitives**

```powershell
git add -- crates/runtime-manager
git commit -m "feat: add verified runtime acquisition"
```

### Task 3: Provision Python/Locust, Rust/Goose, and optional k6

**Files:**
- Create: `crates/runtime-manager/src/provision.rs`
- Create: `crates/runtime-manager/src/probe.rs`
- Create: `crates/runtime-manager/tests/provision.rs`
- Modify: `crates/runtime-manager/src/manifest.rs`
- Modify: `crates/runtime-manager/src/lib.rs`

**Interfaces:**
- Produces `RuntimeManager::install(selection, progress_sender, cancellation) -> InstallSummary`.
- Produces `InstallSelection { locust: bool, goose: bool, k6: bool }`; the API rejects k6 unless `k6_consent` is true.
- Produces `RuntimeResolver::resolve(runtime) -> Result<ResolvedRuntime, RuntimeError>` and `ResolvedRuntime { executable, version, env }`.
- Provisioning uses the pinned manifest only; manager subprocesses receive explicit environment maps and argument vectors, never shell strings.

- [ ] **Step 1: Write failing provisioning tests around injected providers**

Inject a fake artifact provider and fake process runner. Verify Locust creates an isolated Python environment and installs a pinned Locust version; Goose installs stable rustup/Cargo under managed homes; k6 cannot start without consent; successful installs persist exact versions and paths; a failed engine does not undo another completed engine.

- [ ] **Step 2: Run the tests and establish expected API failures**

Run: `cargo test -p runtime-manager --test provision`

Expected: FAIL because `RuntimeManager` and resolver do not exist.

- [ ] **Step 3: Implement Locust provisioning**

Acquire the pinned `uv` bootstrap executable from Astral's upstream manifest, verify its published SHA-256, use `uv` to provision the pinned managed CPython build, create an isolated environment under the Locust runtime directory, and install the pinned Locust release. Probe both `python --version` and `locust --version` before activation. Record the CPython build identifier and Locust version.

- [ ] **Step 4: Implement Rust/Cargo provisioning**

Acquire and verify the official rustup bootstrapper, install the pinned stable toolchain without PATH modification using Loom-managed `RUSTUP_HOME` and `CARGO_HOME`, then probe exact `rustc` and `cargo` versions. Keep Goose itself as the user scenario's Cargo dependency and compile/run it as an external scenario process.

- [ ] **Step 5: Implement consent-gated k6 provisioning**

Require the explicit AGPL consent token from the caller before resolving or fetching the k6 artifact. Download the target-specific official release, verify it, probe its version, and persist the user's consent timestamp/version locally.

- [ ] **Step 6: Run unit and failure-path tests**

Run: `cargo test -p runtime-manager --test provision`

Expected: PASS for install order, component isolation, missing tools, failing subprocess probes, rejected consent, retry, and cancellation.

- [ ] **Step 7: Commit runtime provisioning**

```powershell
git add -- crates/runtime-manager
git commit -m "feat: provision managed load testing runtimes"
```

### Task 4: Integrate the manager with Tauri IPC without risking startup

**Files:**
- Create: `src-tauri/src/runtime_commands.rs`
- Create: `src-tauri/tests/runtime_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/runtime-ipc.ts`
- Modify: `src/types.ts`

**Interfaces:**
- `get_runtime_status() -> Vec<RuntimeStatus>` returns a status for every engine without failing app startup.
- `install_runtimes(selection, k6_consent) -> Result<(), String>` starts one managed task and emits `runtime-progress`, `runtime-ready`, and `runtime-error` events.
- `cancel_runtime_installation() -> Result<(), String>` cancels the active task and cleans only its staging directory.
- All command failures serialize to user-readable errors; initialization failures are logged and represented as missing/failed runtime state, never `expect`/panic during app startup.

- [ ] **Step 1: Write failing IPC boundary tests**

Test app-data path resolution, initial missing-state response, progress event order, duplicate start rejection, cancellation completion, restart recovery, and a manager initialization error that still allows Tauri setup to finish.

- [ ] **Step 2: Run tests to confirm commands and state are absent**

Run: `cargo test -p loom --test runtime_commands`

Expected: FAIL because runtime commands and manager state are not registered.

- [ ] **Step 3: Add managed Tauri state and commands**

Initialize the runtime store below `app.path().app_data_dir()/runtimes`. Keep database failures distinct from runtime provisioning failures. Register narrow commands and forward Tokio progress through Tauri events; protect one active install task with cancellation state.

- [ ] **Step 4: Add typed frontend IPC wrappers**

Implement typed invoke/listen wrappers in `runtime-ipc.ts`, including listener cleanup and unknown-payload rejection. Avoid broad `any` casts and preserve ordinary app operation when event listeners fail.

- [ ] **Step 5: Run Rust IPC tests and frontend typecheck**

Run: `cargo test -p loom --test runtime_commands`

Expected: PASS, including simulated manager failure without startup panic.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 6: Commit the native bridge**

```powershell
git add -- src-tauri/src/runtime_commands.rs src-tauri/src/lib.rs src-tauri/tests/runtime_commands.rs src/lib/runtime-ipc.ts src/types.ts
git commit -m "feat: expose runtime manager through Tauri"
```

### Task 5: Route engine discovery and launch through managed runtime resolution

**Files:**
- Modify: `crates/engine-core/src/lib.rs`
- Modify: `crates/engine-locust/src/lib.rs`
- Modify: `crates/engine-goose/src/lib.rs`
- Modify: `crates/engine-k6/src/lib.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: engine adapter tests

**Interfaces:**
- Add `RuntimeContext` with optional managed Locust, Cargo, and k6 executables plus scoped environment.
- Preserve the `LoadEngine` subprocess contract; update engine `detect` and `prepare_workspace` to receive the same resolver result so “ready” cannot disagree with launch.
- Discovery order is managed Loom runtime, then existing user PATH runtime; engine-specific errors include the selected source and actionable remediation.

- [ ] **Step 1: Write failing adapter resolution tests**

Cover managed-path priority, PATH fallback, unsupported/missing runtime, spaces/non-ASCII in executable and script paths, and launch argument boundaries. Goose tests assert Cargo remains the child executable and the generated scenario remains outside the Loom process.

- [ ] **Step 2: Run adapter tests to establish the current PATH-only behavior**

Run: `cargo test -p engine-locust -p engine-goose -p engine-k6`

Expected: New tests fail because adapters have no runtime context.

- [ ] **Step 3: Add runtime context to the engine trait and adapter constructors**

Keep runtime resolution separate from engine code. Use `Command::new(executable).args(args).envs(env)` for every child process; do not invoke a shell or mutate the parent process environment.

- [ ] **Step 4: Run adapter tests and complete workspace tests**

Run: `cargo test -p engine-locust -p engine-goose -p engine-k6`

Expected: PASS for both managed and existing PATH installs.

Run: `cargo test --workspace`

Expected: PASS.

- [ ] **Step 5: Commit engine resolution changes**

```powershell
git add -- crates/engine-core crates/engine-locust crates/engine-goose crates/engine-k6 src-tauri/src/lib.rs
git commit -m "feat: resolve managed engine runtimes"
```

### Task 6: Replace onboarding hints with a resilient runtime setup experience

**Files:**
- Create: `src/components/setup/RuntimeSetupStep.tsx`
- Create: `src/components/setup/RuntimeSetupStep.test.tsx`
- Modify: `src/components/setup/OnboardingWizard.tsx`
- Modify: `src/components/setup/OnboardingWizard.test.tsx`
- Modify: `src/components/EnginesView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `RuntimeSetupStep` accepts runtime status, progress events, install/cancel callbacks, and continuation callback.
- Locust and Goose are selected by default; k6 is unselected until its distinct AGPL consent checkbox is accepted.
- Partial success continues to the app with failed runtimes visible and a retry path; an installation error never unmounts or crashes the desktop workspace.

- [ ] **Step 1: Write failing runtime-step and onboarding tests**

Cover defaults, k6 consent required before install invocation, per-engine progress text, indeterminate byte progress, cancel, one-engine failure with another ready, retry, skip setup, app resume after restart, and keyboard operation. Test that acceptance of the Loom EULA alone does not imply k6 license consent.

- [ ] **Step 2: Run the tests and confirm the runtime step is absent**

Run: `pnpm test -- src/components/setup/RuntimeSetupStep.test.tsx src/components/setup/OnboardingWizard.test.tsx`

Expected: FAIL because the runtime setup step does not exist.

- [ ] **Step 3: Implement runtime selection, progress, and recovery UI**

Render engine-specific stages and status text, accessible progress semantics, disabled states while requests are active, and precise retry/cancel actions. Subscribe to progress only while onboarding or Engine settings is mounted and clean up listeners on unmount.

- [ ] **Step 4: Wire onboarding to native IPC and retain non-blocking app access**

After EULA acceptance, start the runtime selection step. Allow the user to continue with any failed/skipped engine, persist setup completion separately from runtime state, and expose “Install or repair runtimes” in Engine settings.

- [ ] **Step 5: Run focused and full frontend checks**

Run: `pnpm test -- src/components/setup/RuntimeSetupStep.test.tsx src/components/setup/OnboardingWizard.test.tsx src/components/EnginesView.test.tsx`

Expected: PASS.

Run: `pnpm test`

Expected: PASS without duplicate listeners or cross-test state leakage.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 6: Commit first-run and recovery UI**

```powershell
git add -- src/components/setup src/components/EnginesView.tsx src/App.tsx src/index.css
git commit -m "feat: add first run runtime setup"
```

### Task 7: Update licensing and user/developer documentation

**Files:**
- Modify: `LICENSES.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `PRODUCT.md`
- Modify: `src-tauri/tauri.conf.json` only if bundle configuration currently includes runtime artifacts.

- [ ] **Step 1: Write documentation assertions**

Add a small script or test that fails if docs claim k6 is automatically downloaded without consent, claim engine binaries are shipped in Loom, claim onboarding requires global PATH, or describe the desktop frontend as a hosted web application.

- [ ] **Step 2: Run the documentation check and observe the conflicting legacy policy**

Run: `pnpm run audit:runtime-docs`

Expected: FAIL on the current `LICENSES.md` no-automatic-download statement and stale PATH/onboarding guidance.

- [ ] **Step 3: Update policy and architecture language**

Describe k6 as an optional, user-consented, verified fetch from the official source, with no k6 binary in Loom artifacts. Document managed per-user paths, external subprocesses, network/offline behavior, troubleshooting, website separation, and the boundaries between desktop, engine, and later self-host service projects.

- [ ] **Step 4: Run documentation and project checks**

Run: `pnpm run audit:runtime-docs`

Expected: PASS.

Run: `cargo test --workspace`

Expected: PASS.

- [ ] **Step 5: Commit licensing and architecture updates**

```powershell
git add -- LICENSES.md README.md CONTRIBUTING.md docs/ARCHITECTURE.md PRODUCT.md scripts package.json
git commit -m "docs: document managed runtime architecture"
```

### Task 8: Add supported-platform CI and real application smoke coverage

**Files:**
- Create or modify: `.github/workflows/runtime-manager.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Create: `src-tauri/tests/runtime_smoke.rs`

- [ ] **Step 1: Define CI test matrix and artifact checks**

Run unit and packaging jobs on Windows x64, macOS x64/arm64 where runners are available, Linux x64, and Linux arm64 where available. Ensure ordinary CI uses local fake upstreams; a scheduled/manual upstream canary performs real version probes without blocking each pull request.

- [ ] **Step 2: Write failing desktop runtime smoke checks**

Check fresh app data, wizard status load, default Locust/Goose selection, k6 consent gating, install event delivery, partial runtime failure, app window remains alive, and no runtime binary exists under the packaged Tauri resource inventory.

- [ ] **Step 3: Run local smoke target and verify expected failure before implementation**

Run: `cargo test -p loom --test runtime_smoke`

Expected: FAIL until the smoke harness and runtime IPC behavior exist.

- [ ] **Step 4: Add cross-platform CI, manifest validation, and bundle inventory checks**

Each platform validates artifact keys and checksum syntax, runs native tests, builds the desktop installer, and scans bundle files to ensure engine runtimes are not embedded. Keep full live download installation in scheduled/manual canary jobs to avoid flaky PR builds.

- [ ] **Step 5: Run all local CI-equivalent checks**

Run these commands separately from the repository root:

```powershell
cargo test --workspace
cargo check --workspace
pnpm test
pnpm run build
pnpm run audit:design
pnpm run audit:runtime-docs
docker compose config
pnpm tauri build
```

Expected: every command passes, a current-platform installer is produced, and its inventory contains no engine runtime binary.

- [ ] **Step 6: Commit platform coverage**

```powershell
git add -- .github/workflows src-tauri/tests/runtime_smoke.rs docs/superpowers/plans/fixtures
git commit -m "test: cover runtime setup across desktop platforms"
```

### Task 9: Full implementation review and release qualification

**Files:**
- Review: all files from Tasks 1-8.
- Update: `docs/superpowers/specs/2026-09-27-loom-runtime-manager-design.md` only for reviewed decisions that change behavior.
- Update: failing or missing tests at their owning paths.

- [ ] **Step 1: Run the complete automated verification set**

Run each command separately from the repository root:

```powershell
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo check --workspace
pnpm test
pnpm run build
pnpm run audit:design
pnpm run audit:runtime-docs
docker compose config
pnpm tauri build
```

Expected: all commands pass, and the Tauri bundle inventory has no runtime binaries.

- [ ] **Step 2: Review install and launch safety paths**

Review downloader host restrictions, checksum source/pinning, archive traversal protection, cancellation cleanup, concurrent installation locks, restart recovery, per-user boundaries, consent persistence, command argument arrays, engine resolution order, and startup behavior under corrupt metadata or database/runtime failures. Add a regression test for every defect found before fixing it.

- [ ] **Step 3: Exercise fresh install, upgrade, offline, and repair on available OSes**

From clean user profiles or disposable VMs, install Loom, accept terms, install Locust/Goose, opt into k6, launch one small authorized sample per selected engine, cancel an install, retry after simulated network loss, and upgrade while preserving user projects/history. Use CI release runners for unavailable local operating systems.

- [ ] **Step 4: Request an independent whole-change review**

Use a fresh reviewer to inspect the complete diff against the design spec, subprocess policy, licenses, failure handling, and platform matrix. Resolve all blocker/high issues and rerun affected tests plus the full verification set.

- [ ] **Step 5: Produce the review handoff**

Record commit IDs, verified OS/installer artifacts, exact test output summaries, known unsupported architectures, and any upstream-canary limitation in the release notes. Do not claim cross-platform ready unless each supported platform has a successful package and smoke result.

---

## Follow-on Project: Public Website

The public website is intentionally not part of this runtime implementation plan. It needs its own surface brief/spec and independent plan after this runtime spec is implemented. It will have a distinct Vite root/output path and static hosting artifact; the Tauri app will continue bundling only the desktop workspace. Docker self-host control-plane/API work remains a third, separate architecture project.
