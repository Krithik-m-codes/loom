# Loom Scenario Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task on `main`. Use TDD for each behavior; keep engine execution subprocess-only.

**Goal:** Ship a cross-platform Loom desktop release where users can create projects, import Locust/Goose/k6 scripts and configs into a source-preserving visual scenario editor, lint/check Python and Rust in Monaco, save exact artifacts, and run them.

**Architecture:** A typed, versioned scenario document and compile-time engine-adapter registry separate parsing, compatibility, artifact generation, and UI. Tolerant parsers produce source-mapped visual nodes plus opaque native-code regions; the Tauri backend owns project-scoped persistence, managed language-tool processes, and engine runs. Monaco language services use explicit per-engine toolchains; no source is executed by parsing, automatic checks, or formatting.

**Tech Stack:** React 19, TypeScript, Monaco 0.55.1, `monaco-languageclient` 10.7.0, `vscode-ws-jsonrpc` 3.5.0, Vitest/Testing Library, Tauri 2, Rust/Tokio, Tree-sitter Rust grammars, SQLite, existing `runtime-manager`, existing Locust/Goose/k6 subprocess adapters, platform release GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-loom-scenario-studio-design.md`

## Global Constraints

- “The diagram must not pretend it can semantically represent arbitrary source.”
- “Unknown, dynamic, or unsupported source remains present and identifiable as an engine-native block.”
- “Import, edits, save, and export must never silently lose source behavior.”
- “Parsing and linting do not evaluate imported code.”
- “Cargo checks that can resolve or build user dependencies are never launched on every keystroke; they require an explicit check action and clear notice that build scripts/dependencies may execute.”
- “Arbitrary URLs, shell command strings, caller-controlled executable paths, and unrestricted filesystem writes are forbidden.”
- “k6 stays BYO/upstream-managed, is never embedded in Loom, and retains the separate AGPL consent gate.”
- “Adding an engine means adding a reviewed Loom adapter and subprocess integration.”
- Support Windows, macOS, and Linux; unsupported tools/platforms disable only the relevant operation.
- Use `pnpm` for JavaScript and `cargo` for Rust; do not discard pre-existing worktree changes.

## Review Focus

1. Dynamic Python/Rust/JavaScript and macro-generated code must stay intact and visibly opaque; parser fixtures assert exact source preservation.
2. Large, malformed, and canceled imports must not hang or produce an empty/fabricated flow; tests cover line/byte caps and cancellation.
3. Script, engine config, environment, and CLI precedence must not be conflated; tests cover each engine's actual precedence and unknown config keys.
4. Diagnostics, formatting, Cargo checks, and LSP subprocesses must not escape the selected project or execute without explicit user action; tests cover hostile paths, output caps, timeout, cancellation, and confirmation.
5. A generated file bundle must be exactly the bundle saved and run; integration tests compare previewed content, reopened content, and adapter arguments.

## File Map

| Area | Responsibility |
| --- | --- |
| `crates/scenario-core/src/*` | Versioned serde IR, schema validation, migrations, source spans, compatibility diagnostics, built-in adapter registry and generators. |
| `crates/scenario-core/src/parsers/{locust,goose,k6}.rs` | Tree-sitter syntax trees and engine-specific source/config recognition; never evaluates source. |
| `src/lib/scenario/*` | TypeScript IPC models, adapter metadata, preview/diff orchestration and frontend document helpers. |
| `src/components/FlowchartBuilderView.tsx` and focused `src/components/scenario/*` | Accessible diagram, node palette/inspector, import report, code/artifact preview and diff. |
| `src/components/EditorView.tsx`, `src/components/ui/MonacoEditor.tsx`, `src/lib/editor/*` | Monaco models, diagnostics/problems UI, LSP/tool controls, save/format/check actions. |
| `crates/runtime-manager/src/*` | Pinned editor tools, managed installation/state/cancel/probe, isolated process configuration. |
| `src-tauri/src/{lib.rs,db.rs,runtime_commands.rs,editor_commands.rs}` | Project/suite/config artifact IPC, schema migration, diagnostics/LSP sessions, safe execution. |
| `src-tauri/src/scenario_commands.rs` | Native parse/config/generate IPC with cancellation, source-size limits, and validated engine IDs. |
| `crates/engine-core/src/lib.rs`, `crates/engine-{locust,goose,k6}/src/lib.rs` | Shared subprocess/engine contracts, project bundles, exact argument mapping. |
| `src/components/**/*.test.tsx`, `src/lib/scenario/**/*.test.ts`, Rust module tests, `tests/fixtures/scenarios/*` | Regression fixtures and focused behavior tests. |
| `docs/ARCHITECTURE.md`, `PRODUCT.md`, `LICENSES.md`, `README.md`, `CHANGELOG.md`, `.github/workflows/*` | Contributor contract, runtime/tool licensing, user workflow and platform release verification. |

## Preflight: Review and commit the already-requested main-branch changes

**Files:** Review every tracked and untracked path currently present on `main`; do not alter unrelated user work.

- [ ] Capture `git status --short`, `git diff --stat`, and inspect every tracked diff plus each untracked text file; verify branding/runtime/project changes are in-scope, no secrets or local outputs are staged, and no user data/demo projects are deleted.
- [ ] Run `pnpm test`, `pnpm run build`, `cargo test --workspace --locked`, `cargo check --workspace --locked`, and `git diff --check` against the existing uncommitted changes; fix task-related failures before continuing.
- [ ] Run `pnpm run audit:design`; confirm Tauri `.ico` and `.icns` are derived from the Loom mark, and confirm release files are current.
- [ ] Stage only the reviewed, user-authorized existing changes (including new docs/runtime/branding files) and commit them on `main` with a message describing the verified body of work; leave generated build directories and secrets unstaged.

## Task 1: Define the scenario IR and adapter contract

**Files:** Create `crates/scenario-core/{Cargo.toml,src/{lib,model,migrate,registry}.rs}` and Rust tests; add the crate to workspace `Cargo.toml`; create TypeScript mirrors in `src/lib/scenario/types.ts` and tests; modify shared engine types only to remove hard-coded visual assumptions.

**Interface produced for later tasks:**

```ts
export interface SourceSpan { fileId: string; startOffset: number; endOffset: number }
export interface SourceDocument { id: string; fileName: string; language: string; content: string }
export interface EngineConfigFile { id: string; fileName: string; format: "locust-conf" | "toml" | "json" | "loom-goose-toml"; content: string }
export interface ScenarioDiagnostic { code: string; severity: "error" | "warning" | "info"; message: string; span?: SourceSpan }
export interface ParseContext { projectId: string; suiteId: string; maxBytes: number; cancelId: string }
export interface ParseResult { source: SourceDocument; nodes: ScenarioNode[]; diagnostics: ScenarioDiagnostic[]; coveredRanges: SourceSpan[]; supportPercent: number }
export interface ConfigParseResult { source: EngineConfigFile; recognized: Record<string, unknown>; diagnostics: ScenarioDiagnostic[] }
export type ScenarioNode =
  | { id: string; kind: "request"; engineIds: string[]; span?: SourceSpan; method: string; url: string; headers?: Record<string, string>; body?: string }
  | { id: string; kind: "wait"; engineIds: string[]; span?: SourceSpan; seconds: number }
  | { id: string; kind: "check"; engineIds: string[]; span?: SourceSpan; expression: string }
  | { id: string; kind: "group" | "loop"; engineIds: string[]; span?: SourceSpan; label: string; children: ScenarioNode[]; iterations?: number }
  | { id: string; kind: "native"; engineIds: string[]; span: SourceSpan; reason: string };
export interface ScenarioDocument {
  schemaVersion: 1; engineId: string; projectId: string; suiteId: string;
  sources: SourceDocument[]; nodes: ScenarioNode[]; configFiles: EngineConfigFile[]; legacyPayload?: string;
}
export interface EngineBundle { engineId: string; files: Array<{ path: string; content: string; role: "script" | "config" | "manifest" }>; diagnostics: ScenarioDiagnostic[] }
export interface EngineAdapterMetadata { id: string; displayName: string; licenseTier: "core" | "plugin"; sourceKinds: string[]; configKinds: string[]; compatibleNodeKinds: string[] }
```

`crates/scenario-core` owns serde types and the native trait:

```rust
pub struct ParseContext { pub project_id: String, pub suite_id: String, pub max_bytes: usize, pub cancel_id: String }
pub struct SourceDocument { pub id: String, pub file_name: String, pub language: String, pub content: String }
pub struct EngineConfigFile { pub id: String, pub file_name: String, pub format: String, pub content: String }
pub trait ScenarioEngineAdapter: Send + Sync {
    fn metadata(&self) -> EngineAdapterMetadata;
    fn parse_script(&self, source: &SourceDocument, context: &ParseContext) -> ParseResult;
    fn parse_config(&self, source: &EngineConfigFile) -> ConfigParseResult;
    fn generate(&self, document: &ScenarioDocument) -> Result<EngineBundle, Vec<ScenarioDiagnostic>>;
    fn validate(&self, document: &ScenarioDocument) -> Vec<ScenarioDiagnostic>;
}
```

`ScenarioRegistry::builtins()` registers those adapters. TypeScript stores only metadata and mirrors the serialized schema; shared JSON fixtures check parity. Tauri commands are named `parse_scenario_source`, `parse_engine_config`, and `generate_scenario_bundle` and reject unknown engine IDs.

- [ ] Create the workspace crate skeleton and a compiling migration stub that returns `ScenarioError::UnsupportedVersion`; then add this Rust schema regression:

```rust
#[test]
fn legacy_nodes_migrate_without_losing_unknown_json() {
    let raw = r#"[{"id":"old-1","type":"http","path":"/x","vendor":"keep-me"}]"#;
    let migrated = migrate_visual_nodes(raw).unwrap();
    assert_eq!(migrated.schema_version, 1);
    assert_eq!(migrated.legacy_payload.as_deref(), Some(raw));
    assert!(matches!(migrated.nodes.first().unwrap(), ScenarioNode::Request { .. }));
}
```

- [ ] Run `cargo test -p scenario-core legacy_nodes_migrate_without_losing_unknown_json`; confirm the failure is the stub error, not a compiler or missing-package error.
- [ ] Run `pnpm test -- src/lib/scenario`; verify missing schema/validator behavior fails the new tests.
- [ ] Implement version-1 types, runtime validation, and a migration function that rejects unknown future versions without deleting persisted raw data.
- [ ] Add registry tests proving Locust, Goose, and k6 are registered and a test adapter can be added without changing canvas code.
- [ ] Run focused tests, `pnpm run build`, and `git diff --check`; commit only the IR and registry files.

## Task 2: Parse scripts and engine configs without execution

**Files:** Create `crates/scenario-core/src/parsers/{mod,locust,goose,k6}.rs`; Rust parser tests and fixtures under `crates/scenario-core/tests/fixtures/`; add Tree-sitter and maintained Python/Rust/JavaScript grammar crates with versions pinned in `Cargo.lock`; create `src-tauri/src/scenario_commands.rs` and register its commands in `src-tauri/src/lib.rs`.

**Consumes:** `ScenarioEngineAdapter`, `ScenarioDocument`, `SourceSpan`, and `ScenarioDiagnostic` from Task 1.

**Produces:** `ScenarioEngineAdapter::parse_script(&SourceDocument, &ParseContext) -> ParseResult` and `parse_config(&EngineConfigFile) -> ConfigParseResult` for each adapter. `ParseResult` contains ordered nodes, byte-offset source spans, covered ranges, diagnostics, and the exact original `SourceDocument`.

- [ ] Add realistic Locust Python, Goose Rust, and k6 JavaScript/TypeScript fixtures with multiple users/scenarios, helper functions, configs, macros/dynamic code, and a 10,000-line fixture. Pin source preservation with a test such as:

```rust
#[test]
fn locust_parser_keeps_dynamic_helper_source_opaque() {
    let source = include_str!("fixtures/locust/dynamic_helpers.py");
    let context = ParseContext { project_id: "p1".into(), suite_id: "s1".into(), max_bytes: 2 * 1024 * 1024, cancel_id: "test".into() };
    let parsed = parse_locust(source, &context);
    assert!(parsed.nodes.iter().any(|node| matches!(node, ScenarioNode::Native { .. })));
    assert_eq!(parsed.source.content, source);
    assert!(parsed.nodes.iter().any(|node| matches!(node, ScenarioNode::Native { reason, .. } if !reason.is_empty())));
}
```
- [ ] Add Locust `.conf`/TOML/`[tool.locust]`, Goose Loom-owned run-profile, and k6 JSON-config fixtures; assert unknown keys remain in the original config and precedence warnings are explicit. For each parser, test an absent optional field and a duplicate/invalid key.
- [ ] Run focused fixture tests and confirm tests fail for absent parsers and for any parser that loses an opaque region.
- [ ] Implement bounded, non-evaluating parse adapters: recognize only documented request/load/check/wait/group forms; emit opaque native nodes for all other source spans; emit source-mapped errors for malformed syntax.
- [ ] Enforce a 2 MiB maximum per imported source/config, a 64-level nesting limit, a 2-second parse budget, and the request cancellation ID; return diagnostics rather than throwing through React/Tauri.
- [ ] Run parser tests for all three engines, config tests, `pnpm run build`, and `git diff --check`; commit parser and fixture changes.

## Task 3: Generate validated engine bundles and preserve run equivalence

**Files:** Create `crates/scenario-core/src/generators/{mod,locust,goose,k6}.rs`; Rust golden tests; modify existing engine preparation only where a specific bundle file or config argument cannot be represented safely.

**Consumes:** Task 1 schema and Task 2 parsed/configured documents.

**Produces:** `ScenarioEngineAdapter::generate(&ScenarioDocument) -> Result<EngineBundle, Vec<ScenarioDiagnostic>>`, using the serialized `EngineBundle` contract defined in Task 1.

- [ ] Write per-engine golden tests: Locust `.py` and config, Goose `Cargo.toml` + `.rs` + Loom-owned run profile, k6 `.js`/`.ts` + optional `config.json`.
- [ ] Add injection tests for newline-bearing labels, quotes, headers, paths, invalid numeric profile values, secret references, incompatible node families, and opaque blocks. For each engine assert the generated output contains the correctly escaped value and still contains the complete native block source.
- [ ] Run generator tests and confirm they fail before implementation and reject incompatible documents rather than dropping nodes.
- [ ] Implement deterministic, language-aware escaping and engine option precedence; output exact previewable files and keep engine-specific blocks intact.
- [ ] Validate generated Locust syntax, k6 syntax, and Goose manifest/source structure with non-network test fixtures; verify generated `cargo check` is only available through explicit user-confirmed check.
- [ ] Run focused generator tests and build; commit generators and golden fixtures.

## Task 4: Build the visual scenario editor around the IR

**Files:** Split `FlowchartBuilderView.tsx` into `src/components/scenario/{ScenarioCanvas,NodePalette,NodeInspector,CompatibilityPanel,ArtifactPreview,ImportSourceDialog}.tsx`; update component styles and tests; retain `FlowNode` only as a migration input.

**Consumes:** Scenario model, registry, parse diagnostics, engine bundles from Tasks 1–3.

**Produces:** `ScenarioStudio` accepts `document`, `onChange(document)`, `adapter`, and `onSaveBundle(bundle)`; diagram layout is derived from document order, not hard-coded coordinates.

- [ ] Add Testing Library tests for import-result nodes, opaque code/source ranges, three-engine tabs, config/report view, select/edit/add/delete/reorder, nested group edit, incompatible node warnings, and no-project empty state.
- [ ] Add keyboard move-up/down and palette add tests; assert focus remains on moved node and an `aria-live` announcement describes the move.
- [ ] Implement canvas/inspector from typed IR with validated controls, explicit drop indicators, keyboard operations, and deterministic layout; remove sample `initialNodes` from normal new-project state.
- [ ] Add generated artifact preview and a diff-confirmation state; reject applying changes when source spans overlap ambiguously and leave original source unchanged.
- [ ] Add large-flow rendering coverage (at least 1,000 nodes) and prove UI stays responsive using bounded/cancellable parse and memoized layout behavior.
- [ ] Run `pnpm test -- src/components/scenario src/components/FlowchartBuilderView.test.tsx`, full frontend tests, design-token audit, and build; commit editor changes.

## Task 5: Add real Python/Rust editor services and diagnostics

**Files:** Create `src/components/editor/{ProblemsPanel,ToolStatus,CheckConfirmation}.tsx`, `src/lib/editor/{diagnostics,lsp-client,model}.ts`, `src-tauri/src/{editor_commands,language_server}.rs`; extend `crates/runtime-manager/src/{manifest,provision,probe}.rs` and runtime tests; update `src/components/ui/MonacoEditor.tsx`, JS lockfile, `RuntimeSetupStep`, and tooling/license docs. Add `monaco-languageclient@10.7.0` and `vscode-ws-jsonrpc@3.5.0`; align `monaco-editor` to the compatible stable `0.55.1` line.

**Consumes:** existing managed CPython/uv, rustup, Tauri subprocess environment, Monaco editor, and task-1 engine IDs.

**Produces:** typed `EditorDiagnostic` with file/range/severity/code/source/message; project-bound language sessions; per-language tool status; cancellable check/format operations.

The LSP transport binds an ephemeral `127.0.0.1` port only, accepts only the active Tauri WebView origin and a cryptographically random one-use session token, and bridges WebSocket JSON-RPC to managed child-process stdio. The session supervisor launches only pinned `pyright-langserver --stdio`, `ruff server`, and `rust-analyzer` paths resolved by Runtime Manager; it disables rust-analyzer cargo check-on-save. No generic process, URL, or filesystem parameters cross IPC.

- [ ] Add a frontend transport test with a fake JSON-RPC server: one initialize/initialized cycle and one `textDocument/publishDiagnostics` notification become Monaco markers at the same 1-based source line/column.
- [ ] Add a Rust host test proving a wrong origin, missing token, reused token, non-loopback bind address, and unregistered tool path are rejected before process spawn.
- [ ] Pin managed tools in the runtime manifest/lock: Ruff and Pyright for Locust/Python selection; rust-analyzer, rustfmt, and Clippy components for Goose/Rust selection. Store them as editor tools, separate from the engine's license/availability metadata.
- [ ] Implement the one-use loopback WebSocket bridge, Content-Length stdio framing, session cleanup on project/suite/app close, and bounded LSP message size. Use the `monaco-languageclient` 10.7 / Monaco 0.55.1 compatibility row documented at `https://github.com/TypeFox/monaco-languageclient/blob/main/docs/versions-and-history.md`.
- [ ] Connect Python files to Pyright and Ruff; connect Rust files to rust-analyzer. Map diagnostics, completion, hover, and formatting ranges to Monaco. Configure rust-analyzer so saving or typing never starts Cargo check/clippy.
- [ ] Add an explicit Cargo Check/Clippy action with one-time execution warning, project-root validation, network/dependency controls, progress, cancellation, timeout, and source-mapped JSON diagnostics. Show formatter diffs before apply.
- [ ] Run fake-server frontend/Rust host tests, runtime-manager tests, editor IPC tests, full frontend tests, Rust workspace tests/checks, and desktop build; commit editor services and provisioning changes.

## Task 6: Integrate import, projects, persistence, and execution

**Files:** Modify `src/components/EditorView.tsx`, `src/App.tsx`, `src/types.ts`, `src/lib/ipc.ts`, add `@tauri-apps/plugin-dialog` and narrowly scoped open-file capabilities, and modify `src-tauri/src/{db.rs,lib.rs,editor_commands.rs,scenario_commands.rs}` plus app/project tests.

**Consumes:** IR, adapters, editor services, and bundles from Tasks 1–5.

**Produces:** a suite-scoped flow where `Import -> Diagram/Code -> Check -> Preview -> Save -> Run -> Results` always addresses the same project, suite, engine, and exact file contents.

- [ ] Add App/IPC integration tests proving engine/project selection, imported source, config artifacts, diagram document, saved files, and run request retain the same IDs and contents.
- [ ] Add SQLite migration tests for old `visual_nodes` arrays, corrupt JSON, empty suite, engine changes, and preservation of unrelated user data/files.
- [ ] Implement project-scoped artifact persistence through safe Tauri commands; validate relative paths and engine file kinds in Rust, write via temp+atomic rename, and never accept arbitrary absolute frontend paths.
- [ ] Wire Import/Paste/Open File, Check, Format, Preview/Diff, Save, and Run controls; open files only through the native picker, code edits mark the IR stale until reparsed, and diagram edits mark source pending until preview confirmation.
- [ ] Pass saved artifact/config paths to existing Locust/Goose/k6 subprocess adapters as arguments; verify k6 consent and no bundled engine binary remain intact.
- [ ] Run `pnpm test`, `pnpm run build`, `cargo test --workspace --locked`, `cargo check --workspace --locked`, focused Cargo formatting, and `git diff --check`; commit integration changes.

## Task 7: Contributor contract, end-to-end fixtures, and cross-platform release

**Files:** Update `docs/ARCHITECTURE.md`, `PRODUCT.md`, `LICENSES.md`, `CONTRIBUTING.md`, `README.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`; add UI/native end-to-end test harness and local HTTP fixture.

- [ ] Add a local deterministic HTTP fixture server and end-to-end test path: create project, create suite, paste one representative script per engine, inspect parse coverage, edit one node, preview diff, save/reopen, check, and run a small local test where the engine/runtime is available.
- [ ] Document engine adapter addition with one test adapter, how to add parser/config/diagnostic/generator tests, source-compatibility contract, license review, and subprocess requirements.
- [ ] Update release CI to build Windows NSIS/MSI, macOS DMG, and Linux deb/AppImage where supported; archive unsigned artifacts and publish checksums. Fail release if version/tag/config versions disagree or any platform package job fails.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run lint`, `pnpm run build`, design audit, `cargo fmt --check` for changed crates, `cargo test --workspace --locked`, and `cargo check --workspace --locked`.
- [ ] Build and install the Windows NSIS installer into a clean user profile; test project creation, Locust import/diagram/check/run against the local fixture, reopen, stop, and results. Verify Goose/k6 start paths and visible unavailable/consent states.
- [ ] Wait for Windows/macOS/Linux CI package matrix to pass before tagging. Bump `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together from `0.2.0` to `0.3.0`, create/push `v0.3.0` only after install smoke succeeds, then verify GitHub Release assets and checksums are downloadable.
- [ ] Commit release docs/config separately from implementation, and record real platform smoke-test results; do not call untested platform installs verified.

## Execution Handoff

Implement on `main` in the native single-agent workflow. Keep commits task-scoped and do not stage unrelated pre-existing changes until their diffs have been reviewed against the user's earlier “commit all changes” request. Do not publish a release until Task 7's Windows install smoke and Windows/macOS/Linux package matrix pass. At release time, use the existing `v*` tag workflow and verify the generated release assets before reporting a download link.
