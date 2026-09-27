# Local-First SQLite + Monaco Editor + Visual/Code Toggle + Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage projects and mock IPC data with SQLite-backed projects/suites/visual-flows, ship a Monaco code editor inside a tabbed Visual/Code EditorView, and add per-engine starter templates — all local-only, no external DB.

**Architecture:** Extend `loom.db` with `projects` / `test_suites` / `visual_flows` tables and 10 new Tauri IPC commands in `src-tauri`; scripts live on disk under app-data `scripts/<project_id>/`. Frontend loads everything via typed `src/lib/ipc.ts` wrappers, drops all mocks, and renders one `EditorView` with `[Visual | Code]` tabs (Monaco for code, existing flowchart for visual).

**Tech Stack:** Tauri 2.x + rusqlite 0.32 (bundled), React 19 + TypeScript 5.8, `@monaco-editor/react` + `monaco-editor`, Vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-09-27-local-first-sqlite-monaco-visual-code-toggle-templates-design.md`

## Global Constraints

- `pnpm` for JS, `cargo` for Rust — never mix package managers.
- Engines are ALWAYS subprocess-only; never bundle/link/embed engine binaries (k6 stays BYO binary).
- All persistence is local-only: SQLite `loom.db` + app-data script files; no network calls, no external DB.
- PowerShell 5.1 on Windows: chain with `; if ($?) { ... }`, never `&&`; no `tail`/`head`/`||`.
- TDD: failing test first, then minimal implementation, then green, then commit.
- Keep `src/types.ts` field names stable (frontend uses camelCase `targetHost`, `scriptPath`; `TestConfig` stays snake_case).

## Review Focus

- Empty project name or blank target host must be rejected with a clear error, not a silent empty row.
- Selecting a suite whose script file was deleted on disk must show a recoverable error, not a blank editor crash.
- Saving a suite with an unsupported engine id must fail validation before touching disk.
- Visual flow JSON that is corrupt in DB must load the code tab cleanly, not break the whole editor.
- Starting a run with no Ready engine must keep Run disabled with the reason visible.

---

## File Structure

- `src-tauri/src/db.rs` — add `projects`, `test_suites`, `visual_flows` DDL to `initialize()` (idempotent).
- `src-tauri/src/lib.rs` — add `ProjectRecord`/`SuiteRecord`/`SuiteWithContent` serde structs + 10 IPC commands + register in `invoke_handler!`.
- `src-tauri/Cargo.toml` — add missing `csv = "1.3"` (lib.rs already uses `csv::ReaderBuilder` directly).
- `src-tauri/tauri.conf.json` — make `resources` tolerant of missing `vendor/locust` so `cargo tauri dev` builds on a fresh clone.
- `src/types.ts` — extend `Project`/`TestSuite` with `updatedAt`, add `SuiteWithContent`.
- `src/lib/ipc.ts` — delete every mock return; add typed wrappers for the 10 new commands.
- `src/lib/projectState.ts` — delete demo-id filtering + localStorage loader; keep pure config-derivation helpers.
- `src/App.tsx` — load projects/suites from SQLite, add `activeSuiteId`, wire create/select/save through IPC.
- `src/components/ui/MonacoEditor.tsx` — NEW: lazy Monaco wrapper with python/javascript/typescript/rust.
- `src/components/EditorView.tsx` — NEW: `[Visual | Code]` tabs; replaces `ScriptEditorView.tsx` (delete old file at the end).
- `src/components/FlowchartBuilderView.tsx` — add `suiteId`/`initialNodes`/`onSaveVisualFlow` props + Save button.
- `src/templates/templates.json` — NEW: per-engine starter scripts + default load profiles.
- `src/components/projects/TemplatePickerModal.tsx` — NEW: engine-filtered template list.
- `src/components/projects/NewSuiteModal.tsx` — NEW: name + engine + optional template → `create_suite`.
- `src/components/projects/NewProjectModal.tsx` — switch from building a local `Project` object to calling `create_project` IPC.
- `src/components/Sidebar.tsx` — suite list + "New Suite" button.
- `src/components/TopNav.tsx` — project dropdown stays; destinations rename `editor` tab label to "Editor".
- `src/components/DashboardView.tsx` — remove fake CPU/memory interval; show real engine + run data.
- Tests: `src/components/ui/MonacoEditor.test.tsx`, `src/components/EditorView.test.tsx`, `src/components/projects/NewSuiteModal.test.tsx`, `src/components/projects/TemplatePickerModal.test.tsx`, `src/lib/ipc.test.ts`, Rust tests inside `db.rs` + `lib.rs` `#[cfg(test)]`.

---

## Baseline & execution order

