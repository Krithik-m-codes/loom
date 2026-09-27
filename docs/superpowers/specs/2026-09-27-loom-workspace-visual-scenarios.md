# Loom Kubus-Inspired Workspace and Visual Scenario Design

## Goal

Make Loom's installed Tauri desktop app feel like a focused, project-first engineering workspace: compact global context, persistent work tabs, a navigable project tree, and a dense but calm work surface. Keep Loom's near-black surfaces and electric green brand; borrow structural interaction patterns from Kubus, not its identity or Kubernetes-specific UI.

The visual scenario builder becomes a genuine drag-and-drop authoring surface for Locust, Goose, and k6. A typed scenario model is the source of truth for the supported visual subset. Each engine has a native-code preview/export, and an explicit engine-code/config block remains available for capabilities outside the common model. Do not imply arbitrary source files can always be losslessly parsed into nodes.

## Product principles

- Desktop-first and local-first. React remains the Tauri app UI; the marketing website is a separate deliverable and is not the application shell.
- A fresh install opens to an empty, useful workspace, not a sample project. Existing user projects remain intact.
- Project identity and current engine/target are visible before navigation. Project actions sit at the top of the workspace/sidebar hierarchy.
- The canvas is a semantic workflow editor rather than a freeform diagram: drag-to-reorder and drop-to-insert are accessible, deterministic, and reflected in generated code.
- Prefer a portable common scenario model, but expose engine-specific details and custom code rather than flattening engine differences into misleading generic controls.
- Generated code is inspectable and editable. Users can save engine-specific files into their projects and run those exact files through existing subprocess adapters.

## Workspace information architecture

1. **Context bar:** Loom mark, project picker/create action, selected engine, target host, runtime status, and settings/command search. Project is the first contextual control after the brand.
2. **Work tabs:** persistent closable tabs for Overview, Visual Scenario, Script, Run, and Results; selected tab is visibly marked. New-tab action is keyboard accessible.
3. **Resource sidebar:** project tree at the top (project, suites/scenarios, engine-specific files), then primary destinations and engine/runtime status. Filter/search remains available. No empty sidebar placeholders masquerade as content.
4. **Work surface:** page-specific content with a compact title/description/action row. Dashboard cards and tables use Kubus-like restrained density, border hierarchy, and contextual status colors translated to Loom tokens.

Keep existing keyboard command palette and run controls. On narrow windows, collapse resource navigation behind a toggle and preserve the context bar's project and active-run status.

## Project lifecycle and migration

- Replace `DEFAULT_PROJECTS` demo seeding with an empty-first state that offers clear Create Project, Open Existing Project, and optionally Create from Template actions. Templates are opt-in and visibly labeled as examples.
- On upgrade, remove only known shipped demo IDs (`proj-ecommerce`, `proj-gateway`) from saved `loom_projects`; preserve all unknown/user project IDs and all other fields. Preserve a selected user project; if the selected ID was removed or is invalid, select the first remaining project or none.
- Handle no-project state throughout app initialization, dashboard, suite explorer, runner, builder, and selected config without throwing or inventing a demo host/script. Disable run until a project and valid engine script/config exist; explain the next action.
- Never delete user-authored project files. Example scripts in `examples/` remain developer fixtures, not seeded projects.

## Visual scenario model

Use a versioned, serializable `ScenarioDocument` containing project/scenario metadata, selected engine, target, load profile, ordered node graph, and engine extensions. Nodes have stable IDs, explicit validated properties, and optional children for nesting. Provide migration/validation for older persisted visual scenarios.

### Shared visual node families

- Load profile: users/VUs, ramp/stages, arrival rate where supported, duration, pacing/spawn/hatch rate, graceful stop, and per-engine profile settings.
- HTTP request: method, relative or absolute URL, headers, query, body and encoding, auth/secrets references, timeout, redirects, tags/name, and checks/expected response.
- Wait/pacing and transaction/group boundaries.
- Check/assertion, metric tag, threshold/SLO.
- Loop/iteration, condition/branch, and data/parameter source where target engine supports them.
- Setup and teardown hooks.
- Engine code/config block with language, engine, source, and safety/validation status; this is the escape hatch for engine-native features.

