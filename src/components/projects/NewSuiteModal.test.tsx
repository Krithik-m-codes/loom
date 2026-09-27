import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewSuiteModal } from "./NewSuiteModal";

describe("NewSuiteModal", () => {
  it("requires a suite name", () => {
    const onCreate = vi.fn();
    render(<NewSuiteModal isOpen projectId="p1" onClose={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /create suite/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/suite name/i)).toBeTruthy();
  });
});
