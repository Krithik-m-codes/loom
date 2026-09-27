# Loom visual-system overhaul — design

**Status:** Approved for planning
**Date:** 2026-09-27
**Scope:** Desktop visual system and branding only

## 1. Purpose and constraints

Loom is a local-first desktop load-testing tool for Locust, Goose, and k6. The
application must feel like a precise, native engineering console: dark,
information-dense, calm, and immediately legible while a test is running.

This subproject replaces the visual system across all existing desktop screens.
It does not change routes, state ownership, Tauri commands, database schema,
engine invocation, test configuration semantics, or business behavior. The
later runtime-management and self-hosted work is intentionally separate, so a
visual migration does not conceal a functional regression.

The existing workspace contains user changes in engine and onboarding files.
They are not part of this work and must be preserved.

### Success criteria

- Every existing screen uses one Loom visual language.
- The supplied `public/logo-icon.png` is the canonical interface brand asset;
  no component recreates the logo in SVG or CSS.
- Components consume centralized semantic tokens instead of component-local
  hexadecimal values.
- Existing user actions work unchanged: select projects/engines/scripts, edit
  scripts, create projects, start/stop/rerun tests, export a flow, browse
  history, use Cmd/Ctrl+K, and complete onboarding.
- The result remains usable at 1280×720, 1440×900, and 1920×1080, with reduced
  motion respected.

## 2. Product language

The defining direction is **dark engineering console + neon-lime telemetry**.
Neutral near-black surfaces occupy most of the interface. Lime means action,
selection, healthy telemetry, focus, or an active run; it is never generic
decoration. Secondary semantic colors are reserved for warning, error, and
informational states.

The system uses Inter for interface text and an existing monospace stack for
paths, console output, timestamps, status codes, and metric values. Metric
numbers use tabular figures and a stronger weight than their labels. Borders,
not shadows, define most panel boundaries. Radius stays restrained: 6px for
small controls, 8px for controls, and 10–14px for panels/modals. Motion is
150–250ms ease-out, limited to feedback and telemetry, and is disabled or
minimized under `prefers-reduced-motion`.

The supplied loop mark is used at three intentional scales:

- compact icon in app/favicons and constrained navigation contexts;
- icon + “Loom” wordmark in the sidebar and onboarding;
- slightly glowing hero treatment only in onboarding, empty, and live-running
  moments.

The wordmark is text, never an approximation of the mark. Regular navigation
uses no logo glow.

## 3. Design-token and primitive architecture

`src/index.css` becomes the single public token layer. It defines literal Loom
tokens for background, secondary background, surfaces, elevated surfaces,
borders, text, primary lime, supporting greens, semantic colors, spacing,
radii, typography, shadows/glows, and motion. Compatibility aliases may stay
where Tailwind utility usage needs them, but they must resolve to Loom tokens.

The target base palette is:

| Role | Token | Value |
| --- | --- | --- |
| app background | `--loom-bg` | `#070B0A` |
| secondary background | `--loom-bg-secondary` | `#0A0F0E` |
| panel surface | `--loom-surface` | `#0F1410` |
| raised surface | `--loom-surface-elevated` | `#121A14` |
| border | `--loom-border` | `#1E2A1F` |
| primary signal | `--loom-primary` | `#7CFF4D` |
| supporting green | `--loom-green` | `#22C55E` |
| primary text | `--loom-text` | `#E6FFE6` |
| secondary text | `--loom-text-secondary` | `#9CA89C` |
| muted text | `--loom-text-muted` | `#667066` |

Reusable visual primitives are deliberately small and composable:

- `LoomLogo` renders the supplied raster asset and optional text lockup.
- `Panel` and `SectionHeader` establish a shared technical-panel boundary.
- `PrimaryButton`, `SecondaryButton`, and `IconButton` standardize controls.
- `StatusBadge` renders text plus icon/dot for ready, running, starting,
  finished, and failed states.
- `MetricCard` owns label/value/delta/sparkline hierarchy.
- `TelemetryChart` standardizes grid, axes, series colors, and tooltips.
- `DataTable`, `SearchInput`, `EmptyState`, and `LiveLog` standardize dense
  utility surfaces.

Primitives own visual decisions only. They do not introduce a second state
layer or alter existing callback contracts.

## 4. Application layout and screen treatment

