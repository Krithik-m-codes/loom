# Loom Visual-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Loom's entire desktop visual layer with the approved dark engineering-console design system while preserving every existing user flow and backend integration.

**Architecture:** A token-first CSS layer and a small set of presentational React primitives replace duplicated palette and control styles. Existing screen components retain their state, props, callbacks, IPC calls, and data transformations, but consume the primitives and semantic CSS classes. The supplied raster mark becomes the source for interface and generated desktop icon assets.

**Tech Stack:** React 19, TypeScript strict mode, Vite 6, Tailwind CSS v4, Lucide React, cmdk, uPlot/Recharts, Vitest, Testing Library, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-09-27-loom-visual-system-design.md`

## Global Constraints

- Preserve all current routes, React state ownership, Tauri IPC commands, SQLite behavior, adapter behavior, and subprocess-only engine invocation.
- Do not overwrite pre-existing unstaged changes in `crates/engine-locust/src/lib.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src/components/EnginesView.tsx`, `src/components/setup/OnboardingWizard.tsx`, `public/logo-icon.png`, or the deletion of `public/loom-icon.svg`; inspect and preserve them before each overlapping edit.
- Use `public/logo-icon.png` as the canonical Loom mark. Do not recreate the icon in CSS or SVG.
- Put literal design color values only in `src/index.css`; React components use semantic CSS classes or CSS-variable references.
- Dark mode is the only shipped visual mode for this phase; lime `#7CFF4D` is a signal/action color, not a generic background.
- Use Inter for application copy and the existing monospace stack for code, paths, timestamps, and metrics.
- Respect `prefers-reduced-motion`; decorative motion must not be required to understand state.
- Do not add a component/UI library. Test-only dependencies are permitted.
- Use `pnpm` for JavaScript dependency, test, build, and Tauri commands.
- Work at desktop widths of 1280×720, 1440×900, and 1920×1080; keep the existing 900px minimum window width usable.

## Review Focus