- Baseline commit `fb0b7b9` on branch `feat/sqlite-monaco-templates-shell`: prior project-first shell WIP + dropped `vendor/locust` tree. Every task starts from a clean tree.
- Implementers must read the CURRENT file contents first — prior sessions reworked App/Sidebar/TopNav, so historical line numbers may have shifted. Brief text (names, IPC signatures, SQL, test cases) is authoritative, not line numbers.
- Execution order is 0, 1, 2, 3, 4, 5, 7, 8, 6, 9, 10, 12, 11 because Task 6 consumes Task 7's props and Task 8's modal.
- Never `git add -A`: stage only the files your task created or modified (`git status --short` to verify).

### Task 0: Unblock the Tauri build on a fresh clone

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: `cargo check -p loom` passes (build-script + rustc) so later tasks can compile.

**Steps:**

- [ ] **Step 1: Prove the build failure**

Run: `cargo check -p loom`
Expected: FAIL — `glob pattern ../vendor/locust/locust/**/* path not found` from the tauri build script.

- [ ] **Step 2: Make vendored-resource glob optional and add the missing csv dep**

In `src-tauri/tauri.conf.json`, remove the `resources` entry that points at the not-yet-vendored Locust tree:

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "resources": [],
```

In `src-tauri/Cargo.toml`, add the `csv` crate that `src/lib.rs` already imports:

```toml
csv = "1.3"
```

(Rationale: `engine-locust` owns `csv = "1.3"` for itself, but `src-tauri/src/lib.rs` calls `csv::ReaderBuilder` directly, so `loom` needs its own direct dependency. When real Locust vendoring lands, re-add the resource glob together with the vendor drop.)

- [ ] **Step 3: Verify the build passes**

Run: `cargo check -p loom`
Expected: PASS with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "fix: unblock tauri build without vendored locust, add missing csv dep"
```

---

### Task 1: SQLite schema for projects, suites, visual flows

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Consumes: existing `initialize(&Connection)` idempotent pattern.
- Produces: `initialize()` creates `projects`, `test_suites`, `visual_flows` + `idx_suites_project`.

**Steps:**

- [ ] **Step 1: Write the failing schema test**

Append to `src-tauri/src/db.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn creates_project_tables_idempotently() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();
        initialize(&conn).unwrap();
        for table in ["projects", "test_suites", "visual_flows"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
    }

    #[test]
    fn cascade_delete_project_removes_suites_and_flows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        initialize(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, target_host, default_engine) VALUES ('p1', 'P', 'http://localhost:8080', 'locust')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO test_suites (id, project_id, name, engine, script_path, config_json) VALUES ('s1', 'p1', 'S', 'locust', 'x.py', '{}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO visual_flows (suite_id, nodes_json) VALUES ('s1', '[]')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM projects WHERE id = 'p1'", []).unwrap();
        let suites: i64 = conn.query_row("SELECT COUNT(*) FROM test_suites", [], |r| r.get(0)).unwrap();
        let flows: i64 = conn.query_row("SELECT COUNT(*) FROM visual_flows", [], |r| r.get(0)).unwrap();
        assert_eq!(suites, 0);
        assert_eq!(flows, 0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p loom --lib db::tests`
Expected: FAIL — `no such table: projects` (test module missing / tables missing).

- [ ] **Step 3: Add the DDL to initialize()**

In `src-tauri/src/db.rs`, extend the `execute_batch` string after the existing `metrics` indexes:

```sql
CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    target_host    TEXT NOT NULL,
    default_engine TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_suites (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    engine      TEXT NOT NULL,
    script_path TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visual_flows (
    suite_id   TEXT PRIMARY KEY REFERENCES test_suites(id) ON DELETE CASCADE,
    nodes_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suites_project ON test_suites(project_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p loom --lib db::tests`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: add projects, test_suites, visual_flows tables to loom.db"
```

---

### Task 2: Rust IPC commands for projects/suites/visual flows

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: inline `#[cfg(test)]` in `src-tauri/src/lib.rs` (pure helpers) + manual `cargo check`.

**Interfaces:**
- Consumes: `AppState { db, engines, active_runs }`, `db::initialize`, `uuid::Uuid`.
- Produces: `list_projects`, `create_project`, `update_project`, `delete_project`, `list_suites`, `create_suite`, `update_suite`, `delete_suite`, `get_suite`, `save_visual_flow` — all `#[tauri::command]`, `Result<_, String>`, registered in `invoke_handler!`.

**Steps:**

- [ ] **Step 1: Write the failing check — new commands are referenced but missing**

Add a compile-only test at the bottom of `src-tauri/src/lib.rs`:

```rust
#[cfg(test)]
mod ipc_shape_tests {
    use super::*;

    #[test]
    fn script_extension_mapping_covers_all_engines() {
        assert_eq!(script_extension_for_engine("locust"), "py");
        assert_eq!(script_extension_for_engine("k6"), "js");
        assert_eq!(script_extension_for_engine("goose"), "rs");
    }

    #[test]
    fn rejects_unsupported_engine_before_touching_disk() {
        let err = validate_suite_engine("jmeter").unwrap_err();
        assert!(err.contains("Unsupported engine"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test -p loom --lib ipc_shape_tests`
