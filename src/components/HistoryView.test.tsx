import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryView } from "./HistoryView";

vi.mock("../lib/ipc", () => ({ getRunHistory: vi.fn().mockResolvedValue([]) }));

describe("HistoryView", () => {
  it("explains an empty run history with the shared empty state", async () => {
    render(<HistoryView onRerun={vi.fn()} />);

    expect(await screen.findByText("No historical runs found in database.")).toHaveClass("loom-empty-state__description");
  });
});
