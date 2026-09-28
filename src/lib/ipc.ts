import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { EngineInfo, NormalizedMetric, Project, RunLog, RunRecord, SuiteWithContent, TestConfig, TestSuite } from "../types";

// Check if running inside Tauri
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function listEngines(): Promise<EngineInfo[]> {
  if (isTauri) {
    return await invoke<EngineInfo[]>("list_engines");
  }

  // Browser (non-Tauri) fallback: empty values
  return [];
}

export async function startRun(engineId: string, config: TestConfig): Promise<string> {
  if (isTauri) {
    return await invoke<string>("start_run", { engineId, config });
  }
  throw new Error("Running tests requires the Tauri desktop app (cargo tauri dev)");
}

export async function stopRun(runId: string): Promise<void> {
  if (isTauri) {
    await invoke("stop_run", { runId });
  }
}

export async function getRunHistory(): Promise<RunRecord[]> {
  if (isTauri) {
    return await invoke<RunRecord[]>("get_run_history");
  }
  return [];
}

export async function readScript(filePath: string): Promise<string> {
  if (isTauri) {
    return await invoke<string>("read_script", { filePath });
  }
  return "";
}

export async function saveScript(filePath: string, content: string): Promise<void> {
  if (isTauri) {
    await invoke("save_script", { filePath, content });
  }
}

export async function subscribeToMetrics(
  callback: (metric: NormalizedMetric) => void
): Promise<UnlistenFn> {
  if (isTauri) {
    return await listen<NormalizedMetric>("metric", (event) => {
      callback(event.payload);
    });
  }
  return () => {};
}

export async function subscribeToLogs(
  callback: (log: RunLog) => void
): Promise<UnlistenFn> {
  if (isTauri) {
    return await listen<RunLog>("run-log", (event) => {
      callback(event.payload);
    });
  }
  return () => {};
}

export async function subscribeToRunStarted(
  callback: (payload: { run_id: string; engine: string }) => void
): Promise<UnlistenFn> {
  if (isTauri) {
    return await listen<{ run_id: string; engine: string }>("run-started", (event) => {
      callback(event.payload);
    });
  }
  return () => {};
}

export async function subscribeToRunFinished(
  callback: (payload: { run_id: string; status: string }) => void
): Promise<UnlistenFn> {
  if (isTauri) {
    return await listen<{ run_id: string; status: string }>("run-finished", (event) => {
      callback(event.payload);
    });
  }
  return () => {};
}

export async function listProjects(): Promise<Project[]> {
  if (!isTauri) return [];
  return await invoke<Project[]>("list_projects");
}

export async function createProject(name: string, targetHost: string, defaultEngine: string, description = ""): Promise<Project> {
  if (!isTauri) throw new Error("Projects require the Tauri desktop app (cargo tauri dev)");
  return await invoke<Project>("create_project", { name, targetHost, defaultEngine, description });
}

export async function updateProject(id: string, patch: { name?: string; targetHost?: string; defaultEngine?: string }): Promise<Project> {
  if (!isTauri) throw new Error("Projects require the Tauri desktop app (cargo tauri dev)");
  return await invoke<Project>("update_project", { id, ...patch });
}

export async function deleteProject(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("delete_project", { id });
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
