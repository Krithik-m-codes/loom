import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelemetryPanel } from "./TelemetryPanel";

describe("TelemetryPanel", () => {
  it("labels telemetry content for assistive technology", () => {
    render(<TelemetryPanel title="Requests/sec"><svg aria-label="Request rate chart" /></TelemetryPanel>);
    expect(screen.getByRole("region", { name: "Requests/sec" })).toBeVisible();
  });
});
