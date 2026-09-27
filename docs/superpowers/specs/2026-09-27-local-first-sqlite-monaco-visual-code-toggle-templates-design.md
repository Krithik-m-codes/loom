# Loom: Local-First SQLite Storage + Monaco Editor + Visual/Code Toggle + Templates

## Overview

Transform Loom from a demo-state app with mock data and empty project management into a fully functional local-first load testing desktop application. All data persists in SQLite (`loom.db`) — projects, test suites, visual flows, run history, and metrics. Replace the basic textarea editor with Monaco Editor for professional code editing. Unify the Visual Flow Builder and Code Editor into a single tabbed Editor view. Add per-engine starter templates for quick scenario creation.

**Scope**: Architectural — modifies storage schema, adds new IPC surface, introduces Monaco Editor dependency, redesigns Editor view, adds project/suite management UI.

---

## 1. SQLite Schema Extension

### 1.1 New Tables (added to `src-tauri/src/db.rs`)

```sql
-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    target_host     TEXT NOT NULL,
    default_engine  TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Test suites (scripts + config) per project
CREATE TABLE IF NOT EXISTS test_suites (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    engine       TEXT NOT NULL,
    script_path  TEXT NOT NULL,
    config_json  TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Visual flow definitions (for visual builder state)
CREATE TABLE IF NOT EXISTS visual_flows (
    suite_id    TEXT PRIMARY KEY REFERENCES test_suites(id) ON DELETE CASCADE,
    nodes_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suites_project ON test_suites(project_id);
```

### 1.2 Migration Strategy

- `db::initialize(conn)` runs on every app startup (idempotent `CREATE TABLE IF NOT EXISTS`)
- No down-migrations needed (additive only)
- Existing `runs` and `metrics` tables unchanged

### 1.3 File Storage (Scripts)

- Location: `%APPDATA%/Loom/scripts/<project_id>/<suite_id>.<ext>`
- Extension derived from engine: `locust`→`.py`, `k6`→`.js`, `goose`→`.rs`
- Script content stored on disk (not in DB) for:
  - Direct editor access
  - Engine subprocess can read file directly
  - User can inspect/modify externally

---

## 2. Rust IPC Commands (New)

All commands return `Result<T, String>` for Tauri serialization.

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_projects` | — | `Vec<Project>` | All projects ordered by `updated_at DESC` |
| `create_project` | `{ name, target_host, default_engine }` | `Project` | Insert project, create script directory |
| `update_project` | `{ id, name?, target_host?, default_engine? }` | `Project` | Partial update, bumps `updated_at` |
| `delete_project` | `{ id }` | `()` | Cascade deletes suites + script files |
| `list_suites` | `{ project_id }` | `Vec<TestSuite>` | Suites for a project |
| `create_suite` | `{ project_id, name, engine, script_content, config, visual_nodes? }` | `TestSuite` | Write script file, insert suite, optional visual flow |
| `update_suite` | `{ id, name?, script_content?, config?, visual_nodes? }` | `TestSuite` | Update suite + script file + visual flow |
| `delete_suite` | `{ id }` | `()` | Delete script file + suite + visual flow |
| `get_suite` | `{ id }` | `SuiteWithContent` | Full suite: script content + visual nodes + config |
| `save_visual_flow` | `{ suite_id, nodes_json }` | `()` | Upsert visual flow for suite |

### 2.1 TypeScript ↔ Rust Type Mapping

```typescript
// Frontend types (src/types.ts - already exist, extend as needed)
interface Project {
  id: string;
  name: string;
  description: string;
  targetHost: string;
  defaultEngine: string;
  createdAt: string;
  updatedAt: string;
  suites: TestSuite[];
}

interface TestSuite {
  id: string;
  name: string;
  engine: string;
  scriptPath: string;
  config: TestConfig;
  createdAt: string;
  updatedAt: string;
}

interface SuiteWithContent extends TestSuite {
  scriptContent: string;
  visualNodes?: FlowNode[];
}
```

---

## 3. Frontend Architecture

### 3.1 IPC Layer (`src/lib/ipc.ts`)

- **Remove all mock data** — keep only Tauri paths
- Add typed wrappers for all new commands
- `isTauri` check remains for browser preview (return empty arrays)

### 3.2 State Management (`src/App.tsx`)

**Remove**: `localStorage` project state, `loadProjectState`, `projectState.ts` utilities

**Add**: React state loaded from SQLite via IPC on mount:
```tsx
const [projects, setProjects] = useState<Project[]>([]);
const [activeProjectId, setActiveProjectId] = useState<string>("");
const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
```

**Data flow**:
1. Mount → `list_projects()` → set `projects`
2. Select project → `list_suites(project_id)` → populate Sidebar
3. Select suite → `get_suite(suite_id)` → open in EditorView
4. Save in Editor → `update_suite()` → refresh Sidebar

---

## 4. Monaco Editor Integration

### 4.1 Dependencies

```json
// package.json additions
"dependencies": {
  "@monaco-editor/react": "^4.6.0",
  "monaco-editor": "^0.47.0"
}
```

### 4.2 Component: `src/components/ui/MonacoEditor.tsx`

```tsx
import Editor from '@monaco-editor/react';
import 'monaco-editor/esm/vs/editor/editor.main.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js';

