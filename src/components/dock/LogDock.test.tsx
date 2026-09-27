import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogDock } from "./LogDock";
import type { RunLog } from "../../types";

const logs: RunLog[] = [
  { run_id: "run-1", stream: "stdout", message: "GET / 200", timestamp: "2026-09-27T00:00:01.000Z" },
  { run_id: "run-1", stream: "stderr", message: "WARN slow request", timestamp: "2026-09-27T00:00:02.000Z" },
];

describe("LogDock", () => {
  it("is collapsed by default with a visible toggle", () => {
    render(<LogDock logs={logs} isRunning={false} onClearLogs={vi.fn()} />);

    expect(screen.getByRole("button", { name: /log dock/i })).toBeVisible();
    expect(screen.queryByText("GET / 200")).toBeNull();
  });

  it("renders log lines after expanding via the toggle", () => {
    render(<LogDock logs={logs} isRunning={false} onClearLogs={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /log dock/i }));
    expect(screen.getByText("GET / 200")).toBeVisible();
    expect(screen.getByText("WARN slow request")).toBeVisible();
  });

  it("calls onClearLogs when Clear is clicked", () => {
    const onClearLogs = vi.fn();
    render(<LogDock logs={logs} isRunning={false} onClearLogs={onClearLogs} />);

    fireEvent.click(screen.getByRole("button", { name: /log dock/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });
});
