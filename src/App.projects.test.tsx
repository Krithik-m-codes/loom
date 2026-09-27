import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "./types";
import { getRunHistory, getSuite, listEngines, listProjects, listSuites, subscribeToRunFinished } from "./lib/ipc";

const { startRun } = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock("./lib/ipc", () => ({
  listEngines: vi.fn().mockResolvedValue([
    { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } },
    { id: "k6", display_name: "k6", engine_language: "JavaScript", license: "AGPL-3.0", license_tier: "Plugin", supported_script_languages: ["JavaScript"], availability: { Ready: {} } },
  ]),
  listProjects: vi.fn().mockResolvedValue([]),
  listSuites: vi.fn().mockResolvedValue([]),
  startRun,
  stopRun: vi.fn(),
  saveScript: vi.fn(),
  readScript: vi.fn().mockResolvedValue(""),
  getSuite: vi.fn(),
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

// Seed the SQLite-backed project store: listProjects returns the rows,
// listSuites returns each project's suites, mirroring the Task 3 IPC layer.
const seedProjects = (seed: Project[]) => {
  vi.mocked(listProjects).mockResolvedValue(seed);
  vi.mocked(listSuites).mockImplementation(async (projectId: string) =>
    seed.find((project) => project.id === projectId)?.suites ?? [],
  );
};

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  localStorage.clear();
  localStorage.setItem("loom_onboarding_completed", "true");
  startRun.mockReset();
  vi.mocked(listEngines).mockClear();
  vi.mocked(listProjects).mockReset();
  vi.mocked(listProjects).mockResolvedValue([]);
  vi.mocked(listSuites).mockReset();
  vi.mocked(listSuites).mockResolvedValue([]);
  vi.mocked(getSuite).mockReset();
  vi.mocked(getRunHistory).mockReset();
  vi.mocked(getRunHistory).mockResolvedValue([]);
  vi.mocked(subscribeToRunFinished).mockReset();
  vi.mocked(subscribeToRunFinished).mockResolvedValue(() => {});
  vi.mocked(listEngines).mockResolvedValue([
    { id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } },
    { id: "k6", display_name: "k6", engine_language: "JavaScript", license: "AGPL-3.0", license_tier: "Plugin", supported_script_languages: ["JavaScript"], availability: { Ready: {} } },
  ]);
});

