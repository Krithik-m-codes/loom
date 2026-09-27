# Loom Workspace and Visual Scenario Implementation Plan

> **For agentic workers:** Follow the TDD and subagent-driven-development workflows. Implement one bounded task at a time; each task requires a fresh implementer and independent review before proceeding.

**Goal:** Redesign the Loom Tauri workspace around a project-first, Kubus-inspired layout in Loom's visual identity; remove seeded demo projects without deleting user data; and provide accessible, engine-aware visual scenario authoring for Locust, Goose, and k6.

**Architecture:** A versioned frontend scenario IR and pure validation/codegen modules sit beneath the React visual editor. Persisted projects remain local-first; generated scripts use project-scoped save/run IPC. The UI separates context bar, work tabs, resource tree, and active workspace. The website remains independent from the native app.

**Spec:** `docs/superpowers/specs/2026-09-27-loom-workspace-visual-scenarios.md`

## Constraints

- Keep Loom branding/colors and adapt only general layout patterns from Kubus; no direct brand/asset copying.
- Remove only known seeded project IDs; preserve all unknown saved project objects and files.
- Do not seed demo projects for fresh installs. Example scripts remain fixtures.
- Use the common node model only where engine semantics are honest; incompatibility must be visible. Preserve engine-native custom blocks.
- Goose output is a Rust scenario project bundle, not a config file pretending to be executable.
- Generated code must safely escape inputs and keep secrets as environment references.
- Retain subprocess-only engine invocation and k6 license constraints.
- Use `pnpm`; write tests before implementation. Verify all tests and builds before completion.

## Task 1: Remove default demo projects safely

**Files:** `src/App.tsx`, project state utilities/tests.

- Add failing migration tests for clean install, removal of the exact two shipped IDs, preservation of unrelated projects/fields and selected project, invalid active selection, corrupt JSON, and no-project initialization.
- Replace `DEFAULT_PROJECTS` and demo config fallback with empty-safe initialization.
- Keep old user projects untouched; no filesystem deletion.
- Add robust no-project states and disable run where project/script/config is absent.

## Task 2: Project-first Kubus-inspired workspace shell

**Files:** `src/components/Sidebar.tsx`, `TopNav.tsx`, `App.tsx`, CSS/design tokens, component tests.

- Add the compact context bar (brand, project, engine/target, runtime/run status, commands/settings).
- Place project tree/actions at the top of resource navigation.
- Create persistent closable work tabs for supported destinations, keeping keyboard navigation and command palette.
- Add responsive collapse, accessible state labels, and focused empty/loading/error states.
- Verify existing routes/actions continue to work without losing page state.

## Task 3: Define scenario IR, validation, and compatibility model

**Files:** new `src/lib/scenario/*`, shared types, unit tests.

- Create versioned scenario document with load profile, stable ordered/nested nodes, engine extensions, and migration/validation.
- Model request options, pacing, groups/transactions, checks/thresholds/tags, loops/conditions/data, hooks, and custom engine blocks.
- Add engine capability matrix and deterministic validation diagnostics; reject silent lossy generation.

## Task 4: Implement per-engine generation and artifact bundles

**Files:** new pure codegen modules and unit tests; Tauri project file IPC only if existing IPC cannot safely support project-scoped bundles.

- Generate Locust Python, Goose Rust project bundle (`Cargo.toml` + Rust source), and k6 JS artifacts with engine-specific profiles/options.
- Test escaping, defaults, invalid numeric input, compatibility diagnostics, and representative compilable output.
- Avoid arbitrary frontend-provided filesystem paths; use explicit project-scoped operations.

## Task 5: Rebuild visual editor with accessible drag/drop

**Files:** `src/components/FlowchartBuilderView.tsx` or replacement components, styles, component tests.

- Make palette items draggable and clickable; implement canvas insertion/reordering/nesting, selection inspector, keyboard move controls, deletion, and stable focus/announcements.
- Add engine selector, compatibility indicators, property forms, generated artifact preview, and save/run actions.
- Keep custom native code/config node and script-editor escape hatch.
- Test drag and keyboard alternatives, editor validation, unsupported nodes, save errors, and all three engines.

## Task 6: Integrate project lifecycle and generated artifacts

**Files:** project/suite types, app state, editor/runner IPC integration and tests.

- Create/open project workflow; save engine-specific artifact bundles as project files and reopen them on next launch.
- Let projects contain distinct Locust, Goose, and k6 scripts/configs; select suite and engine explicitly.
- Ensure output preview maps exactly to the file that will be run, and errors leave existing files untouched.

## Task 7: Full verification and review

- Run `pnpm test`, `pnpm run build`, `cargo fmt --check`, `cargo test --workspace`, `cargo check --workspace`, and available Tauri packaging smoke checks.
- Inspect Windows, macOS, and Linux implications, keyboard/screen-reader states, codegen/license security, empty-state behavior, and migration behavior.
- Fix findings, record limitations, and perform independent final review against the spec.

## Execution

Execute the approved runtime-manager plan independently first or in alternating bounded tasks where files do not overlap. This workspace plan is approved as user-requested design/behavior work; changes to scenario IR, project persistence semantics, or filesystem write boundaries that exceed the spec must be reviewed before implementation.
