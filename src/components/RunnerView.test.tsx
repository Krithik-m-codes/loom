import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EngineInfo, NormalizedMetric, TestConfig } from "../types";
import { RunnerView } from "./RunnerView";

const engine: EngineInfo = {
  id: "locust",
  display_name: "Locust",
  engine_language: "Python",
  license: "MIT",
  license_tier: "Core",
  supported_script_languages: ["Python"],
  availability: { Ready: { version: "2.0" } },
};

const config: TestConfig = {
  project_name: "Billing",
  engine: "locust",
  script_path: "examples/locust/basic_test.py",
  load_profile: { users: 10, spawn_rate: 2, duration: "30s" },
  target: { host: "http://localhost:8080" },
};

const createProps = (overrides = {}) => ({
  engines: [engine],
  selectedEngineId: "locust",
  onSelectEngine: vi.fn(),
  config,
  onChangeConfig: vi.fn(),
  isRunning: false,
  onRunTest: vi.fn(),
  onStopTest: vi.fn(),
  metrics: [] as NormalizedMetric[],
  logs: [],
  onClearLogs: vi.fn(),
  ...overrides,
});

describe("RunnerView", () => {
  it("keeps run and stop callbacks on shared action controls", async () => {
    const user = userEvent.setup();
    const props = createProps();
    const { rerender } = render(<RunnerView {...props} />);

    const runTest = screen.getByRole("button", { name: "Run Test" });
    expect(runTest).toHaveClass("loom-button");
    await user.click(runTest);
    expect(props.onRunTest).toHaveBeenCalledTimes(1);

    rerender(<RunnerView {...props} isRunning />);
    await user.click(screen.getByRole("button", { name: /Stop Test/ }));
    expect(props.onStopTest).toHaveBeenCalledTimes(1);
  });

  it("labels request telemetry and exposes the latest RPS value", () => {
    const metrics: NormalizedMetric[] = [{
      timestamp: "2026-09-27T00:00:00Z",
      engine: "locust",
      run_id: "run-1",
      metric: "RequestsPerSecond",
      value: 42,
      labels: {},
    }];

    render(<RunnerView {...createProps({ metrics })} />);

    expect(screen.getByRole("region", { name: "Requests/sec" })).toBeVisible();
    expect(screen.getByText("42")).toBeVisible();
  });

  it("keeps log clearing available from the existing log view", async () => {
    const user = userEvent.setup();
    const props = createProps({ logs: [{ run_id: "run-1", stream: "stdout" as const, message: "ready", timestamp: "2026-09-27T00:00:00Z" }] });
    render(<RunnerView {...props} />);

    await user.click(screen.getByRole("button", { name: "Logs" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClearLogs).toHaveBeenCalledTimes(1);
  });
});
