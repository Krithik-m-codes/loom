import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo, Project } from "../types";
import { Sidebar } from "./Sidebar";

const longName = "checkout-journey-with-an-intentionally-long-name-that-must-never-force-the-navigation-rail-to-overflow-its-layout-width.py";

const engines: EngineInfo[] = [
  {
    id: "locust",
    display_name: "Locust",
    engine_language: "Python",
    license: "MIT",
    license_tier: "Core",
    supported_script_languages: ["Python"],
    availability: { Ready: { version: "2.0" } },
  },
];

const projects: Project[] = [
  {
    id: "project-1",
    name: `Project ${longName}`,
    description: "Fixture project",
    targetHost: "http://localhost:8080",
    defaultEngine: "locust",
    createdAt: "2026-09-27T00:00:00.000Z",
    suites: [
      {
        id: "suite-1",
        name: longName,
        engine: "locust",
        scriptPath: "examples/locust/basic_test.py",
        config: {
          project_name: "Fixture project",
          engine: "locust",
          script_path: "examples/locust/basic_test.py",
          load_profile: { users: 1, spawn_rate: 1, duration: "1m" },
          target: { host: "http://localhost:8080" },
        },
      },
    ],
  },
];

describe("Sidebar", () => {
  it("keeps long suite labels within the rail and retains dashboard navigation", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <Sidebar
        engines={engines}
        selectedEngineId="locust"
        onSelectEngine={vi.fn()}
        activeTab="runner"
        onSelectTab={onSelectTab}
        onOpenCmdk={vi.fn()}
        isRunning={false}
        selectedScript="examples/locust/basic_test.py"
        onSelectScript={vi.fn()}
        projects={projects}
        activeProjectId="project-1"
        onSelectProject={vi.fn()}
        onOpenNewProject={vi.fn()}
      />,
    );

    expect(screen.getByText(longName)).toHaveClass("loom-truncate");
    await user.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(onSelectTab).toHaveBeenCalledWith("dashboard");
  });
});
