import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteModal } from "./CommandPaletteModal";

describe("CommandPaletteModal", () => {
  it("provides an accessible modal and closes once when Escape is pressed", () => {
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        isOpen
        onClose={onClose}
        onRunTest={vi.fn()}
        onStopTest={vi.fn()}
        isRunning={false}
        onSelectTab={vi.fn()}
        onSelectEngine={vi.fn()}
        onSelectScript={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Quick actions" })).toHaveClass("loom-modal");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
