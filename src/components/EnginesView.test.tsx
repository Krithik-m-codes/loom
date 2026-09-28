import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnginesView } from "./EnginesView";

describe("EnginesView", () => {
  it("explains an empty engine list", () => {
    render(<EnginesView engines={[]} onManageRuntimes={() => {}} />);

    expect(screen.getByText("No engines detected")).toBeVisible();
  });
});
