import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { loadProjectState, projectConfigForSelection } from "./projectState";

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

describe("saved project initialization", () => {
  it("starts with no projects or active selection on a fresh install", () => {
    expect(loadProjectState(null, null)).toEqual({ projects: [], persistedProjects: [], activeProjectId: "", shouldPersist: true });
    expect(projectConfigForSelection([], "").script_path).toBe("");
  });

  it("removes only the two exact shipped demo IDs and retains user data deeply", () => {
    const input = [
      { ...userProject, id: "proj-ecommerce" },
      userProject,
      { ...userProject, id: "proj-gateway" },
      otherProject,
    ];
    const result = loadProjectState(JSON.stringify(input), "customer-workspace");

    expect(result.projects).toEqual([userProject, otherProject]);
    expect(result.persistedProjects).toEqual([userProject, otherProject]);
    expect(result.activeProjectId).toBe("customer-workspace");
    expect(result.shouldPersist).toBe(true);
  });

  it.each(["proj-ecommerce", "proj-gateway", "missing-project"])(
    "selects a surviving project when active ID %s is unavailable",
    (activeId) => {
      expect(loadProjectState(JSON.stringify([userProject]), activeId).activeProjectId).toBe("customer-workspace");
    },
  );

  it("does not invent a project when only demos were saved", () => {
    const result = loadProjectState(JSON.stringify([{ ...userProject, id: "proj-ecommerce" }]), "proj-ecommerce");
    expect(result.projects).toEqual([]);
    expect(result.activeProjectId).toBe("");
  });

  it("retains unknown saved values verbatim when migrating demo IDs", () => {
    const futureProject = { id: "future-project", customSchema: { nodes: [1, { id: "a" }] } };
    const malformedValue = "unrecognized legacy value";
    const input = [{ ...userProject, id: "proj-gateway" }, userProject, futureProject, malformedValue];
    const result = loadProjectState(JSON.stringify(input), "proj-gateway");

    expect(result.projects).toEqual([userProject]);
    expect(result.persistedProjects).toEqual([userProject, futureProject, malformedValue]);
    expect(result.shouldPersist).toBe(true);
  });

  it("keeps malformed project records in storage but excludes them from UI selection", () => {
    const invalidProject = { ...userProject, id: "partially-written", suites: [{ id: "broken", config: { target: null } }] };
    const result = loadProjectState(JSON.stringify([invalidProject]), "partially-written");

    expect(result.persistedProjects).toEqual([invalidProject]);
    expect(result.projects).toEqual([]);
    expect(result.activeProjectId).toBe("");
  });

  it("survives corrupt project JSON without replacing it during initialization", () => {
    expect(loadProjectState("{broken", "customer-workspace")).toEqual({ projects: [], persistedProjects: [], activeProjectId: "", shouldPersist: false });
  });

  it("clears a stale script when selecting a project with no suites", () => {
    const config = projectConfigForSelection([otherProject], "another-workspace");
    expect(config.project_name).toBe("Another workspace");
    expect(config.script_path).toBe("");
    expect(config.target.host).toBe("https://api.example.test");
  });
});