The shell stays a persistent sidebar and work area. The sidebar is 232px wide,
uses the application background and a single right divider, contains the
brand, project switcher, compact navigation, engine/script context, and the
Cmd/Ctrl+K affordance. The current selected destination receives a muted green
surface, a thin lime left indicator, lime icon, and readable text; inactive
items remain neutral.

The top navigation becomes a compact context header: breadcrumb/page title,
short operational description where useful, target/engine state, and one
clear run or stop action. It must not become a marketing hero.

Each existing view receives the following treatment without changing its data:

- **Dashboard:** operational heading; four strong metric cards; primary
  request/latency telemetry; live status/log region; compact engine quick
  starts. The only visual background motif is a low-contrast flowing data wave
  behind clearly readable heading or empty-state content.
- **Runner:** keeps the existing configuration and controls, but separates
  setup, active state, telemetry, endpoint statistics, exceptions, and logs
  into a scan-friendly panel hierarchy. Starting/running/stopped/failed is
  always communicated by icon, label, and color.
- **Script editor and flow builder:** preserve their editing/canvas behavior;
  present filenames, tool controls, output controls, and code/canvas boundaries
  as compact desktop tooling rather than rounded dashboard cards.
- **History and engines:** use dense technical tables/lists with monospace
  numerical alignment, compact license/runtime detail, and clear empty/error
  states.
- **Command palette, project modal, and onboarding:** share modal geometry,
  focus treatment, keyboard hints, validation, and controlled brand presence.

No existing destination is removed or renamed solely for styling.

## 5. Charts, interaction, and accessibility

Charts use the existing chart libraries. They receive shared grid, axis,
tooltip, area-fill, and series styling through tokens. A neon-lime primary line
has a restrained 10% fill and limited glow; errors retain a distinct red;
secondary measurements use a supporting green or neutral contrast color as
needed. Charts must expose labels and values through their existing accessible
rendering paths; color alone does not convey a pass/fail state.

All controls retain native focusability. Tokenized focus rings meet contrast
requirements, icon-only controls have labels, and disabled, empty, loading,
and error states state what happened and the next useful action. Layout grids
collapse content columns before shrinking essential controls; the desktop
sidebar remains usable at the 900px minimum window width.

## 6. Brand asset pipeline

`public/logo-icon.png` is the source image for web-facing icon use and the
Tauri icon-generation workflow. Generated desktop icon derivatives belong in
`src-tauri/icons/`; they are not manually redrawn. `index.html` points to the
new favicon source. The current custom `LoomLogo` SVG is replaced with an image
element using the supplied asset and a textual wordmark lockup.

The implementation must inspect transparency and padding before generation.
If the source asset needs safe transparent padding for system icons, a derived
source image is created without altering the mark itself.

## 7. Error handling and verification

Visual components must preserve the current props and callbacks. A styling
failure must not swallow a run, navigation callback, modal close action, or
Tauri error. Existing failures keep their source message but receive
token-consistent presentation.

Verification for this subproject includes:

1. Typecheck and production frontend build.
2. Existing frontend tests.
3. Targeted smoke inspection of every destination and modal in a running
   desktop build, including keyboard navigation and running/failed states.
4. Desktop checks at 1280×720, 1440×900, and 1920×1080.
5. A source scan confirming component-local raw palette values are removed or
   limited to documented asset/third-party exceptions.
6. Tauri icon configuration validation and a desktop bundle smoke build once
   the visual work is complete.

## 8. Explicitly deferred follow-on subprojects

This design creates visual seams for, but does not implement:

1. **Cross-platform runtime manager:** a signed, per-user runtime registry;
   Locust managed Python environment; opt-in official k6 acquisition; managed
   Rust SDK for Goose workspaces; and no global interpreter/toolchain PATH
   mutations.
2. **Engine workspace model:** distinct Locust, k6, and Cargo-based Goose
   project templates/configuration semantics and an adapter/runtime resolution
   API.
3. **Self-hosted control plane:** a separate authenticated headless service and
   Docker Compose topology that delegates jobs to official upstream engine
   images rather than bundling prohibited engine binaries.
4. **Release trust:** platform signing/notarization, runtime manifests,
   SBOMs, provenance attestations, installer smoke tests, and contributor
   issue/release materials.

Those subprojects require individual design and implementation plans because
they alter installation, execution, and security boundaries. They do not block
the visual migration.
