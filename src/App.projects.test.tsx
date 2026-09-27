import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "./types";
import { getRunHistory, listEngines } from "./lib/ipc";

const { startRun } = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock("./lib/ipc", () => ({
  listEngines: vi.fn().mockResolvedValue([
    { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } },
    { id: "k6", display_name: "k6", engine_language: "JavaScript", license: "AGPL-3.0", license_tier: "Plugin", supported_script_languages: ["JavaScript"], availability: { Ready: {} } },
  ]),
  startRun,
  stopRun: vi.fn(),
  saveScript: vi.fn(),
  readScript: vi.fn().mockResolvedValue(""),
  getRunHistory: vi.fn().mockResolvedValue([]),
  subscribeToMetrics: vi.fn().mockResolvedValue(() => {}),
  subscribeToLogs: vi.fn().mockResolvedValue(() => {}),
  subscribeToRunStarted: vi.fn().mockResolvedValue(() => {}),
  subscribeToRunFinished: vi.fn().mockResolvedValue(() => {}),
}));

import App from "./App";

const configuredProject: Project = {
  id: "user-configured", name: "Configured Project", description: "", targetHost: "https://configured.test",
  defaultEngine: "locust", createdAt: "2026-01-01T00:00:00.000Z",
  suites: [{ id: "suite-1", name: "Configured Suite", engine: "locust", scriptPath: "tests/configured.py",
    config: { project_name: "Configured Project", engine: "locust", script_path: "tests/configured.py", load_profile: { users: 1, spawn_rate: 1, duration: "30s" }, target: { host: "https://configured.test" } } }],
};
const emptyProject: Project = { ...configuredProject, id: "user-empty", name: "Empty Project", targetHost: "https://empty.test", suites: [] };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("loom_onboarding_completed", "true");
  startRun.mockReset();
  vi.mocked(listEngines).mockClear();
  vi.mocked(getRunHistory).mockReset();
  vi.mocked(getRunHistory).mockResolvedValue([]);
  vi.mocked(listEngines).mockResolvedValue([
    { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } },
    { id: "k6", display_name: "k6", engine_language: "JavaScript", license: "AGPL-3.0", license_tier: "Plugin", supported_script_languages: ["JavaScript"], availability: { Ready: {} } },
  ]);
});

