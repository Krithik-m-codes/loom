import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoomLogo } from "./LoomLogo";

describe("LoomLogo", () => {
  it("renders the supplied mark as an accessible icon lockup", () => {
    render(<LoomLogo size={32} variant="icon" />);
    expect(screen.getByRole("img", { name: "Loom" })).toHaveAttribute("src", "/loom-logo-mark.png");
    expect(screen.queryByText("Loom")).not.toBeInTheDocument();
  });

  it("renders a horizontal wordmark without announcing the decorative mark twice", () => {
    const { container } = render(<LoomLogo size={32} variant="horizontal" />);
    expect(screen.getByText("Loom")).toBeVisible();
    expect(container.firstChild).toHaveClass("loom-logo--horizontal");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("supports the stacked brand lockup", () => {
    const { container } = render(<LoomLogo size={32} variant="stacked" />);
    expect(container.firstChild).toHaveClass("loom-logo--stacked");
    expect(screen.getByText("Loom")).toBeVisible();
  });
});
