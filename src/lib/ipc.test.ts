import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

let listProjects: typeof import("./ipc").listProjects;
let createProject: typeof import("./ipc").createProject;
let getSuite: typeof import("./ipc").getSuite;
let listScenarioAdapters: typeof import("./ipc").listScenarioAdapters;
let parseScenarioSource: typeof import("./ipc").parseScenarioSource;

beforeAll(async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  ({ listProjects, createProject, getSuite, listScenarioAdapters, parseScenarioSource } = await import("./ipc"));
});

afterAll(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("project ipc", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("lists projects via tauri", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await expect(listProjects()).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledWith("list_projects");
  });

  it("creates a project with trimmed fields", async () => {
    vi.mocked(invoke).mockResolvedValue({ id: "proj-1" });
    await createProject("  Demo  ", "http://localhost:8080", "locust", "Payment flow load testing");
    expect(invoke).toHaveBeenCalledWith("create_project", {
      name: "  Demo  ",
      targetHost: "http://localhost:8080",
      defaultEngine: "locust",
      description: "Payment flow load testing",
    });
  });

  it("fetches a suite with content", async () => {
    vi.mocked(invoke).mockResolvedValue({ id: "suite-1" });
    await getSuite("suite-1");
    expect(invoke).toHaveBeenCalledWith("get_suite", { id: "suite-1" });
  });

  it("loads registered scenario engine capabilities from the native adapter registry", async () => {
    vi.mocked(invoke).mockResolvedValue([{ id: "locust" }]);
    await expect(listScenarioAdapters()).resolves.toEqual([{ id: "locust" }]);
    expect(invoke).toHaveBeenCalledWith("list_scenario_adapters");
  });

  it("passes source and bounded parse context through the native parser command", async () => {
    const source = { id: "s1", fileName: "loadtest.py", language: "python", content: "print('not executed')" };
    const context = { projectId: "p1", suiteId: "s1", maxBytes: 2 * 1024 * 1024, cancelId: "parse-1" };
    vi.mocked(invoke).mockResolvedValue({ source, nodes: [], diagnostics: [], coveredRanges: [], supportPercent: 0 });
    await parseScenarioSource("locust", source, context);
    expect(invoke).toHaveBeenCalledWith("parse_scenario_source", { engineId: "locust", source, context });
  });

});