interface MonacoEditorProps {
  language: 'python' | 'javascript' | 'typescript' | 'rust';
  value: string;
  onChange: (value: string) => void;
  theme?: 'vs-dark' | 'vs';
  height?: string;
  minimap?: boolean;
}
```

### 4.3 Language Mapping

| Engine | Extension | Monaco Language |
|--------|-----------|-----------------|
| Locust | `.py` | `python` |
| k6 | `.js` | `javascript` |
| k6 | `.ts` | `typescript` |
| Goose | `.rs` | `rust` |

---

## 5. Editor View Redesign

### 5.1 New Component: `src/components/EditorView.tsx`

Replaces `ScriptEditorView.tsx`. Tabbed interface:

```
┌─────────────────────────────────────────────────────────────┐
│  [Visual Flow]  [Code Editor]         [Save]  [Run Test]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Visual Tab:  FlowchartBuilderView (embedded)               │
│    - Full node palette, canvas, inspector                   │
│    - "Send to Code" button → generates code in Code tab     │
│                                                             │
│  Code Tab:    MonacoEditor + toolbar                        │
│    - Language auto-detected from suite engine               │
│    - Template picker button                                 │
│    - Save persists to SQLite + disk                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 State Sync (Visual → Code)

- Visual tab has "Generate Code" button (existing `onExportToRunner`)
- On click: generate code → update Monaco value → switch to Code tab
- Code → Visual: **MVP = manual "Parse Code" button later**; for now one-way

### 5.3 Suite Context

- Editor receives `suiteId` prop
- Loads via `get_suite(suiteId)` on mount
- Save calls `update_suite(suiteId, { script_content, config, visual_nodes })`
- "New from Template" button in toolbar (both tabs)

---

## 6. Quick Templates System

### 6.1 Template Definitions (`src/templates/templates.json`)

```json
{
  "locust": [
    {
      "id": "locust-basic",
      "name": "Basic HTTP GET",
      "description": "Simple homepage load test",
      "script": "from locust import HttpUser, task, between\n\nclass QuickstartUser(HttpUser):\n    wait_time = between(1, 2)\n    @task\ndef hello_world(self):\n        self.client.get(\"/\")",
      "config": { "users": 10, "spawn_rate": 2, "duration": "30s" }
    },
    {
      "id": "locust-auth-flow",
      "name": "Login + Authenticated API",
      "description": "POST login, then GET protected endpoints with token",
      "script": "...",
      "config": { "users": 20, "spawn_rate": 5, "duration": "60s" }
    },
    {
      "id": "locust-crud",
      "name": "REST CRUD Workflow",
      "description": "Create, read, update, delete cycle",
      "script": "...",
      "config": { "users": 15, "spawn_rate": 3, "duration": "45s" }
    }
  ],
  "k6": [
    { "id": "k6-basic", "name": "Basic HTTP GET", "description": "...", "script": "...", "config": {...} },
    { "id": "k6-auth", "name": "Auth Flow", "description": "...", "script": "...", "config": {...} },
    { "id": "k6-soak", "name": "Soak Test", "description": "...", "script": "...", "config": {...} }
  ],
  "goose": [
    { "id": "goose-basic", "name": "Basic Scenario", "description": "...", "script": "...", "config": {...} }
  ]
}
```

### 6.2 Template Picker Modal

- Triggered from EditorView toolbar ("New from Template")
- Filtered by current suite's engine (or all if new suite)
- On select: populates Editor (both tabs) + updates config

---

## 7. Project/Suite Management UI

### 7.1 TopNav: Project Selector (`src/components/TopNav.tsx`)

- Dropdown showing project name + "New Project"
- On project change: load suites, clear active suite
- "New Project" → `NewProjectModal` (existing, enhanced)

### 7.2 Sidebar: Suite List (`src/components/Sidebar.tsx`)

- Under project: list of suites with engine badge
- Click suite → load in EditorView
- "New Suite" button → `NewSuiteModal`

### 7.3 New Suite Modal (`src/components/projects/NewSuiteModal.tsx`)

Fields:
- Suite name
- Engine selector (Locust/k6/Goose)
- Template picker (optional, filtered by engine)
- On create: `create_suite()` → open in EditorView

---

## 8. Remove Demo/Mock Data

### 8.1 `src/lib/ipc.ts`