describe("project startup and run gating", () => {
  it("mounts a fresh install with no demo project or runnable script", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("E-Commerce Benchmark")).not.toBeInTheDocument();
    expect(screen.queryByText("API Gateway & Auth Stress")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /New/i }));
    expect(screen.getByRole("dialog", { name: "Create load testing project" })).toBeVisible();
    expect(startRun).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem("loom_projects")).toBe("[]"));
  });

  it("survives invalid saved JSON without launching a demo project", () => {
    localStorage.setItem("loom_projects", "{broken");
    render(<App />);

    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    expect(localStorage.getItem("loom_projects")).toBe("{broken");
  });

  it("clears the active script and disallows run after selecting a project with no suites", async () => {
    const user = userEvent.setup();
    localStorage.setItem("loom_projects", JSON.stringify([configuredProject, emptyProject]));
    localStorage.setItem("loom_active_project_id", configuredProject.id);
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Test" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Configured Project/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Empty Project/ }));
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://empty.test");
    expect(startRun).not.toHaveBeenCalled();
  });

  it("restores the selected suite engine before running a saved project", async () => {
    const user = userEvent.setup();
    const k6Project: Project = { ...configuredProject, defaultEngine: "k6", suites: [{ ...configuredProject.suites[0], engine: "k6", scriptPath: "tests/smoke.js", config: { ...configuredProject.suites[0].config, engine: "k6", script_path: "tests/smoke.js" } }] };
    localStorage.setItem("loom_projects", JSON.stringify([k6Project]));
    localStorage.setItem("loom_active_project_id", k6Project.id);
    startRun.mockResolvedValue("run-1");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Run Test" }));
    await waitFor(() => expect(startRun).toHaveBeenCalledWith("k6", expect.objectContaining({ engine: "k6", script_path: "tests/smoke.js" })));
  });

  it("runs a selected k6 suite with its own target, headers, and profile", async () => {
    const user = userEvent.setup();
    const twoSuiteProject: Project = {
      ...configuredProject,
      suites: [
        { ...configuredProject.suites[0], config: { ...configuredProject.suites[0].config, load_profile: { users: 2, spawn_rate: 1, duration: "20s" }, target: { host: "https://locust.test", headers: { "X-Locust": "yes" } } } },
        { id: "suite-k6", name: "K6 Scenario", engine: "k6", scriptPath: "tests/k6.js",
          config: { project_name: "Configured Project", engine: "locust", script_path: "tests/wrong.py", load_profile: { users: 42, spawn_rate: 7, duration: "3m" }, target: { host: "https://k6.test", headers: { "X-K6": "yes" } } } },
      ],
    };
    localStorage.setItem("loom_projects", JSON.stringify([twoSuiteProject]));
    localStorage.setItem("loom_active_project_id", twoSuiteProject.id);
    startRun.mockResolvedValue("run-k6");
    render(<App />);

    expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://locust.test");
    await user.click(screen.getByRole("button", { name: /K6 Scenario/ }));
    expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://k6.test");
    await user.click(screen.getAllByRole("button", { name: "Run Test" })[0]);

    await waitFor(() => expect(startRun).toHaveBeenCalledExactlyOnceWith("k6", {
      project_name: "Configured Project",
      engine: "k6",
      script_path: "tests/k6.js",
      load_profile: { users: 42, spawn_rate: 7, duration: "3m" },
      target: { host: "https://k6.test", headers: { "X-K6": "yes" } },
    }));
  });

  it("loads the matching suite's complete config when switching engines", async () => {
    const user = userEvent.setup();
    const k6Suite = { id: "suite-k6", name: "K6 Scenario", engine: "k6", scriptPath: "tests/k6.js",
      config: { project_name: "Configured Project", engine: "k6", script_path: "tests/k6.js", load_profile: { users: 32, spawn_rate: 4, duration: "2m" }, target: { host: "https://k6.test", headers: { "X-K6": "yes" } } } };
    localStorage.setItem("loom_projects", JSON.stringify([{ ...configuredProject, suites: [configuredProject.suites[0], k6Suite] }]));
    localStorage.setItem("loom_active_project_id", configuredProject.id);
    startRun.mockResolvedValue("run-k6");
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /k6.*Plugin/i }));
    expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://k6.test");
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    await waitFor(() => expect(startRun).toHaveBeenCalledExactlyOnceWith("k6", {
      project_name: "Configured Project", engine: "k6", script_path: "tests/k6.js",
      load_profile: { users: 32, spawn_rate: 4, duration: "2m" },
      target: { host: "https://k6.test", headers: { "X-K6": "yes" } },
    }));
  });

  it("blocks a history run whose selected engine conflicts with its config", async () => {
    const user = userEvent.setup();
    localStorage.setItem("loom_projects", JSON.stringify([configuredProject]));
    localStorage.setItem("loom_active_project_id", configuredProject.id);
    vi.mocked(getRunHistory).mockResolvedValue([{
      id: "run-mismatch", engine: "k6", project: "Configured Project",
      config: JSON.stringify(configuredProject.suites[0].config),
      started_at: "2026-01-01T00:00:00.000Z", status: "finished",
    }]);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Run history" }));
    await user.click(await screen.findByRole("button", { name: "Re-run" }));
    expect(screen.getAllByRole("button", { name: "Run Test" })[0]).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Run Test" })[0]);
    expect(startRun).not.toHaveBeenCalled();
  });

  it("keeps unknown saved records after migrating demos and creating a project", async () => {
    const user = userEvent.setup();
    const unknownRecord = { id: "future-project", customSchema: { nodes: [1, 2] } };
    localStorage.setItem("loom_projects", JSON.stringify([{ ...configuredProject, id: "proj-ecommerce" }, unknownRecord]));
    localStorage.setItem("loom_active_project_id", "proj-ecommerce");
    render(<App />);

    await waitFor(() => expect(JSON.parse(localStorage.getItem("loom_projects") ?? "[]")).toEqual([unknownRecord]));
    await user.click(screen.getByRole("button", { name: /New/i }));
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Created workspace");
    await user.click(screen.getByRole("button", { name: "Create Project" }));

    expect(JSON.parse(localStorage.getItem("loom_projects") ?? "[]")).toEqual([
      expect.objectContaining({ name: "Created workspace" }), unknownRecord,
    ]);
  });

  it("does not run a saved k6 script through a different installed engine", async () => {
    const user = userEvent.setup();
    const k6Project: Project = { ...configuredProject, defaultEngine: "k6", suites: [{ ...configuredProject.suites[0], engine: "k6", scriptPath: "tests/smoke.js", config: { ...configuredProject.suites[0].config, engine: "k6", script_path: "tests/smoke.js" } }] };
    localStorage.setItem("loom_projects", JSON.stringify([k6Project]));
    localStorage.setItem("loom_active_project_id", k6Project.id);
    vi.mocked(listEngines).mockResolvedValue([{ id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } }]);
    render(<App />);

    await waitFor(() => expect(listEngines).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    expect(startRun).not.toHaveBeenCalled();
  });

  it("keeps a script draft mounted while switching workspace tabs and closes inactive tabs", async () => {
    const user = userEvent.setup();
    localStorage.setItem("loom_projects", JSON.stringify([configuredProject]));
    localStorage.setItem("loom_active_project_id", configuredProject.id);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Script editor" }));
    const source = screen.getByRole("textbox", { name: "Script source" });
    await user.type(source, "draft content");
    expect(source).toHaveValue("draft content");

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(screen.getByRole("tab", { name: "Script editor" }));
    expect(screen.getByRole("textbox", { name: "Script source" })).toHaveValue("draft content");
    await user.click(screen.getByRole("button", { name: "Script editor" }));
    expect(screen.getAllByRole("tab", { name: "Script editor" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Close Script editor tab" }));
    expect(screen.queryByRole("tab", { name: "Script editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("closes narrow workspace navigation with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggle = screen.getByRole("button", { name: "Toggle workspace navigation" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
