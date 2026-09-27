import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorView } from "./EditorView";

vi.mock("./ui/MonacoEditor", () => ({
  MonacoEditor: ({ value }: any) => <textarea aria-label="code-tab" value={value} readOnly />,
  monacoLanguageForEngine: () => "python",
}));
vi.mock("./FlowchartBuilderView", () => ({
  FlowchartBuilderView: () => <div>visual-flow-stub</div>,
}));

describe("EditorView", () => {
  it("switches between visual and code tabs", () => {
    render(<EditorView suiteId="s1" scriptPath="a.py" engine="locust" targetHost="http://localhost:8080" onRunTest={() => {}} />);
    expect(screen.getByText("visual-flow-stub")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /code/i }));
    expect(screen.getByLabelText("code-tab")).toBeTruthy();
  });
});