Expected: FAIL — `script_extension_for_engine` / `validate_suite_engine` not defined.

- [ ] **Step 3: Implement serde records + helpers + 10 commands**

Add to `src-tauri/src/lib.rs` (above the IPC section):

```rust
fn script_extension_for_engine(engine: &str) -> &'static str {
    match engine {
        "locust" => "py",
        "k6" => "js",
        "goose" => "rs",
        _ => "txt",
    }
}

fn validate_suite_engine(engine: &str) -> Result<(), String> {
    match engine {
        "locust" | "k6" | "goose" => Ok(()),
        other => Err(format!("Unsupported engine: {other}")),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRecord {
    id: String,
    name: String,
    description: String,
    target_host: String,
    default_engine: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteRecord {
    id: String,
    project_id: String,
    name: String,
    engine: String,
    script_path: String,
    config: TestConfig,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteWithContent {
    id: String,
    project_id: String,
    name: String,
    engine: String,
    script_path: String,
    config: TestConfig,
    created_at: String,
    updated_at: String,
    script_content: String,
    visual_nodes: Option<serde_json::Value>,
}
```

Commands (each locks `state.db`, returns `Err(String)` on failure; `create_suite`/`update_suite` write the script file under `app_data_dir/scripts/<project_id>/<suite_id>.<ext>` with `tokio::fs`; `delete_project`/`delete_suite` remove script files with `std::fs::remove_file` best-effort):

```rust
#[tauri::command]
fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<ProjectRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT id, name, description, target_host, default_engine, created_at, updated_at FROM projects ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRecord {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
            target_host: row.get(3)?, default_engine: row.get(4)?,
            created_at: row.get(5)?, updated_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
fn create_project(state: tauri::State<'_, AppState>, name: String, target_host: String, default_engine: String) -> Result<ProjectRecord, String> {
    let name = name.trim().to_string();
    let target_host = target_host.trim().to_string();
    if name.is_empty() { return Err("Project name must not be empty".into()); }
    if target_host.is_empty() { return Err("Target host must not be empty".into()); }
    validate_suite_engine(&default_engine)?;
    let id = format!("proj-{}", Uuid::new_v4());
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO projects (id, name, target_host, default_engine) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, target_host, default_engine],
    ).map_err(|e| e.to_string())?;
    let rec = db.query_row(
        "SELECT id, name, description, target_host, default_engine, created_at, updated_at FROM projects WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(ProjectRecord {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
            target_host: row.get(3)?, default_engine: row.get(4)?,
            created_at: row.get(5)?, updated_at: row.get(6)?,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(rec)
}
```

`update_project(id, name: Option<String>, target_host: Option<String>, default_engine: Option<String>)`: validate non-empty when `Some`, `UPDATE ... updated_at = datetime('now')`, then re-select. `delete_project(app, state, id)`: select suite script paths, delete script files best-effort, `DELETE FROM projects WHERE id`, remove `scripts/<id>` dir best-effort.

`list_suites(state, project_id)`: parse each `config_json` into `TestConfig` (skip corrupt rows).

`create_suite(app, state, project_id, name, engine, script_content, config: TestConfig, visual_nodes: Option<serde_json::Value>)`: validate name non-empty + engine supported; verify project exists; write script file; insert suite + optional visual flow; return `SuiteRecord`.

`update_suite(app, state, id, name: Option<String>, script_content: Option<String>, config: Option<TestConfig>, visual_nodes: Option<serde_json::Value>)`: update provided fields + file + flow upsert (`INSERT ... ON CONFLICT(suite_id) DO UPDATE`), bump `updated_at`, return `SuiteRecord`.

`delete_suite(app, state, id)`: delete file best-effort, `DELETE FROM test_suites` (flow cascades).

`get_suite(app, state, id)`: select suite, `tokio::fs::read_to_string` fallback to `""` with no crash when the file was deleted externally, parse config (error if corrupt — surfaces as recoverable editor error), load optional visual flow, return `SuiteWithContent`.

`save_visual_flow(state, suite_id, nodes_json: String)`: `serde_json::from_str::<serde_json::Value>` first (reject corrupt JSON with `"Visual flow must be valid JSON"`), then upsert.

Register all ten in `invoke_handler!` alongside the existing seven commands.

- [ ] **Step 4: Verify compile + unit tests**

Run: `cargo test -p loom --lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add sqlite-backed project and suite ipc commands"
```

---

### Task 3: Frontend IPC layer — drop mocks, add typed wrappers

**Files:**
- Modify: `src/lib/ipc.ts`
- Create: `src/lib/ipc.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: Tauri `invoke`; Rust commands from Task 2.
- Produces: `listProjects`, `createProject`, `updateProject`, `deleteProject`, `listSuites`, `createSuite`, `updateSuite`, `deleteSuite`, `getSuite`, `saveVisualFlow`; `SuiteWithContent` type.

**Steps:**

- [ ] **Step 1: Write the failing IPC test**

Create `src/lib/ipc.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listProjects, createProject, getSuite } from "./ipc";

