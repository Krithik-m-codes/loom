import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo } from "../../types";
import { createProject } from "../../lib/ipc";
import { NewProjectModal } from "./NewProjectModal";

vi.mock("../../lib/ipc", () => ({ createProject: vi.fn() }));

const locust: EngineInfo = {
  id: "locust",
  display_name: "Locust",
  engine_language: "Python",
  license: "MIT",
  license_tier: "Core",
  supported_script_languages: ["Python"],
  availability: { Ready: { version: "2.0" } },
};

describe("NewProjectModal", () => {
  it("submits a new project through the IPC layer starting with no suites", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    const onClose = vi.fn();
    vi.mocked(createProject).mockResolvedValue({
      id: "proj-1",
      name: "Payments",
      description: "",
      targetHost: "http://localhost:8080",
      defaultEngine: "locust",
      createdAt: "2026-09-27T00:00:00.000Z",
      suites: [],
    });

    render(
      <NewProjectModal
        isOpen
        onClose={onClose}
        engines={[locust]}
        onCreateProject={onCreateProject}
      />,
    );

    await user.type(screen.getByLabelText("Project name"), "Payments");
    await user.type(screen.getByLabelText(/^Project description/), "Payment flow load testing");
    await user.click(screen.getByRole("button", { name: "Create Project" }));

    expect(createProject).toHaveBeenCalledWith("Payments", "http://localhost:8080", "locust", "Payment flow load testing");
    await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Payments", suites: [] }),
    ));
    expect(onCreateProject.mock.calls[0][0].suites).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });
});
