---
name: Loom
description: Dark, local-first engineering console for multi-engine load testing.
colors:
  background: "#070b0a"
  background-secondary: "#0a0f0e"
  surface: "#0f1410"
  surface-elevated: "#121a14"
  border: "#1e2a1f"
  border-hover: "#2a3a2b"
  primary: "#7cff4d"
  primary-hover: "#96ff70"
  primary-foreground: "#071006"
  text: "#e6ffe6"
  text-secondary: "#9ca89c"
  text-muted: "#819081"
  success: "#22c55e"
  warning: "#f59e0b"
  error: "#ef4444"
  info: "#3b82f6"
  focus: "#d5ffbe"
typography:
  body:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.5
  heading:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  label:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
rounded:
  small: "6px"
  control: "8px"
  panel: "12px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
    height: "2.75rem"
  input:
    backgroundColor: "{colors.background-secondary}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
    height: "2.75rem"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.4}"
---

# Design System: Loom

## Overview

**Creative North Star: "The calm engineering console."**

Loom is a dense but unhurried local workspace for configuring and observing real load tests. Near-black, subtly green-tinted surfaces make telemetry, scripts, and process state easy to scan; bright lime is a precise signal for the current action, selection, and healthy live state rather than decoration. The approved visual concept key is `3f0f0f03`.

The canonical brand mark is `public/logo-icon.png`, supplied by the user. Use it as the Loom mark; do not substitute, redraw, or derive an alternate logo without explicit approval.

**Key Characteristics:**

- Operational, restrained, and local-tool-native.
- Tonal layers and one-pixel borders before ornamental effects.
- Human-readable application UI paired with monospace source, paths, commands, and metrics.

## Colors

The palette is a green-black field with a single high-energy lime action signal and unambiguous telemetry states.

### Primary

- **Lime signal:** reserved for primary actions, selected navigation, active tabs, focused fields, and running state.

### Secondary

- **Operational green:** communicates ready, completed, or healthy telemetry; it is distinct from the primary action signal.
- **Warning amber, error red, and information blue:** communicate their named operational states only.

### Neutral

- **Layered black-green surfaces:** establish the workspace, raised controls, panel separation, and fine structural borders.
- **Three text levels:** carry primary content, supporting content, and quiet metadata in descending order of prominence.

**The Signal Is Earned Rule.** Lime must identify a current action or meaningful state. It is not a generic accent wash or a substitute for hierarchy.

## Typography

Inter is the application voice: compact, highly legible, and moderately weighted. The monospace stack is functional, not decorative—use it for code, paths, command-like labels, tabular data, shortcuts, and live process output.

- **Page headings:** compact, semibold, slightly tightened, and balanced for workspace titles.
- **Section and control labels:** small, durable, and often uppercase with tracked monospace text when identifying technical metadata.
- **Metric values:** use the large numeric treatment with tabular figures; keep units and supporting context quieter.
- **Body copy:** stay concise and scan-friendly; avoid promotional display typography in the operating workspace.

## Layout

The desktop shell has a persistent 232px navigation sidebar, a 3.5rem operational top bar, and one focused work area. The application has a 900px minimum width, so its primary experience favors a real desktop workspace over a squeezed mobile metaphor.

Use the documented spacing scale for panels, grids, toolbars, and row gaps. At narrower desktop widths, dashboard grids reduce from four or three columns to two or three as appropriate, runner controls stack, and charts become a single column. The visual-flow editor reflows its inspector at 1100px and becomes vertical at 760px; do not let important controls disappear behind a fixed layout.

## Elevation & Depth

The system is flat by default. Adjacent dark tonal surfaces and restrained borders establish containment; the floating shadow is reserved for elevated panels and modal surfaces, whose blurred backdrop clearly separates a temporary task from the workspace.

**The Border-First Rule.** A resting panel earns its boundary from tonal contrast and a one-pixel border. Do not add shadows to ordinary cards, tables, or navigation rows.

## Shapes

Corners progress from small for compact navigation and command items, to control for inputs and buttons, to panel for persistent containers and dialogs. Pills are reserved for compact status and engine metadata. Keep surfaces softly rounded but technical; avoid oversized radii, glassy blobs, or decorative geometry.

## Components

### Buttons

Primary buttons carry the lime signal and a dark foreground; hover lifts by one pixel and brightens only slightly. Secondary buttons use elevated surface and a border, ghost buttons stay transparent until hover, and danger buttons use the error state. Disabled buttons reduce opacity and do not imply interactivity.

### Panels and metric cards

Panels are dark, bordered containers with a clearly separated header when one exists. Metric cards use the same panel language, a small labeled lead-in, a tabular numeric value, and subdued footer context. Telemetry charts and logs remain data-first rather than ornamental.

### Inputs and command surfaces

Inputs have a quiet dark fill, bordered control shape, muted placeholder text, and a lime focus treatment. The command palette and dialogs use elevated surfaces, a structural header/footer split, and a backdrop; command groups use monospace uppercase labels and lime icons to support rapid scanning.

### Navigation and status

Sidebar and top-bar navigation use muted text at rest, a restrained lime-tinted hover, and a clear lime active indicator. Status badges pair an icon with a written label—color is supplementary—and use pill geometry only for concise state metadata.

### Motion and access

Interaction motion is limited to fast state feedback: 150ms or 200ms transitions with the Loom ease-out curve, plus a small running-status pulse. Focusable controls retain a 2px visible focus outline with a 2px offset. The global `prefers-reduced-motion` rule collapses animations and transitions, so new motion must remain optional and respect that preference.

## Do's and Don'ts

### Do:

- **Do** use the supplied `public/logo-icon.png` as the only canonical Loom mark.
- **Do** give every interactive control a semantic element, visible keyboard focus, and an accessible name; use text and icons together for status.
- **Do** use monospace and tabular numerals for scripts, commands, paths, and changing metrics.
- **Do** keep live, ready, warning, failed, and informational states semantically distinct.

### Don't:

- **Don't** use lime as passive decoration or recolor all healthy state with the primary action signal.
- **Don't** introduce light themes, gradients, glass effects, or heavy card shadows that compete with telemetry.
- **Don't** communicate an operational state by color alone, hide focus, or add motion that ignores reduced-motion preferences.
