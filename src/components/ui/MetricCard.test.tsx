import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("keeps its value and semantic delta legible", () => {
    render(<MetricCard label="Requests/sec" value="1,240" delta={{ label: "+28%", tone: "positive" }} />);

    expect(screen.getByText("1,240")).toHaveClass("loom-metric-card__value");
    expect(screen.getByText("+28%")).toHaveClass("loom-delta--positive");
  });
});
