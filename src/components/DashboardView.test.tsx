import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo } from "../types";
import { DashboardView } from "./DashboardView";
import { getRunHistory } from "../lib/ipc";

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

  it("refreshes recent activity when a completed run changes the history revision", async () => {
    vi.mocked(getRunHistory).mockReset();
    vi.mocked(getRunHistory).mockResolvedValue([]);
    const props = { engines: [locust], onNavigate: vi.fn(), onSelectEngine: vi.fn(), targetHost: "https://example.test", onRerun: vi.fn() };
    const { rerender } = render(<DashboardView {...props} refreshRevision={0} />);
    await waitFor(() => expect(getRunHistory).toHaveBeenCalledTimes(1));
    vi.mocked(getRunHistory).mockResolvedValue([{
      id: "fresh-run", engine: "locust", project: "Billing", config: "{}",
      started_at: "2026-09-27T00:00:00.000Z", finished_at: "2026-09-27T00:00:30.000Z", status: "finished",
    }]);

    rerender(<DashboardView {...props} refreshRevision={1} />);
    expect(await screen.findByText("Billing")).toBeVisible();
  });
});
