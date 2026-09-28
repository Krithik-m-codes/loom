# Loom Scenario Studio and Language-Aware Editor

## Status

Draft for user review. It refines the approved workspace visual-scenario design
for source import, engine configuration, editor diagnostics, and contributor
extensibility. No product implementation is authorized until this spec and its
implementation plan have been reviewed.

## Goal

Let a user create or open a project, paste/import a realistic Locust, Goose, or
k6 script or engine config, understand the recognizable workflow as a visual
diagram, make safe edits, inspect the exact engine-specific files that Loom
will save and run, and diagnose source issues in the bundled editor.

The diagram must not pretend it can semantically represent arbitrary source.
Unknown, dynamic, or unsupported source remains present and identifiable as an
engine-native block. Import, edits, save, and export must never silently lose
source behavior.

## User workflow

1. Create, open, or duplicate a project; create or select an engine-specific
   suite. Projects start empty unless a user explicitly chooses a template.
2. Select Locust, Goose, or k6 and choose `Script`, `Engine config`, or
   `Scenario profile` as the import type. Paste text or open a project file.
   Engine selection is explicit; extension or content guessing is only a
   suggestion and never changes the selected engine.
3. Parse without executing the imported source. Show a diagram for supported
   constructs, preserve unrecognized regions as source blocks, and list
   diagnostics with file and line ranges. A malformed file remains open in the
   code editor and shows parse diagnostics; it does not become an empty/demo
   diagram.
4. Edit supported diagram nodes or source. If an edit affects imported code,
   show the generated patch/diff and require review before replacing source.
   Preserve untouched source ranges byte-for-byte where feasible. If a safe
   merge cannot be established, require the user to choose which representation
   to keep rather than overwriting either.
5. Run formatter, linter, syntax/type checks, save, and run as explicit user
   actions. The editor displays tool availability, progress, cancellation,
   diagnostics, and actionable setup guidance.

## Scenario document and extension boundary

Use a versioned, serializable `ScenarioDocument` as the structured model for
only the visual subset. It records the engine ID, project/suite ID, source-file
references, load profile, ordered/nested nodes, source spans, and engine-native
extensions. Stable IDs, schema validation, migrations, and project-scoped
persistence are required.

Shared node families include load profile/stages, HTTP request, wait/pacing,
group/transaction, check/assertion, threshold/tag, supported loop/condition,
setup/teardown, and opaque engine-native source blocks. Each node declares
engine compatibility. Unsupported constructs remain visible as source blocks
with a reason; they cannot be dropped during generation.

Define one typed built-in `EngineAdapter` contract for engine identity and
license tier, script/config file kinds, parser/importer, supported node
capabilities, code/artifact generation, diagnostics, runtime requirements,
and run arguments. Register Locust, Goose, and k6 through this contract; a test
adapter proves the shared scenario surface can accept another built-in engine
without changing the diagram component. Adding an engine means adding a
reviewed Loom adapter and subprocess integration. Loading arbitrary third-party
code/plugins at runtime, user-provided binaries from URLs, and automatic
license approval remain out of scope.

## Import and artifact behavior

Script parsers are tolerant and non-executing. They recognize documented
framework constructs and source ranges, not arbitrary program semantics:

- **Locust:** Python `HttpUser`/task structure, common `self.client` requests,
  waits, response checks, common task sets, and statically recognizable load
  settings. Other Python statements remain source blocks.
- **Goose:** Rust Goose scenario/transaction registration, common request
  builder calls and response checks, plus statically recognizable user/test
  plan settings. Other Rust and macro-generated behavior remains source blocks.
- **k6:** JavaScript/TypeScript `options`, scenarios, common `k6/http` calls,
  `check`, `sleep`, groups/tags, and thresholds. Dynamic options and other
  modules remain source blocks.

Parsing must return source spans and an explicit support/compatibility report.
When the input is too large, malformed, uses dynamic metaprogramming, or has
unsupported constructs, preserve the original source and provide partial
visualization rather than timing out, crashing, or falsely claiming completeness.
The acceptance corpus includes long multi-class/multi-function scripts and
large configs; tests cover cancellation and a documented maximum input size.

Engine config is a distinct artifact from executable script:

- **Locust:** accept its config-file format and `[tool.locust]` TOML section;
  preserve unknown options and reflect recognized CLI/config values in the
  engine settings/profile. Keep Locust's documented precedence visible.
- **Goose:** source is a Rust Cargo project and runtime settings are primarily
  CLI flags/programmatic defaults. Loom may store its own typed Goose run
  profile and map recognized values to argument arrays; do not label this as a
  native Goose config file or overwrite user Rust defaults.
- **k6:** accept JavaScript/TypeScript script options and the supported JSON
  `--config` artifact. Show config/script/environment/CLI precedence and never
  silently overwrite higher-precedence values.

Exports are validated artifact bundles with preview, file-level compatibility
messages, project-scoped save, reopen, and run actions. A Locust bundle may
include `.py` plus a Locust config file; Goose includes Cargo manifest, Rust
source, and a Loom-owned run profile when needed; k6 includes `.js`/`.ts` and
optional JSON config. Files and engine-specific options remain separate and
inspectable. Secret values are environment references, not generated literals.

## Embedded editor and diagnostics

Keep Monaco as the bundled code editor. Monaco's base editor provides text
editing and language contributions, but does not automatically load arbitrary
VS Code extensions; Loom must explicitly implement language services and
diagnostic markers.

The first complete editor slice provides:

- Python, Rust, JavaScript, TypeScript, JSON, TOML, and Locust config syntax
  highlighting, correct model URIs/file names, basic editor navigation, and a
  problems panel mapped to source line/column.
