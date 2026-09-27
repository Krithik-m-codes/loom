import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoomLogo } from "./LoomLogo";

describe("LoomLogo", () => {
  it("uses the supplied mark and adds text only when requested", () => {
    const { rerender } = render(<LoomLogo size={32} />);

    expect(screen.getByRole("img", { name: "Loom" })).toHaveAttribute("src", "/logo-icon.png");
    expect(screen.queryByText("Loom")).not.toBeInTheDocument();

    rerender(<LoomLogo size={32} showText />);
    expect(screen.getByText("Loom")).toBeVisible();
  });
});
