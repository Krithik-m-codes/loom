import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { EngineInfo, NormalizedMetric, RunLog, RunRecord, TestConfig } from "../types";

// Check if running inside Tauri
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function listEngines(): Promise<EngineInfo[]> {
  if (isTauri) {
    return await invoke<EngineInfo[]>("list_engines");
  }

  // Mock data for browser preview/testing
  return [
    {
      id: "locust",
      display_name: "Locust",
      engine_language: "Python",
      license: "MIT",
      license_tier: "Core",
      supported_script_languages: ["Python"],
      availability: { Ready: { version: "locust 2.44.1" } },
    },
    {
      id: "goose",
      display_name: "Goose",
      engine_language: "Rust",
      license: "MIT OR Apache-2.0",
      license_tier: "Core",
      supported_script_languages: ["Rust"],
      availability: { Ready: { version: "goose 0.17.2" } },
    },
    {
      id: "k6",
      display_name: "k6",
      engine_language: "Go",
      license: "AGPL-3.0-only",
      license_tier: "Plugin",
      supported_script_languages: ["JavaScript", "TypeScript"],
      availability: {
        NotInstalled: {
          install_hint:
            "Install k6 via package manager:\n  Windows: winget install k6.k6\n  macOS: brew install k6\n  Linux: https://grafana.com/docs/k6/latest/set-up/install-k6/",
        },
      },
    },
  ];
}

export async function startRun(engineId: string, config: TestConfig): Promise<string> {
  if (isTauri) {
    return await invoke<string>("start_run", { engineId, config });
  }
  const mockId = "mock-" + Math.random().toString(36).substring(2, 9);
  return mockId;
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
  return [
    {
      id: "run-e8f9a2b1",
      engine: "locust",
      project: "ecommerce-api",
      config: JSON.stringify({ users: 50, spawn_rate: 5, duration: "60s" }),
      started_at: "2026-09-17 14:30:00",
      finished_at: "2026-09-17 14:31:00",
      status: "finished",
    },
    {
      id: "run-a1c3d4e5",
      engine: "goose",
      project: "auth-service",
      config: JSON.stringify({ users: 100, spawn_rate: 10, duration: "120s" }),
      started_at: "2026-09-17 14:15:00",
      finished_at: "2026-09-17 14:17:00",
      status: "finished",
    },
  ];
}

export async function readScript(filePath: string): Promise<string> {
  if (isTauri) {
    return await invoke<string>("read_script", { filePath });
  }
  return `# Sample script for ${filePath}\nfrom locust import HttpUser, task\n\nclass QuickstartUser(HttpUser):\n    @task\n    def hello_world(self):\n        self.client.get("/hello")\n`;
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
