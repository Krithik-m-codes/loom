import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunDetailsDrawer } from "./RunDetailsDrawer";
import type { RunRecord } from "../types";

const run: RunRecord = {
  id: "abcdef1234567890",
  engine: "locust",
  project: "Shop",
  config: JSON.stringify({ engine: "locust" }, null, 2),
  started_at: "2026-09-27T00:00:00.000Z",
  finished_at: "2026-09-27T00:01:00.000Z",
  status: "finished",
};

describe("RunDetailsDrawer", () => {
  it("renders nothing when run is null", () => {
    const { container } = render(<RunDetailsDrawer run={null} onClose={vi.fn()} onRerun={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("switches between Summary and Config tabs", () => {
    render(<RunDetailsDrawer run={run} onClose={vi.fn()} onRerun={vi.fn()} />);

    expect(screen.getByText("locust")).toBeVisible();
    expect(screen.queryByText(/"engine": "locust"/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /config/i }));
    expect(screen.getByText(/"engine": "locust"/)).toBeVisible();
  });

  it("calls onRerun with engine and config", () => {
    const onRerun = vi.fn();
    render(<RunDetailsDrawer run={run} onClose={vi.fn()} onRerun={onRerun} />);

    fireEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(onRerun).toHaveBeenCalledWith("locust", run.config);
  });
});
