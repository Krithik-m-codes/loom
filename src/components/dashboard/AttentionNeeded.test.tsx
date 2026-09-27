import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttentionNeeded } from "./AttentionNeeded";
import type { EngineInfo, RunRecord, TestSuite } from "../../types";

const k6Missing: EngineInfo = {
  id: "k6",
  display_name: "k6",
  engine_language: "javascript",
  license: "AGPL-3.0",
  license_tier: "Plugin",
  supported_script_languages: ["javascript"],
  availability: { NotInstalled: { install_hint: "winget install k6" } },
};

const suiteWithoutTarget: TestSuite = {
  id: "suite-1",
  name: "Checkout flow",
  engine: "k6",
  scriptPath: "examples/k6/basic_test.js",
  config: {
    project_name: "Shop",
    engine: "k6",
    script_path: "examples/k6/basic_test.js",
    load_profile: { users: 10, spawn_rate: 2, duration: "60s" },
    target: { host: "" },
  },
};

const failedRun: RunRecord = {
  id: "abcdef1234567890",
  engine: "k6",
  project: "Shop",
  config: "{}",
  started_at: "2026-09-27T00:00:00.000Z",
  finished_at: "2026-09-27T00:01:00.000Z",
  status: "failed",
};

describe("AttentionNeeded", () => {
  it("renders one row per issue across engines, suites, and runs", () => {
    render(
      <AttentionNeeded
        engines={[k6Missing]}
        suites={[suiteWithoutTarget]}
        recentRuns={[failedRun]}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("k6 not installed")).toBeVisible();
    expect(screen.getByText("Suite 'Checkout flow' has no target")).toBeVisible();
    expect(screen.getByText("Run abcdef12 failed")).toBeVisible();
  });

  it("navigates to the right tab per issue row", () => {
    const onNavigate = vi.fn();
    render(
      <AttentionNeeded
        engines={[k6Missing]}
        suites={[suiteWithoutTarget]}
        recentRuns={[failedRun]}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByText("k6 not installed"));
    expect(onNavigate).toHaveBeenCalledWith("engines");

    fireEvent.click(screen.getByText("Suite 'Checkout flow' has no target"));
    expect(onNavigate).toHaveBeenCalledWith("editor");

    fireEvent.click(screen.getByText("Run abcdef12 failed"));
    expect(onNavigate).toHaveBeenCalledWith("history");
  });

  it("renders an All clear state when there is nothing to fix", () => {
    render(<AttentionNeeded engines={[]} suites={[]} recentRuns={[]} onNavigate={vi.fn()} />);

    expect(screen.getByText("All clear")).toBeVisible();
  });
});