Each visual node advertises engine compatibility. Unsupported constructs are never silently discarded: show a compatibility issue and require the user to convert, remove, or represent it in a native block before export/run. Engine-specific options remain discoverable in an Advanced section.

### Engine-native compiler outputs

- **Locust:** Python user/task classes, wait policy, host, weighted tasks, request options, task groups, setup/teardown, and load profile/CLI config.
- **Goose:** a generated Rust scenario project (manifest and source) with users/hatch settings, scenario/task weights, transaction/group metrics, hooks, and CLI/config values. Do not confuse Rust source with a standalone config file.
- **k6:** JavaScript/TypeScript-compatible script with scenario executors, VUs/stages/arrival-rate settings, checks, thresholds, tags/groups, setup/teardown, and environment options. Keep k6 acquisition/AGPL consent behavior governed by the Runtime Manager design.

Represent outputs as an engine bundle (`primary script` plus any required companion config/manifest), validate each file name and engine-specific semantics, and provide preview, save-to-project, and run actions. Existing script editor remains the escape hatch for source-first authoring. If imported code cannot be represented, keep it as a native code block and explain that round-trip node editing is unavailable.

## Drag-and-drop and accessibility

- Palette items are draggable and also addable with a button; canvas provides explicit drop indicators and keyboard move-up/down controls.
- Reordering and nesting announce changes to screen readers; focus stays on the moved node. Do not rely on color alone for node type or validation state.
- Node selection opens a properties inspector with labeled inputs, inline validation, and unsaved-state feedback.
- Canvas supports scroll/zoom with a visible reset action and remains usable at common desktop scaling.

## Visual language

Use existing Loom brand tokens (`#7CFF4D`, green secondary/accent, deep green-black surfaces, pale text, Inter) with restrained neutral borders and readable contrast. Kubus reference is structural inspiration: compact top context, tabbed work area, resource navigation, dense cards/tables, subtle selected states. Do not copy logos, text, exact assets, or Kubernetes taxonomy. Preserve Loom-specific icons, name, typography, and green accent.

Avoid dashboard-only redesign that leaves project setup, script authoring, execution, error, loading, empty, and offline states visually inconsistent. Motion must be brief and respect reduced-motion preferences.

## Reliability, security, and boundaries

- Pure schema validation and code generation are separated from React rendering and covered with deterministic tests per engine.
- Never interpolate untrusted node text into comments or source unsafely; use language-aware escaping and validated numeric fields. Secret values are references/environment variables, not embedded into generated files by default.
- Saving and running use explicit project-scoped paths and existing safe Tauri IPC. Do not create an arbitrary filesystem write surface in the frontend.
- Preserve subprocess-only engine invocation and license-tier policy. k6 is never bundled with Loom.
- Empty project state, malformed saved documents, stale demo migration, unsupported nodes, generator failures, and save failures are tested.

## Acceptance criteria

1. Existing users retain non-demo projects and new users no longer receive seeded demo projects.
2. Project actions and project tree appear before other sidebar sections; project, engine, host, and run context are easy to locate.
3. Tabs switch work surfaces without losing page state and retain a discoverable close/new-tab interaction.
4. The visual builder supports accessible add, drag reorder, edit, delete, nested workflow structures, and code preview for all three engines.
5. Exports are real engine-specific artifacts, validated and saved as project files; incompatible nodes are explained, never silently dropped.
6. Dashboard/runner/editor/builder remain stable with no project, no suites, missing runtimes, and malformed persisted data.
7. Frontend unit/component tests, Rust workspace tests, formatting/typecheck/build, and platform packaging smoke checks pass before release.

## Reference

Kubus website and open-source repository were consulted for layout and interaction patterns: https://kubus-app.dev/ and https://github.com/FloSch62/Kubus. This specification adapts general workspace conventions while retaining Loom's own visual identity.