- **Python:** managed CPython syntax checking, pinned Ruff lint/format support,
  and optional Pyright type diagnostics for Locust projects.
- **Rust/Goose:** managed rustfmt formatting, rust-analyzer diagnostics where
  the project context is available, and explicit `cargo check`/Clippy project
  checks. Cargo checks that can resolve or build user dependencies are never
  launched on every keystroke; they require an explicit check action and clear
  notice that build scripts/dependencies may execute.
- **k6 JavaScript/TypeScript:** syntax diagnostics and static lint diagnostics
  for the supported k6 syntax. `k6 run` remains a separate explicit action.
- A one-click “Check”/“Format” path with version/status visibility, progress,
  cancellation, and graceful behavior when tools are missing or offline.

Editor language tools are pinned, license-reviewed, and acquired through the
existing user-scoped Runtime Manager as part of the matching engine setup or
an explicit repair/install action. No administrator privileges, global PATH
changes, or runtime loading of arbitrary editor extensions. Tools execute as
subprocesses with argument arrays, scoped environment, project-root confinement,
timeouts, cancellation, bounded output, and actionable failures. Checks never
run user code implicitly. Formatting and fixes show a diff before applying.

The shared runtime/adapter layer remains the native integration point; all
engine tests execute in subprocesses and the k6 distribution/license policy is
unchanged. Platform behavior is supported on Windows, macOS, and Linux wherever
the pinned tool artifacts exist. Unsupported tools/platforms disable only the
relevant editor command; code editing, saving, and other engines continue.

## UX, persistence, and accessibility

The Visual view is a true semantic editor: accessible add/drag/drop, keyboard
reordering, selection inspector, validated property controls, nested supported
nodes, zoom/fit, focus retention, and screen-reader announcements. It includes
the selected engine's preview and the parse/compatibility report. The Code view
uses Monaco, diagnostics, lint/format/check controls, and unsaved indicators.
Switching views does not discard local edits. Save/reopen persists source,
scenario document, config artifacts, diagnostics metadata when appropriate,
and engine selection per project/suite without replacing unrelated files.

Do not seed demo projects or fabricated telemetry. Handle no project/no suite,
empty source, corrupt old visual metadata, invalid config, unavailable runtime,
offline tools, stale diagnostics, unsaved changes, and generator/save failures.
Use Loom's existing near-black/green visual system, not a green-filled canvas.

## Security and license constraints

- Parsing and linting do not evaluate imported code.
- Arbitrary URLs, shell command strings, caller-controlled executable paths,
  and unrestricted filesystem writes are forbidden.
- Cargo check/clippy are explicit user-invoked actions; display the build-script
  execution warning and honor cancel/timeout.
- Downloaded tools use fixed, versioned upstream manifests with checksum or
  equivalent documented integrity verification; tool licenses and source links
  are recorded in product/license docs.
- k6 stays BYO/upstream-managed, is never embedded in Loom, and retains the
  separate AGPL consent gate.
- Test/project source, credentials, URLs, and linter output are not uploaded or
  sent to Loom telemetry.

## Acceptance criteria

1. A fresh install creates a project and suite without a demo. A user can paste
   or open a realistic script/config for each of Locust, Goose, and k6, inspect
   its engine-aware diagram and support report, and save/reopen it.
2. Supported edits produce a previewed engine-correct artifact. Unsupported,
   dynamic, or malformed source remains intact and visible; there is no silent
   source or behavior loss.
3. Config files populate only the settings they actually define. Locust,
   Goose, and k6 formats and precedence are distinguished correctly.
4. Code view provides Python and Rust syntax diagnostics/lint/check/format with
   source-mapped results; JavaScript/TypeScript source gets syntax/static
   diagnostics. Missing/offline tools do not crash Loom.
5. A user can create, save, select, run, stop, and inspect results from the
   same selected project/suite. The exact files previewed are the files saved
   and used for the run.
6. The built-in engine contract supports adding a tested adapter without
   coupling engine selection, diagram primitives, or code editor to a
   hard-coded two-engine conditional; external dynamic plugins stay out of
   scope.
7. Tests cover representative large and malformed fixtures, source preservation
   and diffs, all three engine adapters, all config formats/precedence,
   runtime missing/offline/cancel/error paths, safe process arguments, save/run
   integration, and accessibility/keyboard editing.
8. Frontend and Rust tests/builds pass; platform packaging workflows build
   Windows, macOS, and Linux installers. A Windows install smoke test exercises
   project creation, source import, diagram inspection/edit, save/reopen, and
   a small test against a local fixture server before publishing a release.

## Research references

- Monaco editor API and language-contribution boundaries:
  https://github.com/microsoft/monaco-editor
- Pyright CLI/type-checker and output options:
  https://github.com/microsoft/pyright
  https://github.com/microsoft/pyright/blob/main/docs/command-line.md
- Ruff lint/format CLI and diagnostics:
  https://docs.astral.sh/ruff/
  https://docs.astral.sh/ruff/linter/
  https://docs.astral.sh/ruff/formatter/
- rust-analyzer diagnostics, installation, and Cargo-based checks:
  https://rust-analyzer.github.io/book/diagnostics.html
  https://rust-analyzer.github.io/book/installation.html
- Locust config formats, option precedence, and config users:
  https://docs.locust.io/en/latest/configuration.html
- Goose's scenario source and runtime-option model:
  https://book.goose.rs/getting-started/runtime-options.html
  https://book.goose.rs/getting-started/test-plan.html
- k6 script/config/CLI/environment precedence and JSON config:
  https://grafana.com/docs/k6/latest/using-k6/k6-options/how-to/
  https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
