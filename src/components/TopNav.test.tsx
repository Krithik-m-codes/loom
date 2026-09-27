import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

describe("TopNav", () => {
  it("uses the shared action control without changing the idle run callback", async () => {
    const user = userEvent.setup();
    const onRunTest = vi.fn();

    render(
      <TopNav
        activeTab="dashboard"
        onSelectTab={vi.fn()}
        isRunning={false}
        onRunTest={onRunTest}
        onStopTest={vi.fn()}
        selectedEngineName="Locust"
        targetHost="http://localhost:8080"
        onChangeTargetHost={vi.fn()}
        activeTestName="a-very-long-test-name.py"
      />,
    );

    const runTest = screen.getByRole("button", { name: "Run Test" });
    expect(runTest).toHaveClass("loom-button");
    await user.click(runTest);
    expect(onRunTest).toHaveBeenCalledTimes(1);
  });
});
