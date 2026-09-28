import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScenarioStudio } from "./ScenarioStudio";
import type { EngineAdapterMetadata, ScenarioDocument, ScenarioNode } from "../../lib/scenario/types";

const adapters: EngineAdapterMetadata[] = [
  { id: "locust", displayName: "Locust", licenseTier: "core", sourceKinds: ["python"], configKinds: ["toml"], compatibleNodeKinds: ["request", "wait", "native", "loop"] },
  { id: "goose", displayName: "Goose", licenseTier: "core", sourceKinds: ["rust"], configKinds: ["toml"], compatibleNodeKinds: ["request", "wait", "native", "loop"] },
  { id: "k6", displayName: "k6", licenseTier: "plugin", sourceKinds: ["javascript"], configKinds: ["json"], compatibleNodeKinds: ["request", "wait", "check", "group", "loop", "native"] },
];

const document: ScenarioDocument = {
  schemaVersion: 1,
  engineId: "k6",
  projectId: "project-1",
  suiteId: "suite-1",
  sources: [{ id: "source-1", fileName: "loadtest.js", language: "javascript", content: "export default function () { http.get('/health') }" }],
  nodes: [
    { id: "get-health", engineIds: ["k6"], kind: "request", method: "GET", url: "/health", span: { fileId: "source-1", startOffset: 33, endOffset: 51 } },
    { id: "check-health", engineIds: ["k6"], kind: "check", expression: "response.status === 200" },
    { id: "opaque-1", engineIds: ["k6"], kind: "native", reason: "Dynamic JavaScript is kept as source", span: { fileId: "source-1", startOffset: 0, endOffset: 52 } },
  ],
  configFiles: [{ id: "config-1", fileName: "options.json", format: "json", content: "{\"vus\": 5, \"thresholds\": {}}" }],
};

describe("ScenarioStudio", () => {
  it("shows imported nodes, opaque source, config files, and all engine previews", () => {
    render(<ScenarioStudio document={document} adapters={adapters} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Select GET /health" })).toBeTruthy();
    expect(screen.getByText(/Dynamic JavaScript is kept as source/)).toBeTruthy();
    expect(screen.getByText("options.json")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Locust" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Goose" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "k6" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select Native code" }));
    expect(screen.getByText(/export default function/)).toBeTruthy();
  });

  it("edits a selected request without replacing its source span", () => {
    const onChange = vi.fn();
    render(<ScenarioStudio document={document} adapters={adapters} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Select GET /health" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), { target: { value: "/ready" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "get-health", url: "/ready", span: document.nodes[0].span })]),
    }));
  });

  it("adds a node and supports keyboard reordering with a live announcement", () => {
    const onChange = vi.fn();
    const graphOnlyNodes: ScenarioNode[] = [
      { id: "get-health", engineIds: ["k6"], kind: "request", method: "GET", url: "/health" },
      { id: "check-health", engineIds: ["k6"], kind: "check", expression: "response.status === 200" },
    ];
    render(<ScenarioStudio document={{ ...document, nodes: graphOnlyNodes }} adapters={adapters} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Wait" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ kind: "wait" })]) }));
    fireEvent.click(screen.getByRole("button", { name: "Move down GET /health" }));
    expect(screen.getByText(/Moved GET \/health/).textContent).toMatch(/moved/i);
  });

  it("prevents reordering imported statements when the generator must preserve original source order", () => {
    render(<ScenarioStudio document={document} adapters={adapters} onChange={vi.fn()} />);
    expect(screen.getByText(/Source-backed statements keep their original order/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Move down GET /health" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders unsupported node kinds as a visible compatibility warning", () => {
    render(<ScenarioStudio document={document} adapters={adapters} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Goose" }));
    expect(screen.getByText(/not supported by Goose/i)).toBeTruthy();
  });

  it("lets palette steps become children of selected groups and edits nested steps", () => {
    const onChange = vi.fn();
    const grouped = {
      ...document,
      nodes: [{ id: "group-1", engineIds: ["k6"], kind: "group" as const, label: "Checkout", children: [document.nodes[0]] }],
    };
    render(<ScenarioStudio document={grouped} adapters={adapters} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Select Group Checkout" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Wait" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: [expect.objectContaining({ children: expect.arrayContaining([expect.objectContaining({ kind: "wait" })]) })],
    }));
    fireEvent.click(screen.getByRole("button", { name: "Select GET /health" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), { target: { value: "/checkout" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: [expect.objectContaining({ children: expect.arrayContaining([expect.objectContaining({ url: "/checkout" })]) })],
    }));
  });

  it("requires an explicit confirmation before applying generated engine files", async () => {
    const user = userEvent.setup();
    const onSaveBundle = vi.fn();
    const onGenerateBundle = vi.fn(async () => ({
      engineId: "k6",
      files: [{ path: "loadtest.js", content: "export default function () {}", role: "script" as const }],
      diagnostics: [],
    }));
    render(<ScenarioStudio document={document} adapters={adapters} onChange={vi.fn()} onGenerateBundle={onGenerateBundle} onSaveBundle={onSaveBundle} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("loadtest.js")).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Apply generated bundle" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /reviewed the generated files/i }));
    await user.click(apply);
    expect(onSaveBundle).toHaveBeenCalledWith(expect.objectContaining({ engineId: "k6" }));
  });

  it("parses and retains engine config files with their diagnostics", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onParseConfig = vi.fn(async (_engineId: string, source: ScenarioDocument["configFiles"][number]) => ({
      source,
      recognized: { vus: 5 },
      diagnostics: [{ code: "CONFIG_UNKNOWN_KEY", severity: "warning" as const, message: "Unknown key: custom_option" }],
    }));
    render(<ScenarioStudio document={{ ...document, configFiles: [] }} adapters={adapters} onChange={onChange} onParseConfig={onParseConfig} />);
    await user.click(screen.getByRole("button", { name: "Attach config file" }));
    await user.type(screen.getByRole("textbox", { name: "Config file name" }), "options.json");
    fireEvent.change(screen.getByRole("textbox", { name: "Config contents" }), { target: { value: "{\"vus\":5,\"custom_option\":true}" } });
    await user.click(screen.getByRole("button", { name: "Parse and attach config" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ configFiles: [expect.objectContaining({ fileName: "options.json", format: "json" })] }));
    expect(await screen.findByText("Unknown key: custom_option")).toBeTruthy();
  });

  it("keeps a thousand-node flow responsive by rendering a bounded first slice", () => {
    const largeDocument = {
      ...document,
      nodes: Array.from({ length: 1000 }, (_, index) => ({
        id: `wait-${index}`, engineIds: ["k6"], kind: "wait" as const, seconds: 1,
      })),
    };
    render(<ScenarioStudio document={largeDocument} adapters={adapters} onChange={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^Select Wait 1s$/ })).toHaveLength(60);
    expect(screen.getByRole("button", { name: /Show next 60 steps · 940 remaining/ })).toBeTruthy();
  });
});
