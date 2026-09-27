import { fireEvent, render, screen } from "@testing-library/react";
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

  it("keeps configured HTTP methods, assertions, and loop nodes in k6 output", async () => {
    const user = userEvent.setup();
    const onExportToRunner = vi.fn();
    render(<FlowchartBuilderView targetHost="http://localhost:8080" onExportToRunner={onExportToRunner} />);

    await user.click(screen.getByRole("button", { name: "Select Homepage Browse" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Method" }), "PUT");
    await user.click(screen.getByRole("button", { name: "Select Verify 200 OK & Latency < 400ms" }));
    await user.click(screen.getByRole("button", { name: "Loop Block Repeat following steps" }));
    await user.click(screen.getByRole("button", { name: "JS (k6)" }));
    await user.click(screen.getByRole("button", { name: "Send to Runner" }));

    const script = onExportToRunner.mock.calls[onExportToRunner.mock.calls.length - 1][0] as string;
    expect(script).toContain('res = http.put(target + "/", "{}"');
    expect(script).toContain("r.timings.duration <= 400");
    expect(script).toContain("for (let iteration = 0; iteration < 3; iteration += 1)");
  });

  it("serializes editable payloads and targets into valid engine source", async () => {
    const user = userEvent.setup();
    const onExportToRunner = vi.fn();
    render(<FlowchartBuilderView targetHost="https://example.test/o'hare" onExportToRunner={onExportToRunner} />);

    await user.click(screen.getByRole("button", { name: "Select User Login Action" }));
    fireEvent.change(screen.getByRole("textbox", { name: "JSON payload" }), { target: { value: '{"enabled": true}' } });
    await user.click(screen.getByRole("button", { name: "Select Verify 200 OK & Latency < 400ms" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Step title" }), { target: { value: 'Verify "quote"' } });
    await user.click(screen.getByRole("button", { name: "JS (k6)" }));
    await user.click(screen.getByRole("button", { name: "Send to Runner" }));

    const k6Script = onExportToRunner.mock.calls[onExportToRunner.mock.calls.length - 1][0] as string;
    expect(k6Script).toContain('const target = __ENV.TARGET_HOST || "https://example.test/o\'hare";');
    expect(k6Script).toContain('"Verify \\"quote\\" status"');

    await user.click(screen.getByRole("button", { name: "Python (Locust)" }));
    await user.click(screen.getByRole("button", { name: "Send to Runner" }));

    const locustScript = onExportToRunner.mock.calls[onExportToRunner.mock.calls.length - 1][0] as string;
    expect(locustScript).toContain("import json");
    expect(locustScript).toContain('json=json.loads("{\\\"enabled\\\": true}")');
    expect(locustScript).toContain('raise AssertionError("Verify \\"quote\\": no preceding HTTP response")');
  });
});