Delete all mock returns:
- Lines 13–47: mock `listEngines` return
- Lines 54–56: mock `startRun` return
- Lines 68–87: mock `getRunHistory` return
- Lines 94–95: mock `readScript` return
- Keep only Tauri `invoke`/`listen` paths

### 8.2 `src/lib/projectState.ts`

- Delete `SHIPPED_DEMO_IDS`
- Delete `loadProjectState` — projects now from SQLite
- Keep `configForSuite`, `projectConfigForSelection` for config derivation

### 8.3 `src/App.tsx`

- Remove `localStorage` project persistence
- Remove `initialProjectState` / `persistedProjects` state
- On mount: `await listProjects()` → set state
- `handleCreateProject` → `create_project()` IPC

### 8.4 `src/components/DashboardView.tsx`

- Remove fake CPU/memory simulation (`useEffect` with `setInterval`)
- Show real: engine count, recent runs from `getRunHistory()`
- Keep "Engines ready X/Y" from `engines` prop

---

## 9. Visual Flow Builder Enhancements

### 9.1 `src/components/FlowchartBuilderView.tsx`

**Add props**:
```tsx
interface FlowchartBuilderViewProps {
  onExportToRunner: (scriptContent: string, engine: string) => void;
  targetHost: string;
  suiteId?: string;           // NEW: for saving visual flow
  initialNodes?: FlowNode[];  // NEW: load existing visual flow
  onSaveVisualFlow?: (nodes: FlowNode[]) => void; // NEW
}
```

**Changes**:
- Accept `initialNodes` to hydrate from DB
- "Save Visual Flow" button in inspector → calls `onSaveVisualFlow`
- "Send to Runner" → also saves visual flow to DB via `save_visual_flow` IPC

---

## 10. Testing Requirements

### 10.1 Frontend (`pnpm test`)

| Component | Test Cases |
|-----------|------------|
| `MonacoEditor` | Renders, loads language, onChange fires, theme toggle |
| `EditorView` | Tab switch, Visual→Code sync, Save calls IPC, Template picker opens |
| `NewSuiteModal` | Creates suite with template, validates required fields |
| `ProjectSelector` | Lists projects, creates new, switches active |
| `SuiteList` | Shows suites for project, opens editor on click |
| `ipc.ts` | Mock Tauri, verify command calls |

### 10.2 Rust (`cargo test -p loom`)

| Module | Test Cases |
|--------|------------|
| `db.rs` | Migration runs idempotently, tables created, indexes exist |
| `lib.rs` (IPC) | All 10 new commands: success + error paths (not found, FK violation) |
| `db.rs` | Cascade delete project → suites + script files removed |

### 10.3 Integration

- `cargo tauri dev` builds and runs
- Create project → create suite from template → edit in Visual → generate code → save → run test → verify metrics in RunnerView

---

## 11. Acceptance Criteria

1. **Build**: `cargo tauri dev` compiles and launches (vendor/locust handled separately)
2. **Persistence**: Projects/suites survive app restart (SQLite)
3. **Editor**: Monaco renders with syntax highlighting for Python/JS/TS/Rust
4. **Visual↔Code**: Visual tab "Generate Code" populates Code tab Monaco
5. **Templates**: "New from Template" creates runnable suite for each engine
6. **No Mocks**: Zero mock data in production IPC paths
7. **Tests**: `pnpm test` (54+ tests) + `cargo test -p engine-*` (all pass)
8. **Run Test**: End-to-end: create project → suite → edit → run → see live metrics

---

## 12. Non-Goals (Explicit)

- Code → Visual parsing (AST-based round-trip)
- Git integration for scripts
- Remote sync / cloud storage
- Multi-user / collaboration
- Plugin system for custom engines
- Advanced visual flow features (branching, parallel groups)

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Monaco bundle size (~2MB) | Lazy-load EditorView chunk; code-split via `React.lazy` |
| SQLite migration on existing installs | `CREATE TABLE IF NOT EXISTS` is safe; no down-migration |
| Script file sync with DB | Always write file + DB in same transaction (Rust side) |
| Tauri `invoke` type mismatch | Shared `src/types.ts` ↔ Rust `engine_core::TestConfig` parity |

---

## 14. Rollout Plan

1. **Phase 1**: SQLite schema + IPC commands + tests (Rust only)
2. **Phase 2**: Frontend IPC layer + Project/Suite state in App.tsx
3. **Phase 3**: Monaco Editor component + EditorView (Visual/Code tabs)
4. **Phase 4**: Templates + NewSuiteModal + Sidebar/TopNav integration
4. **Phase 5**: Cleanup mock data + Dashboard fixes + E2E verification
5. **Phase 6**: Test suite expansion + lint/typecheck

---

**Next Step**: Upon approval, invoke `writing-plans` skill to generate detailed implementation plan with task breakdown.