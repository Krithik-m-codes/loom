import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryView } from "./HistoryView";
import { getRunHistory } from "../lib/ipc";
import type { RunRecord } from "../types";

vi.mock("../lib/ipc", () => ({ getRunHistory: vi.fn().mockResolvedValue([]) }));

describe("HistoryView", () => {
  it("explains an empty run history with the shared empty state", async () => {
    render(<HistoryView onRerun={vi.fn()} />);

    expect(await screen.findByText("No historical runs found in database.")).toHaveClass("loom-empty-state__description");
  });

  it("keeps completed-run results when an older history request resolves late", async () => {
    let finishOldRequest: ((runs: RunRecord[]) => void) | undefined;
    vi.mocked(getRunHistory).mockReset();
    vi.mocked(getRunHistory)
      .mockImplementationOnce(() => new Promise<RunRecord[]>((resolve) => { finishOldRequest = resolve; }))
      .mockResolvedValueOnce([{
        id: "completed-run", engine: "locust", project: "Billing", config: "{}",
        started_at: "2026-09-27T00:00:00.000Z", finished_at: "2026-09-27T00:00:30.000Z", status: "finished",
      }]);
    const { rerender } = render(<HistoryView onRerun={vi.fn()} refreshRevision={0} />);
    rerender(<HistoryView onRerun={vi.fn()} refreshRevision={1} />);
    expect(await screen.findByText(/complete/)).toBeVisible();
    await act(async () => finishOldRequest?.([]));
    expect(screen.getByText(/complete/)).toBeVisible();
  });
});
