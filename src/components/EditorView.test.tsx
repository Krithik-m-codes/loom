import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditorView } from "./EditorView";

const { getSuite, listScenarioAdapters, parseScenarioSource, parseEngineConfig, generateScenarioBundle, updateSuite, persistScenarioBundle } = vi.hoisted(() => ({
  getSuite: vi.fn(),
  listScenarioAdapters: vi.fn(),
  parseScenarioSource: vi.fn(),
  parseEngineConfig: vi.fn(),
  generateScenarioBundle: vi.fn(),
  updateSuite: vi.fn(),
  persistScenarioBundle: vi.fn(),
}));

vi.mock("../lib/ipc", () => ({ getSuite, listScenarioAdapters, parseScenarioSource, parseEngineConfig, generateScenarioBundle, updateSuite, persistScenarioBundle }));
vi.mock("./ui/MonacoEditor", () => ({
  MonacoEditor: ({ value }: any) => <textarea aria-label="code-tab" value={value} readOnly />,
  monacoLanguageForEngine: () => "python",
}));
describe("EditorView", () => {
  beforeEach(() => {
    getSuite.mockResolvedValue({ id: "s1", projectId: "p1", engine: "locust", scriptContent: "from locust import HttpUser\nclass User(HttpUser):\n    @task\n    def run(self):\n        self.client.get('/ready')\n", config: { project_name: "project", engine: "locust", script_path: "a.py", load_profile: { users: 1, spawn_rate: 1, duration: "30s" }, target: { host: "http://localhost" } }, visualNodes: null });
    listScenarioAdapters.mockResolvedValue([
      { id: "locust", displayName: "Locust", licenseTier: "core", sourceKinds: ["python"], configKinds: [], compatibleNodeKinds: ["request", "wait", "loop", "native"] },
      { id: "goose", displayName: "Goose", licenseTier: "core", sourceKinds: ["rust"], configKinds: [], compatibleNodeKinds: ["request", "wait", "loop", "native"] },
      { id: "k6", displayName: "k6", licenseTier: "plugin", sourceKinds: ["javascript"], configKinds: [], compatibleNodeKinds: ["request", "wait", "check", "group", "loop", "native"] },
    ]);
    parseScenarioSource.mockResolvedValue({
      source: { id: "source-s1", fileName: "a.py", language: "python", content: "from locust import HttpUser" },
      nodes: [{ id: "ready", engineIds: ["locust"], kind: "request", method: "GET", url: "/ready", span: { fileId: "source-s1", startOffset: 0, endOffset: 1 } }],
      diagnostics: [], coveredRanges: [], supportPercent: 100,
    });
    parseEngineConfig.mockImplementation(async (_engineId: string, source: unknown) => ({ source, recognized: {}, diagnostics: [] }));
    generateScenarioBundle.mockResolvedValue({ engineId: "locust", files: [], diagnostics: [] });
    updateSuite.mockResolvedValue({ id: "s1", name: "Suite" });
    persistScenarioBundle.mockResolvedValue({ configPath: "C:/loom/suites/s1/locust.conf" });
  });

  it("switches between visual and code tabs", async () => {
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={() => {}} />);
    expect(await screen.findByRole("button", { name: "Visualize current source" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /code/i }));
    expect(screen.getByLabelText("code-tab")).toBeTruthy();
  });

  it("parses the active suite source through Tauri into a visible scenario flow", async () => {
    const onRunTest = vi.fn();
    const onRunBlockedChange = vi.fn();
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={onRunTest} onRunBlockedChange={onRunBlockedChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "Visualize current source" }));
    expect(await screen.findByRole("button", { name: "Select GET /ready" })).toBeTruthy();
    expect(parseScenarioSource).toHaveBeenCalledWith("locust", expect.objectContaining({ fileName: "a.py", language: "python" }), expect.objectContaining({ projectId: "p1", suiteId: "s1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Wait" }));
    await waitFor(() => expect(onRunBlockedChange).toHaveBeenLastCalledWith(expect.stringContaining("Visual or config edits")));
    fireEvent.click(screen.getAllByRole("button", { name: "Run" })[0]);
    expect(onRunTest).not.toHaveBeenCalled();
    expect(screen.getByText(/Visual or config edits are not in the runnable script yet/)).toBeTruthy();
  });

  it("analyzes code without executing it and lists source diagnostics", async () => {
    parseScenarioSource.mockResolvedValueOnce({
      source: { id: "source-s1", fileName: "a.py", language: "python", content: "broken" },
      nodes: [],
      diagnostics: [{ code: "PYTHON_SYNTAX", severity: "error", message: "Expected an indented block", span: { fileId: "source-s1", startOffset: 0, endOffset: 6 } }],
      coveredRanges: [],
      supportPercent: 0,
    });
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /code/i }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze source" }));

    expect(await screen.findByRole("region", { name: "Source diagnostics" })).toBeTruthy();
    expect(screen.getByText("Expected an indented block")).toBeTruthy();
    expect(screen.getByText("0% mapped to visual steps")).toBeTruthy();
    expect(parseScenarioSource).toHaveBeenCalledWith("locust", expect.objectContaining({ content: expect.any(String) }), expect.objectContaining({ projectId: "p1", suiteId: "s1" }));
  });

  it("persists generated sidecars and stores the config path before allowing the suite to run", async () => {
    generateScenarioBundle.mockResolvedValue({ engineId: "locust", files: [
      { path: "locustfile.py", content: "from locust import HttpUser", role: "script" },
      { path: "locust.conf", content: "users=4", role: "config" },
    ], diagnostics: [] });
    persistScenarioBundle.mockResolvedValue({ configPath: "C:/loom/suites/s1/locust.conf" });
    const onRunTest = vi.fn();
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={onRunTest} />);
    fireEvent.click(await screen.findByRole("button", { name: "Visualize current source" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Preview$/ }));
    fireEvent.click(await screen.findByLabelText("I reviewed the generated files and want to apply them."));
    fireEvent.click(screen.getByRole("button", { name: "Apply generated bundle" }));
    await waitFor(() => expect(persistScenarioBundle).toHaveBeenCalledWith("s1", expect.objectContaining({ engineId: "locust" })));
    fireEvent.click(screen.getByRole("button", { name: "Save suite" }));
    await waitFor(() => expect(updateSuite).toHaveBeenCalledWith("s1", expect.objectContaining({
      config: expect.objectContaining({ engine_config_path: "C:/loom/suites/s1/locust.conf" }),
    })));
    fireEvent.click(screen.getAllByRole("button", { name: "Run" })[0]);
    expect(onRunTest).toHaveBeenCalledOnce();
  });
});
