import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("visual test environment", () => {
  it("renders accessible DOM content", () => {
    render(<button type="button">Run test</button>);

    expect(screen.getByRole("button", { name: "Run test" })).toBeVisible();
  });
});
