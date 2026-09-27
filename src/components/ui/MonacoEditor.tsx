import Editor from "@monaco-editor/react";
// NOTE: no direct monaco-editor ESM imports — @monaco-editor/react's loader
// serves the default editor bundle, which already registers the basic-language
// contributions for python, javascript, typescript and rust.

export type MonacoLanguage = "python" | "javascript" | "typescript" | "rust";

export function monacoLanguageForEngine(engine: string, scriptPath: string): MonacoLanguage {
  if (scriptPath.endsWith(".ts")) return "typescript";
  if (scriptPath.endsWith(".rs")) return "rust";
  if (scriptPath.endsWith(".js")) return "javascript";
  if (engine === "k6") return "javascript";
  if (engine === "goose") return "rust";
  return "python";
}

interface MonacoEditorProps {
  language: MonacoLanguage;
  value: string;
  onChange: (value: string) => void;
  theme?: "vs-dark" | "vs";
  height?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  language, value, onChange, theme = "vs-dark", height = "100%",
}) => (
  <Editor
    height={height}
    language={language}
    value={value}
    theme={theme}
    onChange={(next) => onChange(next ?? "")}
    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
  />
);
