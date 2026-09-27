import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectCards } from "./ProjectCards";
import type { EngineInfo, Project } from "../../types";

const engines: EngineInfo[] = [
  {
    id: "locust",
    display_name: "Locust",
    engine_language: "python",
    license: "MIT",
    license_tier: "Core",
    supported_script_languages: ["python"],
    availability: { Ready: { version: "2.0.0" } },
  },
];

const projects: Project[] = [
  {
    id: "proj-1",
    name: "Shop",
    description: "Storefront",
    targetHost: "http://localhost:8080",
    defaultEngine: "locust",
    createdAt: "2026-09-27T00:00:00.000Z",
    suites: [
      {
        id: "suite-1",
        name: "Checkout flow",
        engine: "locust",
        scriptPath: "examples/locust/basic_test.py",
        config: {
          project_name: "Shop",
          engine: "locust",
          script_path: "examples/locust/basic_test.py",
          load_profile: { users: 10, spawn_rate: 2, duration: "60s" },
          target: { host: "http://localhost:8080" },
        },
      },
      {
        id: "suite-2",
        name: "Search flow",
        engine: "locust",
        scriptPath: "examples/locust/search_test.py",
        config: {
          project_name: "Shop",
          engine: "locust",
          script_path: "examples/locust/search_test.py",
          load_profile: { users: 5, spawn_rate: 1, duration: "30s" },
          target: { host: "http://localhost:8080" },
        },
      },
    ],
  },
];

describe("ProjectCards", () => {
  it("renders suite count, run count, and last-run badge per project", () => {
    render(
      <ProjectCards
        projects={projects}
        engines={engines}
        onSelectProject={vi.fn()}
        runCounts={{ "proj-1": 3 }}
        lastStatus={{ "proj-1": "finished" }}
      />,
    );

    expect(screen.getByText("Shop")).toBeVisible();
    expect(screen.getByText(/2 suites/)).toBeVisible();
    expect(screen.getByText(/3 runs/)).toBeVisible();
    expect(screen.getByText("finished")).toBeVisible();
  });

  it("defaults to zero runs and a never-ran badge", () => {
    render(<ProjectCards projects={projects} engines={engines} onSelectProject={vi.fn()} />);

    expect(screen.getByText(/0 runs/)).toBeVisible();
    expect(screen.getByText("never ran")).toBeVisible();
  });

  it("calls onSelectProject with the project id on click", () => {
    const onSelectProject = vi.fn();
    render(<ProjectCards projects={projects} engines={engines} onSelectProject={onSelectProject} />);

    fireEvent.click(screen.getByText("Shop"));
    expect(onSelectProject).toHaveBeenCalledWith("proj-1");
  });
});
