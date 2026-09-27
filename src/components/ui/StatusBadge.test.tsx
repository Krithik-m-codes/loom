import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("exposes running state with icon and visible label", () => {
    render(<StatusBadge status="running" />);

    expect(screen.getByText("Running")).toBeVisible();
    expect(screen.getByLabelText("Run status: Running")).toHaveAttribute("data-status", "running");
  });
});
