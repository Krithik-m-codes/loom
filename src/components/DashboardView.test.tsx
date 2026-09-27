import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo } from "../types";
import { DashboardView } from "./DashboardView";

vi.mock("../lib/ipc", () => ({ getRunHistory: vi.fn().mockResolvedValue([]) }));

const locust: EngineInfo = {
  id: "locust",
  display_name: "Locust",
  engine_language: "Python",
  license: "MIT",
  license_tier: "Core",
  supported_script_languages: ["Python"],
  availability: { Ready: { version: "2.0" } },
};

describe("DashboardView", () => {
  it("keeps visual-flow navigation on a shared action control", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <DashboardView
        engines={[locust]}
        onNavigate={onNavigate}
        onSelectEngine={vi.fn()}
        targetHost="http://localhost:8080"
        onRerun={vi.fn()}
      />,
    );

    const designFlow = screen.getByRole("button", { name: "Design Visual Flow" });
    expect(designFlow).toHaveClass("loom-button");
    await user.click(designFlow);
    expect(onNavigate).toHaveBeenCalledWith("flowchart");
  });
});
