import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplatePickerModal } from "./TemplatePickerModal";

describe("TemplatePickerModal", () => {
  it("lists locust starters", () => {
    render(<TemplatePickerModal isOpen engine="locust" onClose={() => {}} onPick={vi.fn()} />);
    expect(screen.getByText("Basic HTTP GET")).toBeTruthy();
  });

  it("returns null when closed", () => {
    const { container } = render(<TemplatePickerModal isOpen={false} engine="locust" onClose={() => {}} onPick={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
