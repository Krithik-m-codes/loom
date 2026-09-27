import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlowchartBuilderView } from "./FlowchartBuilderView";

describe("FlowchartBuilderView", () => {
  it("exports k6 code to the existing runner callback", async () => {
    const user = userEvent.setup();
    const onExportToRunner = vi.fn();

    render(
      <FlowchartBuilderView
        targetHost="http://localhost:8080"
        onExportToRunner={onExportToRunner}
      />,
    );

    await user.click(screen.getByRole("button", { name: "JS (k6)" }));
    await user.click(screen.getByRole("button", { name: "Send to Runner" }));

    expect(onExportToRunner).toHaveBeenCalledWith(
      expect.stringContaining("import http from 'k6/http'"),
      "k6",
    );
  });
});
