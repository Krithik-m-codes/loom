import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo } from "../../types";
import { NewProjectModal } from "./NewProjectModal";

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
  it("submits the existing project shape", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();

    render(
      <NewProjectModal
        isOpen
        onClose={vi.fn()}
        engines={[locust]}
        onCreateProject={onCreateProject}
      />,
    );

    await user.type(screen.getByLabelText("Project name"), "Payments");
    await user.click(screen.getByRole("button", { name: "Create Project" }));

    expect(onCreateProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Payments" }));
    expect(onCreateProject.mock.calls[0][0].suites).toHaveLength(1);
  });
});