describe("project startup and run gating", () => {
  it("mounts a fresh install with no demo project or runnable script", async () => {
    const user = userEvent.setup();
    seedProjects([]);
    render(<App />);

    await waitFor(() => expect(vi.mocked(listProjects)).toHaveBeenCalled());
    expect(screen.queryByText("E-Commerce Benchmark")).not.toBeInTheDocument();
    expect(screen.queryByText("API Gateway & Auth Stress")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /New/i }));
    expect(screen.getByRole("dialog", { name: "Create load testing project" })).toBeVisible();
    expect(startRun).not.toHaveBeenCalled();
    expect(localStorage.getItem("loom_projects")).toBeNull();
  });

  it("survives a project-store failure without launching a demo project", async () => {
    vi.mocked(listProjects).mockRejectedValueOnce(new Error("sqlite unavailable"));
    render(<App />);

    await waitFor(() => expect(vi.mocked(listProjects)).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    expect(screen.queryByText("E-Commerce Benchmark")).not.toBeInTheDocument();
    expect(localStorage.getItem("loom_projects")).toBeNull();
  });

  it("clears the active script and disallows run after selecting a project with no suites", async () => {
    const user = userEvent.setup();
    seedProjects([configuredProject, emptyProject]);
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Test" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Configured Project/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Empty Project/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled());
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://empty.test"));
    expect(startRun).not.toHaveBeenCalled();
  });

  it("restores the selected suite engine before running a saved project", async () => {
    const user = userEvent.setup();
    const k6Project: Project = { ...configuredProject, defaultEngine: "k6", suites: [{ ...configuredProject.suites[0], engine: "k6", scriptPath: "tests/smoke.js", config: { ...configuredProject.suites[0].config, engine: "k6", script_path: "tests/smoke.js" } }] };
    seedProjects([k6Project]);
    startRun.mockResolvedValue("run-1");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Test" })).toBeEnabled());
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
    localStorage.setItem("loom_onboarding_completed", "true");
    seedProjects([twoSuiteProject]);
    startRun.mockResolvedValue("run-k6");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://locust.test"));
    await user.click(screen.getByRole("button", { name: /K6 Scenario/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://k6.test"));
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
    seedProjects([{ ...configuredProject, suites: [configuredProject.suites[0], k6Suite] }]);
    startRun.mockResolvedValue("run-k6");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://configured.test"));
    await user.click(await screen.findByRole("button", { name: /k6.*Plugin/i }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Target host" })).toHaveValue("https://k6.test"));
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    await waitFor(() => expect(startRun).toHaveBeenCalledExactlyOnceWith("k6", {
      project_name: "Configured Project", engine: "k6", script_path: "tests/k6.js",
      load_profile: { users: 32, spawn_rate: 4, duration: "2m" },
      target: { host: "https://k6.test", headers: { "X-K6": "yes" } },
    }));
  });

  it("blocks a history run whose selected engine conflicts with its config", async () => {
    const user = userEvent.setup();
    seedProjects([configuredProject]);
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

  it("creates a project from the modal and selects it in a fresh database", async () => {
    const user = userEvent.setup();
    seedProjects([]);
    render(<App />);

    await waitFor(() => expect(vi.mocked(listProjects)).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /New/i }));
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Created workspace");
    await user.click(screen.getByRole("button", { name: "Create Project" }));

    expect(screen.queryByRole("dialog", { name: "Create load testing project" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Created workspace/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Run Test" })).toBeEnabled();
  });

  it("does not run a saved k6 script through a different installed engine", async () => {
    const user = userEvent.setup();
    const k6Project: Project = { ...configuredProject, defaultEngine: "k6", suites: [{ ...configuredProject.suites[0], engine: "k6", scriptPath: "tests/smoke.js", config: { ...configuredProject.suites[0].config, engine: "k6", script_path: "tests/smoke.js" } }] };
    seedProjects([k6Project]);
    vi.mocked(listEngines).mockResolvedValue([{ id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT", license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} } }]);
    render(<App />);

    await waitFor(() => expect(listEngines).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Run Test" }));
    expect(startRun).not.toHaveBeenCalled();
  });

  it("keeps a script draft mounted while switching workspace tabs and closes inactive tabs", async () => {
    const user = userEvent.setup();
    seedProjects([configuredProject]);
    vi.mocked(getSuite).mockResolvedValue({
      ...configuredProject.suites[0],
      projectId: configuredProject.id,
      scriptContent: "print('draft content')",
      visualNodes: undefined,
    });
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Test" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Configured Suite/ }));
    await user.click(screen.getByRole("button", { name: "Script editor" }));
    await user.click(await screen.findByRole("tab", { name: "Code" }));
    expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(screen.getByRole("tab", { name: "Script editor" }));
    expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Script editor" }));
    expect(screen.getAllByRole("tab", { name: "Script editor" })).toHaveLength(1);

    // Selecting the suite also opened the runner tab, so close it first to
    // restore the original single-editor-tab close scenario.
    await user.click(screen.getByRole("button", { name: "Close configured.py tab" }));
    expect(screen.queryByRole("tab", { name: "configured.py" })).not.toBeInTheDocument();
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

  it("traps mobile drawer focus, isolates background controls, and restores the toggle", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    const user = userEvent.setup();
    render(<App />);

    const toggle = screen.getByRole("button", { name: "Toggle workspace navigation" });
    toggle.focus();
    await user.keyboard("{Enter}");
    const drawer = screen.getByRole("dialog", { name: "Workspace navigation" });
    const first = within(drawer).getByRole("button", { name: "New project" });
    const last = within(drawer).getByRole("button", { name: "Engine configuration" });
    expect(first).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Overview", hidden: true }).closest(".loom-workspace")).toHaveAttribute("inert");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(last).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(first).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("refreshes mounted History after a run finishes without discarding its tab", async () => {
    const user = userEvent.setup();
    seedProjects([configuredProject]);
    let finishRun: ((payload: { run_id: string; status: string }) => void) | undefined;
    vi.mocked(subscribeToRunFinished).mockImplementation(async (callback) => {
      finishRun = callback;
      return () => {};
    });
    render(<App />);
    await waitFor(() => expect(finishRun).toBeTypeOf("function"));

    await user.click(screen.getByRole("button", { name: "Run history" }));
    expect(await screen.findByText("No historical runs found in database.")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    vi.mocked(getRunHistory).mockResolvedValue([{
      id: "run-new", engine: "locust", project: "Configured Project", config: JSON.stringify(configuredProject.suites[0].config),
      started_at: "2026-09-27T00:00:00.000Z", finished_at: "2026-09-27T00:00:30.000Z", status: "finished",
    }]);
    act(() => finishRun?.({ run_id: "run-new", status: "finished" }));
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText(/run-new/)).toBeVisible();
    expect(screen.getAllByRole("tab", { name: "History" })).toHaveLength(1);
  });
});
