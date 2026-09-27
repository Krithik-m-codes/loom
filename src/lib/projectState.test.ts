import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { projectConfigForSelection } from "./projectState";

const userProject: Project = {
  id: "customer-workspace",
  name: "Customer workspace",
  description: "Owned by a user",
  targetHost: "https://api.example.test",
  defaultEngine: "k6",
  createdAt: "2026-01-01T00:00:00.000Z",
  suites: [{
    id: "custom-suite",
    name: "Smoke",
    engine: "k6",
    scriptPath: "tests/smoke.js",
    config: {
      project_name: "Customer workspace",
      engine: "k6",
      script_path: "tests/smoke.js",
      load_profile: { users: 4, spawn_rate: 1, duration: "30s" },
      target: { host: "https://api.example.test", headers: { Authorization: "env:API_TOKEN" } },
    },
  }],
};

const otherProject: Project = {
  ...userProject,
  id: "another-workspace",
  name: "Another workspace",
  suites: [],
};

describe("project config selection", () => {
  it("clears a stale script when selecting a project with no suites", () => {
    const config = projectConfigForSelection([otherProject], "another-workspace");
    expect(config.project_name).toBe("Another workspace");
    expect(config.script_path).toBe("");
    expect(config.target.host).toBe("https://api.example.test");
  });

  it("uses the suite engine and script path over conflicting saved config metadata", () => {
    const conflictingProject: Project = {
      ...userProject,
      suites: [{
        ...userProject.suites[0],
        config: { ...userProject.suites[0].config, engine: "locust", script_path: "tests/wrong.py" },
      }],
    };

    expect(projectConfigForSelection([conflictingProject], conflictingProject.id)).toEqual({
      project_name: "Customer workspace",
      engine: "k6",
      script_path: "tests/smoke.js",
      load_profile: { users: 4, spawn_rate: 1, duration: "30s" },
      target: { host: "https://api.example.test", headers: { Authorization: "env:API_TOKEN" } },
    });
    expect(conflictingProject.suites[0].config.engine).toBe("locust");
    expect(conflictingProject.suites[0].config.script_path).toBe("tests/wrong.py");
  });

  it("derives fallback config when a project has no suites", () => {
    const cfg = projectConfigForSelection([], "");
    expect(cfg.engine).toBe("locust");
    expect(cfg.script_path).toBe("");
  });
});