1. Long project names, test paths, engine versions, and target hosts must truncate without moving run controls or overflowing the sidebar; Task 4 adds coverage.
2. An empty engine list or run history must render a useful empty state rather than a blank panel; Task 5 adds coverage.
3. A run with no `finished_at` and each running/finished/stopped/failed state must show a text label as well as a semantic visual indicator; Task 5 adds coverage.
4. Starting/stopping a run, selecting a script, and command-palette keyboard closing must keep calling the current callbacks exactly once; Tasks 4 and 6 add coverage.
5. Users who request reduced motion must not receive telemetry pulse/transition animations; Task 8 adds a token-audit assertion.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/index.css` | Canonical Loom colors, type, spacing, radius, elevation, motion, controls, tables, and telemetry classes. |
| `src/components/ui/{LoomButton,Panel,StatusBadge,MetricCard,SearchInput,TelemetryPanel}.tsx` | Presentational primitives; no application state. |
| `src/components/LoomLogo.tsx` | Supplied image mark and optional text lockup. |
| `src/components/{Sidebar,TopNav,CommandPaletteModal}.tsx` | Token-driven desktop shell and command overlay. |
| `src/components/{DashboardView,HistoryView,EnginesView,RunnerView}.tsx` | Existing data behavior with consistent visual surfaces. |
| `src/components/{ScriptEditorView,FlowchartBuilderView}.tsx` | Tokenized authoring views with unchanged editor/canvas behavior. |
| `src/components/setup/OnboardingWizard.tsx`, `src/components/projects/NewProjectModal.tsx` | Existing setup and creation workflows with shared forms/modals. |
| `src/test/setup.ts`, `src/**/*.test.tsx` | Component-test setup and interaction regressions. |
| `scripts/audit-design-tokens.mjs` | CI-safe raw-color, token, and reduced-motion audit. |
| `package.json`, `pnpm-lock.yaml`, `vite.config.ts` | Test configuration and `audit:design` command. |
| `src-tauri/icons/*` | Tauri-generated derivatives of the supplied mark; never hand-drawn. |

### Task 1: Establish the visual test foundation

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: a `jsdom` Vitest environment with Testing Library matchers for later `*.test.tsx` files.
- Produces: `pnpm test` that runs component tests without a Tauri window.

- [ ] **Step 1: Write the failing browser-environment test**

Create `src/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("visual test environment", () => {
  it("renders accessible DOM content", () => {
    render(<button type="button">Run test</button>);
    expect(screen.getByRole("button", { name: "Run test" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to verify the missing environment fails**

Run: `pnpm test -- src/test/smoke.test.tsx`

Expected: FAIL because Testing Library or the browser environment is absent.

- [ ] **Step 3: Add the test dependencies and configuration**

Run:

```powershell
pnpm add -D @testing-library/jest-dom @testing-library/react @testing-library/user-event jsdom
```

Add to the existing Vite config:

```ts
test: {
  environment: "jsdom",
  setupFiles: "./src/test/setup.ts",
  css: true,
},
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Prove the test foundation works**

Run: `pnpm test -- src/test/smoke.test.tsx`

Expected: PASS with one test.

Run: `pnpm test`

Expected: PASS with the smoke test and existing tests.

- [ ] **Step 5: Commit only the test foundation**

```powershell
git add -- package.json pnpm-lock.yaml vite.config.ts src/test/setup.ts src/test/smoke.test.tsx
git commit -m "test: add frontend component test foundation"
```

### Task 2: Create the token contract and reusable visual primitives

**Files:**
- Modify: `src/index.css`
- Create: `src/components/ui/LoomButton.tsx`
- Create: `src/components/ui/Panel.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/MetricCard.tsx`
- Create: `src/components/ui/SearchInput.tsx`
- Create: `src/components/ui/TelemetryPanel.tsx`
- Create: `src/components/ui/StatusBadge.test.tsx`
- Create: `src/components/ui/MetricCard.test.tsx`

**Interfaces:**
- Produces: `LoomStatus = "ready" | "starting" | "running" | "finished" | "stopped" | "failed"`.
- Produces: `StatusBadge({ status, label?, className? })`, which always has a visible label and icon.
- Produces: `MetricCard({ label, value, delta?, footer?, icon? })`, where `delta.tone` is `positive`, `negative`, or `neutral`.

- [ ] **Step 1: Write failing primitive tests**

Create `src/components/ui/StatusBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("exposes running state with icon and visible label", () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText("Running")).toBeVisible();
    expect(screen.getByLabelText("Run status: Running")).toHaveAttribute("data-status", "running");
  });
});
```

Create `src/components/ui/MetricCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("keeps its value and semantic delta legible", () => {
    render(<MetricCard label="Requests/sec" value="1,240" delta={{ label: "+28%", tone: "positive" }} />);
    expect(screen.getByText("1,240")).toHaveClass("loom-metric-card__value");
    expect(screen.getByText("+28%")).toHaveClass("loom-delta--positive");
  });
});
```

- [ ] **Step 2: Run the primitive tests to verify imports fail**

Run: `pnpm test -- src/components/ui/StatusBadge.test.tsx src/components/ui/MetricCard.test.tsx`

Expected: FAIL because the primitive modules do not exist.

- [ ] **Step 3: Define the approved Loom tokens and semantic classes**

Replace the current palette block in `src/index.css` with these literal token values, then map retained Tailwind aliases (`--background`, `--foreground`, `--primary`, `--border`, `--ring`) to them:

```css
:root,
.dark {
  --loom-bg: #070b0a;
  --loom-bg-secondary: #0a0f0e;
  --loom-surface: #0f1410;
  --loom-surface-elevated: #121a14;
  --loom-border: #1e2a1f;
  --loom-border-hover: #2a3a2b;
  --loom-primary: #7cff4d;
  --loom-green: #22c55e;
  --loom-green-dark: #16a34a;
  --loom-text: #e6ffe6;
  --loom-text-secondary: #9ca89c;
  --loom-text-muted: #667066;
  --loom-warning: #f59e0b;
  --loom-error: #ef4444;
  --loom-info: #3b82f6;
  --loom-space-1: 4px;
  --loom-space-2: 8px;
  --loom-space-3: 12px;
  --loom-space-4: 16px;
  --loom-radius-control: 8px;
  --loom-radius-panel: 12px;
  --loom-motion-fast: 150ms;
  --loom-motion-base: 200ms;
}
```

Add token-only `.loom-panel`, `.loom-input`, `.loom-table`, `.loom-page`, `.loom-button`, `.loom-status-badge`, `.loom-metric-card`, `.loom-delta--positive`, `.loom-delta--negative`, and `.loom-telemetry-panel` classes. Add this motion guard after animation rules:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}
```

- [ ] **Step 4: Implement the primitive interfaces**

In `StatusBadge.tsx`, use a single metadata map:

```tsx
const statusMeta = {
  ready: { label: "Ready", Icon: CheckCircle2 },
  starting: { label: "Starting", Icon: LoaderCircle },
  running: { label: "Running", Icon: Radio },
  finished: { label: "Completed", Icon: CheckCircle2 },
  stopped: { label: "Stopped", Icon: CircleStop },
  failed: { label: "Failed", Icon: CircleAlert },
} satisfies Record<LoomStatus, { label: string; Icon: LucideIcon }>;
```

Render a `<span aria-label={`Run status: ${resolvedLabel}`} data-status={status}>` with the mapped `aria-hidden` icon and visible text. Implement `MetricCard` as a semantic `article`; implement `LoomButton` by forwarding `ButtonHTMLAttributes<HTMLButtonElement>`; implement `Panel`, `SectionHeader`, `SearchInput`, and `TelemetryPanel` as typed presentational wrappers.

- [ ] **Step 5: Run primitive tests and typecheck**

Run: `pnpm test -- src/components/ui/StatusBadge.test.tsx src/components/ui/MetricCard.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS without TypeScript errors.

- [ ] **Step 6: Commit the design-system foundation**

```powershell
git add -- src/index.css src/components/ui
git commit -m "feat: add Loom visual design primitives"
```

### Task 3: Adopt the supplied Loom mark and tokenized application shell

**Files:**
- Modify: `index.html`
- Modify: `src/App.tsx`
- Modify: `src/components/LoomLogo.tsx`
- Modify: `src-tauri/icons/32x32.png`
- Modify: `src-tauri/icons/64x64.png`
- Modify: `src-tauri/icons/128x128.png`
- Modify: `src-tauri/icons/128x128@2x.png`
- Modify: `src-tauri/icons/icon.ico`
- Modify: `src-tauri/icons/icon.icns`
- Create: `src/components/LoomLogo.test.tsx`

**Interfaces:**
- Preserves: `LoomLogoProps { size?: number; className?: string; showText?: boolean }`.
- Produces: a logo `<img src="/logo-icon.png" alt="Loom">`; `showText` adds text but never redraws the mark.
- Preserves: all `App` state, child props, IPC subscriptions, and event wiring.

- [ ] **Step 1: Write the failing canonical-logo test**

Create `src/components/LoomLogo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoomLogo } from "./LoomLogo";

describe("LoomLogo", () => {
  it("uses the supplied mark and adds text only when requested", () => {
    const { rerender } = render(<LoomLogo size={32} />);
    expect(screen.getByRole("img", { name: "Loom" })).toHaveAttribute("src", "/logo-icon.png");
    expect(screen.queryByText("Loom")).not.toBeInTheDocument();
    rerender(<LoomLogo size={32} showText />);
    expect(screen.getByText("Loom")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to demonstrate the current custom SVG fails the contract**

Run: `pnpm test -- src/components/LoomLogo.test.tsx`

Expected: FAIL because the component has no canonical image element.

- [ ] **Step 3: Replace the custom SVG logo and root raw palette**

Implement the mark with aspect-ratio-safe dimensions:

```tsx
<img
  src="/logo-icon.png"
  alt="Loom"
  width={size}
  height={size}
  className="loom-logo__mark shrink-0"
/>
```

When `showText` is true, render Inter semibold `Loom` plus a muted `Load testing` descriptor; remove the current hard-coded version label. Update `index.html` to use `/logo-icon.png` as favicon and the exact title `Loom — Multi-Engine Load Testing`. Replace the raw root class list in `src/App.tsx` with `.loom-app-shell` without changing the DOM hierarchy or any child props.

- [ ] **Step 4: Generate desktop derivatives from the supplied mark**

Inspect `public/logo-icon.png` for alpha and safe padding. If padding is needed, make a padded derivative in a temporary location without redrawing the mark. Then run:

```powershell
pnpm tauri icon public/logo-icon.png
```

Keep only generated files in `src-tauri/icons/` that existing Tauri configuration references. Do not restore `public/loom-icon.svg` and do not change `src-tauri/tauri.conf.json` unless its configured paths no longer exist.

- [ ] **Step 5: Run brand checks**

Run: `pnpm test -- src/components/LoomLogo.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 6: Commit the asset migration**

```powershell
git add -- index.html src/App.tsx src/components/LoomLogo.tsx src/components/LoomLogo.test.tsx src-tauri/icons
git commit -m "feat: adopt Loom brand assets"
```

### Task 4: Migrate navigation, overlays, onboarding, and project creation without behavior changes

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/TopNav.tsx`
- Modify: `src/components/CommandPaletteModal.tsx`
- Modify: `src/components/setup/OnboardingWizard.tsx`
- Modify: `src/components/projects/NewProjectModal.tsx`
- Create: `src/components/Sidebar.test.tsx`
- Create: `src/components/TopNav.test.tsx`
- Create: `src/components/CommandPaletteModal.test.tsx`
- Create: `src/components/projects/NewProjectModal.test.tsx`

**Interfaces:**
- Preserves: every current prop interface and callback timing.
- Consumes: `LoomLogo`, `LoomButton`, `StatusBadge`, `Panel`, `SearchInput`, and token classes.
- Produces: a 232px sidebar with truncating labels, compact context top bar, and accessible modal overlays.

- [ ] **Step 1: Write failing shell interaction tests**

Create `src/components/TopNav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

describe("TopNav", () => {
  it("calls the current run callback when idle", async () => {
    const user = userEvent.setup();
    const onRunTest = vi.fn();
    render(<TopNav activeTab="dashboard" onSelectTab={vi.fn()} isRunning={false} onRunTest={onRunTest} onStopTest={vi.fn()} selectedEngineName="Locust" targetHost="http://localhost:8080" onChangeTargetHost={vi.fn()} activeTestName="a-very-long-test-name.py" />);
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    expect(onRunTest).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/CommandPaletteModal.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteModal } from "./CommandPaletteModal";

describe("CommandPaletteModal", () => {
  it("closes once when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<CommandPaletteModal isOpen onClose={onClose} onRunTest={vi.fn()} onStopTest={vi.fn()} isRunning={false} onSelectTab={vi.fn()} onSelectEngine={vi.fn()} onSelectScript={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/Sidebar.test.tsx` with a one-item `engines`/`projects` fixture whose project and suite labels exceed 100 characters. Click Dashboard and assert `onSelectTab` receives `"dashboard"`; assert the long suite label has `truncate` or `.loom-truncate`.

Create `src/components/projects/NewProjectModal.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewProjectModal } from "./NewProjectModal";
import type { EngineInfo } from "../../types";

const locust: EngineInfo = { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: { version: "2.0" } } };

describe("NewProjectModal", () => {
  it("submits the existing project shape", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewProjectModal isOpen onClose={vi.fn()} engines={[locust]} onCreate={onCreate} />);
    await user.type(screen.getByLabelText("Project name"), "Payments");
    await user.click(screen.getByRole("button", { name: "Create Project" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Payments" }));
    expect(onCreate.mock.calls[0][0].suites).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run shell tests to establish the interaction contract**

Run: `pnpm test -- src/components/TopNav.test.tsx src/components/CommandPaletteModal.test.tsx src/components/Sidebar.test.tsx src/components/projects/NewProjectModal.test.tsx`

Expected: FAIL until stable labels and tokenized controls are implemented.

- [ ] **Step 3: Reconcile existing user changes before overlapping edits**

Run:

```powershell
git diff -- src/components/setup/OnboardingWizard.tsx src/components/EnginesView.tsx
```

Keep every behavior change visible in that diff. In `OnboardingWizard.tsx`, change only visual copy, markup wrappers, classes, and icon placement; do not remove its current data or completion behavior. Leave `EnginesView.tsx` for Task 5.

- [ ] **Step 4: Implement the shell and overlay styles**

In `Sidebar.tsx`, replace raw color utilities with `.loom-sidebar`, `.loom-nav-item`, `.loom-nav-item--active`, `.loom-project-switcher`, `.loom-truncate`, and `.loom-engine-row`. Set width through `.loom-sidebar { width: 232px; min-width: 232px; }`. Preserve project dropdown, suite expansion, and every `onSelect*` call.

In `TopNav.tsx`, use `.loom-topbar`, `.loom-tab`, `.loom-tab--active`, and `.loom-target-input` plus `LoomButton`. Keep all six tab IDs, target `onChange`, and current run/stop callbacks. The selected tab gets one thin lime baseline; inactive tabs stay neutral.

In `CommandPaletteModal.tsx`, use `.loom-modal-backdrop`, `.loom-modal`, `.loom-command-item`, and `.loom-command-footer`. Retain Escape, Ctrl/Cmd+K close behavior, cmdk filtering, and each action. In onboarding and New Project, use the shared modal, panel, input, button, and badge styles while preserving validation, copying, `onComplete`, `onClose`, and `onCreate` behavior.

- [ ] **Step 5: Run regression checks**

Run: `pnpm test -- src/components/TopNav.test.tsx src/components/CommandPaletteModal.test.tsx src/components/Sidebar.test.tsx src/components/projects/NewProjectModal.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS without unused import errors.

- [ ] **Step 6: Commit only shell changes**

```powershell
git add -- src/components/Sidebar.tsx src/components/TopNav.tsx src/components/CommandPaletteModal.tsx src/components/setup/OnboardingWizard.tsx src/components/projects/NewProjectModal.tsx src/components/Sidebar.test.tsx src/components/TopNav.test.tsx src/components/CommandPaletteModal.test.tsx src/components/projects/NewProjectModal.test.tsx src/index.css
git commit -m "feat: redesign Loom navigation and overlays"
```

### Task 5: Migrate dashboard, engine, and history data surfaces

**Files:**
- Modify: `src/components/DashboardView.tsx`
- Modify: `src/components/EnginesView.tsx`
- Modify: `src/components/HistoryView.tsx`
- Create: `src/components/DashboardView.test.tsx`
- Create: `src/components/HistoryView.test.tsx`
- Create: `src/components/EnginesView.test.tsx`

**Interfaces:**
- Preserves: `DashboardViewProps`, `HistoryViewProps`, `EnginesViewProps`, `getRunHistory`, `onNavigate`, `onSelectEngine`, and `onRerun`.
- Consumes: `MetricCard`, `Panel`, `SectionHeader`, `SearchInput`, `StatusBadge`, and `LoomButton`.
- Produces: explicit empty history/engine states and compact icon-plus-text run statuses.

- [ ] **Step 1: Write failing data-surface tests**

Create `src/components/HistoryView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryView } from "./HistoryView";

vi.mock("../lib/ipc", () => ({ getRunHistory: vi.fn().mockResolvedValue([]) }));

describe("HistoryView", () => {
  it("explains an empty run history", async () => {
    render(<HistoryView onRerun={vi.fn()} />);
    expect(await screen.findByText("No historical runs found in database.")).toBeVisible();
  });
});
```

Create `src/components/EnginesView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnginesView } from "./EnginesView";

describe("EnginesView", () => {
  it("explains an empty engine list", () => {
    render(<EnginesView engines={[]} />);
    expect(screen.getByText("No engines detected")).toBeVisible();
  });
});
```

Create `src/components/DashboardView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import type { EngineInfo } from "../types";

vi.mock("../lib/ipc", () => ({ getRunHistory: vi.fn().mockResolvedValue([]) }));

describe("DashboardView", () => {
  it("keeps the visual-flow navigation callback", async () => {
    const user = userEvent.setup();
const locust: EngineInfo = { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: { version: "2.0" } } };
const onNavigate = vi.fn();
render(<DashboardView engines={[locust]} onNavigate={onNavigate} onSelectEngine={vi.fn()} targetHost="http://localhost:8080" onRerun={vi.fn()} />);
await user.click(screen.getByRole("button", { name: "Design Visual Flow" }));
expect(onNavigate).toHaveBeenCalledWith("flowchart");
  });
});
```

- [ ] **Step 2: Run data-surface tests to verify the empty-state contract is absent**

Run: `pnpm test -- src/components/DashboardView.test.tsx src/components/HistoryView.test.tsx src/components/EnginesView.test.tsx`

Expected: FAIL because engine empty state and primitive-based surfaces have not been implemented.

- [ ] **Step 3: Implement the dashboard telemetry hierarchy**

Retain `getRunHistory`, the resource gauge state, feature navigation callbacks, and engine selection in `DashboardView.tsx`. Replace raw palette utilities with `.loom-page`, `SectionHeader`, `MetricCard`, `Panel`, `StatusBadge`, and `.loom-data-wave`. Render Virtual Users, Requests/sec, Avg Response Time, and Error Rate as the top metrics, retaining current data sources rather than inventing backend data. Change feature-card click targets to actual buttons so keyboard users can invoke the same callbacks.

- [ ] **Step 4: Implement dense history and engine views**

In `HistoryView.tsx`, preserve the effect, search predicate, refresh function, and rerun callback. Use `SearchInput`, `StatusBadge`, `.loom-table`, `.loom-table__numeric`, and `.loom-empty-state`. Map `finished` to `StatusBadge status="finished"`, `running` to `running`, `stopped` to `stopped`, and any other failed state to `failed`; leave `-` for missing `finished_at`.

In `EnginesView.tsx`, preserve all user-staged behavioral changes first, then replace raw utilities with primitives. Keep installation hints and copy behavior. For `engines.length === 0`, render a `Panel` containing `No engines detected` and a description that configured engines appear here; do not emit a fake install command or claim any engine is embedded.

- [ ] **Step 5: Run data-surface regressions and production build**

Run: `pnpm test -- src/components/DashboardView.test.tsx src/components/HistoryView.test.tsx src/components/EnginesView.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 6: Commit the data-surface migration**

```powershell
git add -- src/components/DashboardView.tsx src/components/HistoryView.tsx src/components/EnginesView.tsx src/components/DashboardView.test.tsx src/components/HistoryView.test.tsx src/components/EnginesView.test.tsx src/index.css
git commit -m "feat: redesign Loom telemetry and data views"
```

### Task 6: Reframe runner telemetry while preserving execution behavior

**Files:**
- Modify: `src/components/RunnerView.tsx`
- Create: `src/components/RunnerView.test.tsx`
- Create: `src/components/ui/TelemetryPanel.test.tsx`

**Interfaces:**
- Preserves: `RunnerViewProps`, metric derivation, exports, live-log filtering, engine selection, and run/stop callbacks.
- Consumes: `MetricCard`, `Panel`, `StatusBadge`, `TelemetryPanel`, `LoomButton`, and token variables inside existing inline SVG attributes.
- Produces: accessible state labels, restrained telemetry glow, dense numeric tables, and a log panel without changing calculations or downloaded report content.

- [ ] **Step 1: Write failing runner behavior tests**

Create `src/components/RunnerView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RunnerView } from "./RunnerView";
import type { EngineInfo, TestConfig } from "../types";

const engine: EngineInfo = { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: { version: "2.0" } } };
const config: TestConfig = { project_name: "Billing", engine: "locust", script_path: "examples/locust/basic_test.py", load_profile: { users: 10, spawn_rate: 2, duration: "30s" }, target: { host: "http://localhost:8080" } };
const baseProps = { engines: [engine], selectedEngineId: "locust", onSelectEngine: vi.fn(), config, onChangeConfig: vi.fn(), isRunning: false, onRunTest: vi.fn(), onStopTest: vi.fn(), metrics: [], logs: [], onClearLogs: vi.fn() };

describe("RunnerView", () => {
  it("keeps run and stop callbacks", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RunnerView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    expect(baseProps.onRunTest).toHaveBeenCalledTimes(1);
    rerender(<RunnerView {...baseProps} isRunning />);
    await user.click(screen.getByRole("button", { name: /Stop Test/ }));
    expect(baseProps.onStopTest).toHaveBeenCalledTimes(1);
  });
});
```

Add a second test with `metrics: [{ timestamp: "2026-09-27T00:00:00Z", engine: "locust", run_id: "run-1", metric: "RequestsPerSecond", value: 42, labels: {} }]` and assert the telemetry region has name `Requests/sec` and a visible value `42`.

Create `src/components/ui/TelemetryPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelemetryPanel } from "./TelemetryPanel";

describe("TelemetryPanel", () => {
  it("labels telemetry content for assistive technology", () => {
    render(<TelemetryPanel title="Requests/sec"><svg aria-label="Request rate chart" /></TelemetryPanel>);
    expect(screen.getByRole("region", { name: "Requests/sec" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the runner tests to establish start/stop and telemetry assertions**

Run: `pnpm test -- src/components/RunnerView.test.tsx src/components/ui/TelemetryPanel.test.tsx`

Expected: FAIL until runner uses labelled metric and telemetry surfaces.

- [ ] **Step 3: Tokenize runner panels, SVGs, tables, and logs**

Retain all metric processing (`latestRps`, percentiles, `telemetryPoints`, endpoint rows), browser export handlers, configuration updates, auto-scroll effect, and log filtering. Replace visual wrappers with `Panel`, `MetricCard`, `TelemetryPanel`, `StatusBadge`, `LoomButton`, `.loom-table`, and `.loom-live-log`.

For the existing SVG, replace literal colors with token-driven values without changing any coordinate or scale calculation:

```tsx
<path stroke="var(--loom-primary)" fill="url(#loom-rps-area)" />
<stop stopColor="var(--loom-primary)" stopOpacity="0.10" />
<line stroke="var(--loom-border)" strokeOpacity="0.65" />
<text fill="var(--loom-text-muted)" />
```

Use red only for actual failure series. Mark visual-only SVG paths `aria-hidden`; give each `TelemetryPanel` a title and accessible region label.

- [ ] **Step 4: Ensure run state never relies on color alone**

At the runner control point, render `StatusBadge` for starting/running/stopped/failed representations and retain existing enabled/disabled action behavior. Leave the current log filter semantics unchanged and prove `onClearLogs` is called once by adding an assertion to `RunnerView.test.tsx`.

- [ ] **Step 5: Run runner regressions and build**

Run: `pnpm test -- src/components/RunnerView.test.tsx src/components/ui/TelemetryPanel.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 6: Commit the runner migration**

```powershell
git add -- src/components/RunnerView.tsx src/components/RunnerView.test.tsx src/components/ui/TelemetryPanel.test.tsx src/index.css
git commit -m "feat: redesign runner telemetry surfaces"
```

### Task 7: Migrate authoring surfaces while preserving project creation workflows

**Files:**
- Modify: `src/components/ScriptEditorView.tsx`
- Modify: `src/components/FlowchartBuilderView.tsx`
- Create: `src/components/FlowchartBuilderView.test.tsx`

**Interfaces:**
- Preserves: `ScriptEditorViewProps`, `FlowchartBuilderViewProps`, generated Locust/k6 source, and `onExportToRunner`.
- Consumes: token classes, `Panel`, `SectionHeader`, `LoomButton`, `SearchInput`, and `StatusBadge`.
- Produces: compact editor/canvas/tool panels that do not change scripts, node manipulation, or submitted project data.

- [ ] **Step 1: Write failing authoring-flow tests**

Create `src/components/FlowchartBuilderView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlowchartBuilderView } from "./FlowchartBuilderView";

describe("FlowchartBuilderView", () => {
  it("exports k6 code to the existing runner callback", async () => {
    const user = userEvent.setup();
    const onExportToRunner = vi.fn();
    render(<FlowchartBuilderView targetHost="http://localhost:8080" onExportToRunner={onExportToRunner} />);
    await user.click(screen.getByRole("button", { name: "JS (k6)" }));
    await user.click(screen.getByRole("button", { name: "Send to Runner" }));
    expect(onExportToRunner).toHaveBeenCalledWith(expect.stringContaining("import http from 'k6/http'"), "k6");
  });
});
```

- [ ] **Step 2: Run the authoring tests before styling changes**

Run: `pnpm test -- src/components/FlowchartBuilderView.test.tsx`

Expected: FAIL until stable accessible labels/selectors are added to existing controls.

- [ ] **Step 3: Apply the technical editor and canvas treatment**

In `ScriptEditorView.tsx`, preserve `readScript`, `saveScript`, template selection, content state, and run handoff. Use `.loom-editor`, `.loom-editor__toolbar`, `.loom-code-surface`, `.loom-file-chip`, and tokenized buttons/inputs; code remains monospace and paths truncate.

In `FlowchartBuilderView.tsx`, preserve `FlowNode`, node generation/deletion/property updates, Locust generation, k6 generation, and export callback. Use `.loom-canvas`, `.loom-node`, `.loom-node--selected`, `.loom-node-palette`, and `.loom-code-preview`; lime appears only for selection and export action, not every node.

Give every icon-only authoring control an `aria-label` and every testable authoring control stable visible copy.

- [ ] **Step 4: Run authoring tests and production build**

Run: `pnpm test -- src/components/FlowchartBuilderView.test.tsx`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 5: Commit the authoring-surface migration**

```powershell
git add -- src/components/ScriptEditorView.tsx src/components/FlowchartBuilderView.tsx src/components/FlowchartBuilderView.test.tsx src/index.css
git commit -m "feat: redesign Loom authoring surfaces"
```

### Task 8: Add design conformance checks and complete desktop verification

**Files:**
- Create: `scripts/audit-design-tokens.mjs`
- Modify: `package.json`
- Create: `src/test/design-audit.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `pnpm run audit:design`, exiting nonzero when a source component introduces a literal hexadecimal color, required Loom tokens are absent, or reduced-motion CSS is absent.
- Preserves: existing build, test, desktop, and Rust commands.

- [ ] **Step 1: Write the failing design-audit test**

Create `src/test/design-audit.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("design audit", () => {
  it("accepts the committed Loom visual system", () => {
    expect(() => execFileSync("node", ["scripts/audit-design-tokens.mjs"], { stdio: "pipe" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the audit test to verify the script is required**

Run: `pnpm test -- src/test/design-audit.test.ts`

Expected: FAIL because `scripts/audit-design-tokens.mjs` does not exist.

- [ ] **Step 3: Implement the deterministic design audit**

Create `scripts/audit-design-tokens.mjs` containing this required-token list:

```js
const requiredTokens = [
  "--loom-bg", "--loom-bg-secondary", "--loom-surface", "--loom-surface-elevated",
  "--loom-border", "--loom-primary", "--loom-green", "--loom-text",
  "--loom-text-secondary", "--loom-text-muted", "--loom-warning", "--loom-error",
];
```

Implement the complete script below. It reads `src/index.css`, reports every missing token or absent `@media (prefers-reduced-motion: reduce)`, recursively scans `src/**/*.tsx` excluding `*.test.tsx`, and reports every literal hex color with file and line. It does not scan `src/index.css`, because that is the approved literal-token source.

```js
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "src", "index.css"), "utf8");
const requiredTokens = [
  "--loom-bg", "--loom-bg-secondary", "--loom-surface", "--loom-surface-elevated",
  "--loom-border", "--loom-primary", "--loom-green", "--loom-text",
  "--loom-text-secondary", "--loom-text-muted", "--loom-warning", "--loom-error",
];
const failures = requiredTokens.filter((token) => !css.includes(token)).map((token) => `Missing ${token} in src/index.css`);
if (!css.includes("@media (prefers-reduced-motion: reduce)")) {
  failures.push("Missing reduced-motion guard in src/index.css");
}
const collectTsx = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return collectTsx(path);
  return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
});
const files = collectTsx(join(root, "src"));
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\\r?\\n/);
  lines.forEach((line, index) => {
    if (/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/.test(line)) {
      failures.push(`${relative(root, file)}:${index + 1} contains a literal color`);
    }
  });
}
if (failures.length) {
  console.error(failures.join("\\n"));
  process.exit(1);
}
console.log(`Loom design audit passed for ${files.length} component files.`);
```

Add the exact package script:

```json
"audit:design": "node scripts/audit-design-tokens.mjs"
```

- [ ] **Step 4: Run the audit, full tests, and production build**

Run: `pnpm run audit:design`

Expected: PASS and print the audited component-file count.

Run: `pnpm test`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 5: Validate the desktop application and generated bundle manually**

Run: `pnpm tauri dev`

Expected: the desktop app starts. Exercise Dashboard, Visual Flow, Runner, Script Editor, History, Engines, Cmd/Ctrl+K, onboarding, and New Project at 1280×720, 1440×900, and 1920×1080. Confirm long labels truncate, all run states have text, and reduced motion disables pulse/transition effects.

Close the development process, then run: `pnpm tauri build`

Expected: a successful platform bundle using regenerated Loom icons.

- [ ] **Step 6: Run workspace protection and final checks**

Run:

```powershell
cargo check --workspace
git diff --check
git status --short
```

Expected: Rust workspace check passes; no whitespace errors; status contains only intentional visual-system changes and the user's pre-existing changes.

- [ ] **Step 7: Commit the audit and documentation update**

Update `README.md` from Bruno-inspired branding to the approved Loom dark-engineering-console language, add a current screenshot after the manual visual pass, and keep all engine/license claims truthful.

```powershell
git add -- scripts/audit-design-tokens.mjs package.json src/test/design-audit.test.ts README.md
git commit -m "chore: verify Loom visual system"
```
