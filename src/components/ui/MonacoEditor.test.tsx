import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonacoEditor } from "./MonacoEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, language, onChange }: any) => (
    <textarea aria-label={`monaco-${language}`} value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

describe("MonacoEditor", () => {
  it("renders python content", () => {
    render(<MonacoEditor language="python" value="print('hi')" onChange={() => {}} />);
    expect(screen.getByLabelText("monaco-python")).toHaveValue("print('hi')");
  });
});