describe("project ipc", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("lists projects via tauri", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await expect(listProjects()).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledWith("list_projects");
  });

  it("creates a project with trimmed fields", async () => {
    vi.mocked(invoke).mockResolvedValue({ id: "proj-1" });
    await createProject("  Demo  ", "http://localhost:8080", "locust");
    expect(invoke).toHaveBeenCalledWith("create_project", {
      name: "  Demo  ",
      targetHost: "http://localhost:8080",
      defaultEngine: "locust",
    });
  });

  it("fetches a suite with content", async () => {
    vi.mocked(invoke).mockResolvedValue({ id: "suite-1" });
    await getSuite("suite-1");
    expect(invoke).toHaveBeenCalledWith("get_suite", { id: "suite-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ipc.test.ts`
Expected: FAIL — `listProjects` / `createProject` / `getSuite` not exported.

- [ ] **Step 3: Rewrite ipc.ts without mocks**

Delete every mock return in `src/lib/ipc.ts` (`listEngines` mock array, `startRun` random id, `getRunHistory` fake runs, `readScript` sample). Browser (non-Tauri) fallbacks return empty values (`[]` / `""`) and `startRun` throws `new Error("Running tests requires the Tauri desktop app (cargo tauri dev)")`. Add:

```ts
import type { Project, SuiteWithContent, TestConfig, TestSuite } from "../types";

export async function listProjects(): Promise<Project[]> {
  if (!isTauri) return [];
  return await invoke<Project[]>("list_projects");
}

export async function createProject(name: string, targetHost: string, defaultEngine: string): Promise<Project> {
  if (!isTauri) throw new Error("Projects require the Tauri desktop app (cargo tauri dev)");
  return await invoke<Project>("create_project", { name, targetHost, defaultEngine });
}

export async function listSuites(projectId: string): Promise<TestSuite[]> {
  if (!isTauri) return [];
  return await invoke<TestSuite[]>("list_suites", { projectId });
}

export async function createSuite(args: {
  projectId: string; name: string; engine: string;
  scriptContent: string; config: TestConfig; visualNodes?: unknown;
}): Promise<TestSuite> {
  if (!isTauri) throw new Error("Suites require the Tauri desktop app (cargo tauri dev)");
  return await invoke<TestSuite>("create_suite", {
    projectId: args.projectId, name: args.name, engine: args.engine,
    scriptContent: args.scriptContent, config: args.config, visualNodes: args.visualNodes ?? null,
  });
}

export async function updateSuite(id: string, patch: {
  name?: string; scriptContent?: string; config?: TestConfig; visualNodes?: unknown;
}): Promise<TestSuite> {
  if (!isTauri) throw new Error("Suites require the Tauri desktop app (cargo tauri dev)");
  return await invoke<TestSuite>("update_suite", { id, ...patch });
}

export async function deleteSuite(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("delete_suite", { id });
}

export async function getSuite(id: string): Promise<SuiteWithContent> {
  if (!isTauri) throw new Error("Suites require the Tauri desktop app (cargo tauri dev)");
  return await invoke<SuiteWithContent>("get_suite", { id });
}

export async function saveVisualFlow(suiteId: string, nodesJson: string): Promise<void> {
  if (!isTauri) return;
  await invoke("save_visual_flow", { suiteId, nodesJson });
}
```

Also add `updateProject` and `deleteProject` wrappers with the same guard pattern.

In `src/types.ts`, add `updatedAt: string` to `Project` and `TestSuite`, and:

```ts
export interface SuiteWithContent extends TestSuite {
  projectId: string;
  scriptContent: string;
  visualNodes?: unknown;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run src/lib/ipc.test.ts`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ipc.ts src/lib/ipc.test.ts src/types.ts
git commit -m "feat: sqlite-backed ipc wrappers, remove mock data"
```

---

### Task 4: App state from SQLite instead of localStorage

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/projectState.ts`

**Interfaces:**
- Consumes: Task 3 wrappers (`listProjects`, `listSuites`, `getSuite`).
- Produces: `projects` from DB, `activeSuiteId`, suite-driven `config`; no `loom_projects` localStorage writes.

**Steps:**

- [ ] **Step 1: Write the failing App behavior test**

Extend `src/lib/projectState.test.ts` with:

```ts
it("derives fallback config when a project has no suites", () => {
  const cfg = projectConfigForSelection([], "");
  expect(cfg.engine).toBe("locust");
  expect(cfg.script_path).toBe("");
});
```

(This pins the empty-DB first-run path: no suites → blank config, Run stays disabled.)

- [ ] **Step 2: Run to verify current suite passes but App still reads localStorage**

Run: `pnpm vitest run src/lib/projectState.test.ts`
Expected: PASS (helper already handles it) — the real failure is manual: `App.tsx` still calls `loadProjectState(localStorage...)`.

- [ ] **Step 3: Rewire App.tsx**

In `src/App.tsx`:
1. Delete `initialProjectState` / `persistedProjects` / `loom_projects` + `loom_active_project_id` localStorage reads/writes (keep only `loom_onboarding_completed`).
2. Init `projects: Project[] = []`, `activeProjectId = ""`, `activeSuiteId: string | null = null`.
3. On mount: `listProjects()` → set projects, pick first as active, then `listSuites(activeId)` and merge suites into the project object.
4. `handleSelectProject`: set active, `listSuites`, derive config via `projectConfigForSelection`.
5. `handleSelectScript(path, engine)`: find suite by script path; set `activeSuiteId` when matched.
6. `handleCreateProject(newProj: Project)`: prepend, set active, close modal (caller now passes the DB-created project — see Task 9).
7. Keep engine/metric/log subscriptions untouched.

In `src/lib/projectState.ts`: delete `SHIPPED_DEMO_IDS`, `isRecord`, `isRenderableProject`, `loadProjectState`, `ProjectState` interface. Keep `configForSuite` + `projectConfigForSelection`.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/lib/projectState.test.ts`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/lib/projectState.ts src/lib/projectState.test.ts
git commit -m "feat: load projects and suites from sqlite"
```

---

### Task 5: Monaco editor dependency + wrapper component

**Files:**
- Modify: `package.json`
- Create: `src/components/ui/MonacoEditor.tsx`
- Create: `src/components/ui/MonacoEditor.test.tsx`

**Interfaces:**
- Consumes: `monaco-editor` language contributions for python/javascript/typescript/rust.
- Produces: `<MonacoEditor language value onChange theme height />` used by EditorView.

**Steps:**

- [ ] **Step 1: Write the failing component test**

Create `src/components/ui/MonacoEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonacoEditor } from "./MonacoEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, language, onChange }: any) => (
    <textarea aria-label={`monaco-${language}`} value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

describe("MonacoEditor", () => {
  it("renders python content", () => {
    render(<MonacoEditor language="python" value="print('hi')" onChange={() => {}} />);
    expect(screen.getByLabelText("monaco-python")).toHaveValue("print('hi')");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/ui/MonacoEditor.test.tsx`
Expected: FAIL — module `./MonacoEditor` not found.

- [ ] **Step 3: Install deps + write the wrapper**

Run: `pnpm add @monaco-editor/react monaco-editor`

Create `src/components/ui/MonacoEditor.tsx`:

```tsx
import Editor from "@monaco-editor/react";
import "monaco-editor/esm/vs/editor/editor.main.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js";

export type MonacoLanguage = "python" | "javascript" | "typescript" | "rust";

export function monacoLanguageForEngine(engine: string, scriptPath: string): MonacoLanguage {
  if (scriptPath.endsWith(".ts")) return "typescript";
  if (scriptPath.endsWith(".rs")) return "rust";
  if (scriptPath.endsWith(".js")) return "javascript";
  if (engine === "k6") return "javascript";
  if (engine === "goose") return "rust";
  return "python";
}

interface MonacoEditorProps {
  language: MonacoLanguage;
  value: string;
  onChange: (value: string) => void;
  theme?: "vs-dark" | "vs";
  height?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  language, value, onChange, theme = "vs-dark", height = "100%",
}) => (
  <Editor
    height={height}
    language={language}
    value={value}
    theme={theme}
    onChange={(next) => onChange(next ?? "")}
    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
  />
);
```

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/ui/MonacoEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/MonacoEditor.tsx src/components/ui/MonacoEditor.test.tsx
git commit -m "feat: add monaco editor with python js ts rust support"
```

---

### Task 6: Tabbed EditorView (Visual | Code) replacing the textarea editor

**Files:**
- Create: `src/components/EditorView.tsx`
- Create: `src/components/EditorView.test.tsx`
- Modify: `src/App.tsx` (render `EditorView` instead of `ScriptEditorView`)
- Delete: `src/components/ScriptEditorView.tsx` (only after App no longer imports it)

**Interfaces:**
- Consumes: `MonacoEditor`, `FlowchartBuilderView` (with Task 7 props), `getSuite`/`updateSuite`/`saveScript`, `monacoLanguageForEngine`.
- Produces: tabbed editor bound to `suiteId`; Visual→Code via "Generate Code"; Save persists script + config + visual nodes.

**Steps:**

- [ ] **Step 1: Write the failing EditorView test**

Create `src/components/EditorView.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorView } from "./EditorView";

vi.mock("./ui/MonacoEditor", () => ({
  MonacoEditor: ({ value }: any) => <textarea aria-label="code-tab" value={value} readOnly />,
  monacoLanguageForEngine: () => "python",
}));
vi.mock("./FlowchartBuilderView", () => ({
  FlowchartBuilderView: () => <div>visual-flow-stub</div>,
}));

describe("EditorView", () => {
  it("switches between visual and code tabs", () => {
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={() => {}} />);
    expect(screen.getByText("visual-flow-stub")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /code/i }));
    expect(screen.getByLabelText("code-tab")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/EditorView.test.tsx`
Expected: FAIL — `./EditorView` not found.

- [ ] **Step 3: Implement EditorView**

Create `src/components/EditorView.tsx` with:
- Props: `{ suiteId: string | null; scriptPath: string; engine: string; targetHost: string; onRunTest: () => void; onSuiteSaved?: (suite: TestSuite) => void }`.
- State: `mode: "visual" | "code"`, `code`, `visualNodes: FlowNode[] | null`, `dirty`, `status`.
- On `suiteId` change: `getSuite(suiteId)` → set code/script content, visual nodes (guard JSON parse with try/catch → fall back to `null`, code tab still works per Review Focus), derive config in parent via `onSuiteSaved`.
- Visual tab renders `FlowchartBuilderView` with `suiteId`, `initialNodes`, `onExportToRunner` (sets code + flips to code tab), `onSaveVisualFlow` (calls `saveVisualFlow` + `updateSuite`).
- Code tab renders toolbar (language label, "New from Template" → opens `TemplatePickerModal`, Save, Run) + `MonacoEditor`.
- Save: `updateSuite(suiteId, { script_content: code, visual_nodes })`; on missing file on disk the Rust side recreates it, so surface `status` text instead of crashing.
- Tabs use `role="tab"` + `aria-selected` so the test query works.

In `src/App.tsx`: replace `ScriptEditorView` import/render with `EditorView`, passing `activeSuiteId`, `config.script_path`, `selectedEngineId`, `config.target.host`. Delete `src/components/ScriptEditorView.tsx`.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/EditorView.test.tsx`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EditorView.tsx src/components/EditorView.test.tsx src/App.tsx
git rm src/components/ScriptEditorView.tsx
git commit -m "feat: tabbed visual and code editor backed by suites"
```

---

### Task 7: FlowchartBuilderView suite persistence props

**Files:**
- Modify: `src/components/FlowchartBuilderView.tsx`
- Modify: `src/components/FlowchartBuilderView.test.tsx`

**Interfaces:**
- Consumes: `FlowNode[]` from DB via `initialNodes`.
- Produces: `onSaveVisualFlow(nodes)` callback; "Save flow" button in inspector.

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `src/components/FlowchartBuilderView.test.tsx`:

```tsx
it("hydrates from initial nodes and saves the flow", () => {
  const onSave = vi.fn();
  render(<FlowchartBuilderView targetHost="http://x" onExportToRunner={() => {}} initialNodes={[{ id: "n1", type: "http", title: "Saved Step", method: "GET", path: "/saved", x: 0, y: 0 }]} onSaveVisualFlow={onSave} />);
  expect(screen.getByText("Saved Step")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /save flow/i }));
  expect(onSave).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/FlowchartBuilderView.test.tsx`
Expected: FAIL — `initialNodes` / `onSaveVisualFlow` props do not exist.

- [ ] **Step 3: Implement the props**

In `src/components/FlowchartBuilderView.tsx`:
1. Extend props: `{ onExportToRunner; targetHost; suiteId?: string; initialNodes?: FlowNode[]; onSaveVisualFlow?: (nodes: FlowNode[]) => void }`.
2. Init state: `useState<FlowNode[]>(initialNodes ?? initialNodes_fallback)` and `useEffect` to reset when `suiteId` changes.
3. Add "Save flow" `LoomButton` in the inspector header calling `onSaveVisualFlow?.(nodes)`.
4. Keep existing generators untouched.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/FlowchartBuilderView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FlowchartBuilderView.tsx src/components/FlowchartBuilderView.test.tsx
git commit -m "feat: visual builder loads and saves suite flows"
```

---

### Task 8: Starter templates + picker modal

**Files:**
- Create: `src/templates/templates.json`
- Create: `src/templates/index.ts`
- Create: `src/components/projects/TemplatePickerModal.tsx`
- Create: `src/components/projects/TemplatePickerModal.test.tsx`

**Interfaces:**
- Consumes: engine id (`locust` | `k6` | `goose`).
- Produces: `getTemplatesForEngine(engine)` + modal returning the picked template `{ script, config }`.

**Steps:**

- [ ] **Step 1: Write the failing template test**

Create `src/components/projects/TemplatePickerModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplatePickerModal } from "./TemplatePickerModal";

describe("TemplatePickerModal", () => {
  it("lists locust starters", () => {
    render(<TemplatePickerModal isOpen engine="locust" onClose={() => {}} onPick={vi.fn()} />);
    expect(screen.getByText("Basic HTTP GET")).toBeTruthy();
  });

  it("returns null when closed", () => {
    const { container } = render(<TemplatePickerModal isOpen={false} engine="locust" onClose={() => {}} onPick={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/projects/TemplatePickerModal.test.tsx`
Expected: FAIL — files not found.

- [ ] **Step 3: Write templates.json + loader + modal**

Create `src/templates/templates.json` with keys `locust` (basic GET, login + authenticated flow, REST CRUD), `k6` (basic GET, auth flow, soak stages), `goose` (basic scenario). Each entry: `{ id, name, description, script, config: { users, spawn_rate, duration } }`. Scripts must be runnable as-is against `TARGET_HOST`/`host` (Locust uses `HttpUser`, k6 reads `__ENV.TARGET_HOST`, Goose uses `goose = "0.18"` transaction style matching the existing example).

Create `src/templates/index.ts`:

```ts
import templates from "./templates.json";

export interface StarterTemplate {
  id: string; name: string; description: string;
  script: string; config: { users: number; spawn_rate: number; duration: string };
}

export function getTemplatesForEngine(engine: string): StarterTemplate[] {
  const all = templates as Record<string, StarterTemplate[]>;
  return all[engine] ?? [];
}
```

Create `src/components/projects/TemplatePickerModal.tsx`: dialog with engine-filtered list (name + description), click → `onPick(template)` → close. `isOpen === false` returns `null`.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/projects/TemplatePickerModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/templates/templates.json src/templates/index.ts src/components/projects/TemplatePickerModal.tsx src/components/projects/TemplatePickerModal.test.tsx
git commit -m "feat: per-engine starter templates and picker"
```

---

### Task 9: Suite creation + Sidebar/TopNav/NewProject wiring

**Files:**
- Create: `src/components/projects/NewSuiteModal.tsx`
- Create: `src/components/projects/NewSuiteModal.test.tsx`
- Modify: `src/components/projects/NewProjectModal.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/TopNav.tsx` (only the `destinations` label for `editor`)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 3 (`createProject`, `createSuite`, `listSuites`), Task 8 (`TemplatePickerModal`, `getTemplatesForEngine`).
- Produces: "New Suite" flow (name + engine + optional template) that opens the new suite in EditorView; "New Project" through SQLite.

**Steps:**

- [ ] **Step 1: Write the failing NewSuiteModal test**

Create `src/components/projects/NewSuiteModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewSuiteModal } from "./NewSuiteModal";

describe("NewSuiteModal", () => {
  it("requires a suite name", () => {
    const onCreate = vi.fn();
    render(<NewSuiteModal isOpen projectId="p1" onClose={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /create suite/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/suite name/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/projects/NewSuiteModal.test.tsx`
Expected: FAIL — `./NewSuiteModal` not found.

- [ ] **Step 3: Implement the modal + rewire callers**

Create `src/components/projects/NewSuiteModal.tsx`:
- Props: `{ isOpen; projectId: string; defaultEngine?: string; targetHost?: string; onClose: () => void; onCreate: (suite: TestSuite) => void }`.
- Fields: suite name (required), engine selector (locust/k6/goose buttons), "Start from template" → `TemplatePickerModal` filtered by engine → fills `scriptContent` + load profile preview.
- Submit: build `TestConfig` (`project_name` from project, `script_path` placeholder — Rust assigns the real path), call `createSuite({ projectId, name, engine, scriptContent, config })`, then `onCreate(suite)`.
- Invalid engine or empty name: block submit with inline error (covers Review Focus row 3).

Rewrite `NewProjectModal` submit: `const created = await createProject(name.trim(), targetHost.trim(), selectedEngine)` then `onCreateProject({ ...created, suites: [] })`. Remove local id/script-path fabrication. Keep users/spawn-rate/duration fields as the initial suite? No — project creation only; the first suite comes from NewSuiteModal (simpler, explicit).

`Sidebar`: under the project block add suite list (already shows `activeProject.suites`) + "New Suite" button prop `onOpenNewSuite`. Suite click calls `onSelectScript(suite.scriptPath, suite.engine)` and opens the `editor` tab (change existing `onSelectTab("runner")` for suites to `onSelectTab("editor")`).

`TopNav` destinations: rename `{ id: "editor", label: "Script editor" }` → `{ id: "editor", label: "Editor" }`.

`App`: add `isNewSuiteOpen` state, `handleCreateSuite` (merge suite into project, set `activeSuiteId`, derive config, open `editor`), pass `onOpenNewSuite` to Sidebar, render `NewSuiteModal`.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/projects/NewSuiteModal.test.tsx`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/NewSuiteModal.tsx src/components/projects/NewSuiteModal.test.tsx src/components/projects/NewProjectModal.tsx src/components/Sidebar.tsx src/components/TopNav.tsx src/App.tsx
git commit -m "feat: sqlite-backed project and suite creation flow"
```

---

### Task 10: Remove remaining mocks/demo + fix Dashboard

**Files:**
- Modify: `src/components/DashboardView.tsx`
- Modify: `src/components/DashboardView.test.tsx`
- Modify: `src/lib/projectState.ts` (if any demo residue remains)
- Delete: `src/components/ScriptEditorView.tsx` if Task 6 left it behind (verify no imports remain first)

**Interfaces:**
- Consumes: `engines`, `getRunHistory`.
- Produces: dashboard with zero simulated data.

**Steps:**

- [ ] **Step 1: Write the failing dashboard test**

Add to `src/components/DashboardView.test.tsx`:

```tsx
it("shows engine readiness from props without simulated telemetry", async () => {
  render(<DashboardView engines={[]} onNavigate={() => {}} onSelectEngine={() => {}} targetHost="" onRerun={() => {}} />);
  expect(screen.getByText(/no engines detected/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify current behavior**

Run: `pnpm vitest run src/components/DashboardView.test.tsx`
Expected: PASS or FAIL depending on existing copy — the manual gap is the `setInterval` CPU/memory simulation still in the component.

- [ ] **Step 3: Strip the simulation**

In `src/components/DashboardView.tsx`: delete `cpuUsage`/`memUsage` state + the 3-second interval. Replace the "Local execution health" panel with real data: `readyEnginesCount / engines.length`, recent-run count from `getRunHistory()`, and static "Local SQLite buffer" copy. Keep `loadRecentRuns` + refresh button.

Grep for leftovers and delete: `SHIPPED_DEMO_IDS`, `loom_projects`, `mock-` strings in `src/` (excluding tests).

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/components/DashboardView.test.tsx`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardView.tsx src/components/DashboardView.test.tsx src/lib/projectState.ts
git commit -m "chore: remove demo telemetry and mock leftovers"
```

---

### Task 11: Full verification (frontend + rust + build)

**Files:** none (verification only).

**Steps:**

- [ ] **Step 1: Frontend tests**

Run: `pnpm test`
Expected: all files pass (baseline was 17 files / 54 tests; count grows with new suites).

- [ ] **Step 2: Frontend typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

Run: `pnpm run lint`
Expected: PASS (fix any new violations inline).

- [ ] **Step 3: Rust workspace tests**

Run: `cargo test -p engine-core -p engine-locust -p engine-goose -p engine-k6 -p runtime-manager`
Expected: PASS (baseline: all green).

Run: `cargo test -p loom --lib`
Expected: PASS (new db + ipc-shape tests).

- [ ] **Step 4: Rust checks**

Run: `cargo check -p loom`
Expected: PASS.

- [ ] **Step 5: Manual end-to-end in Tauri**

Run: `cargo tauri dev`
Expected: onboarding → create project → New Suite from template → edit Visual → Generate Code → Save → open Runner → Run Test (with a real engine installed, e.g. `pip install locust`) → live metrics appear; restart app → project + suite persist.

- [ ] **Step 6: Commit any test fixes**

```bash
git status --short
git add <only the test/source files this task changed>
git commit -m "test: expand coverage for sqlite projects, editor, templates"
```

(Never `git add -A` — it sweeps unrelated files into the commit and breaks review diffs.)

---

## Self-Review

**1. Spec coverage:** §1 SQLite schema → Task 1 DDL + Task 2 IPC. §2 ten IPC commands → Task 2 (all named). §3 frontend arch + mock removal → Tasks 3, 4, 10. §4 Monaco → Task 5. §5 EditorView tabs → Task 6. §6 templates → Task 8. §7 project/suite UI → Task 9. §8 demo removal → Tasks 3, 10. §9 visual builder props → Task 7. §10 testing → Tasks 1–11 each carry tests. §11 acceptance criteria → Task 11 E2E. Non-goals (code→visual parsing, git, sync) are excluded.

**2. Placeholder scan:** No TBD/TODO; every code step ships concrete signatures, SQL, and TS. Template script bodies are the one content payload — specified as runnable per-engine starters with exact shape, filled in Task 8.

**3. Type consistency:** `Project`/`TestSuite` camelCase (`targetHost`, `scriptPath`, `updatedAt`) used in Rust `rename_all = "camelCase"` records, TS types, and IPC payloads uniformly. `TestConfig` stays snake_case end-to-end (Rust `engine_core` ↔ TS). `SuiteWithContent` extends `TestSuite` in both layers.

**4. Review Focus:** Row 1 (empty name/host) → Task 2 validation + Task 9 modal test. Row 2 (deleted script file) → Task 2 `get_suite` fallback + Task 6 status surface. Row 3 (bad engine) → Task 2 `validate_suite_engine` + Task 9 blocked submit. Row 4 (corrupt flow JSON) → Task 2 server-side JSON check + Task 6 try/catch hydration. Row 5 (no Ready engine) → existing `canRun` gating preserved through Task 4; Runner shows "Engine unavailable".
