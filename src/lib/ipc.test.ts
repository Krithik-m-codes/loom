import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

let listProjects: typeof import("./ipc").listProjects;
let createProject: typeof import("./ipc").createProject;
let getSuite: typeof import("./ipc").getSuite;

beforeAll(async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  ({ listProjects, createProject, getSuite } = await import("./ipc"));
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
