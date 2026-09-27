import { useEffect, useState } from "react";
import { Check, FileCode, Play, RefreshCw, Save } from "lucide-react";
import { readScript, saveScript } from "../lib/ipc";
import { LoomButton } from "./ui/LoomButton";

interface ScriptEditorViewProps {
  scriptPath: string;
  onSelectScript: (path: string, engine: string) => void;
  onRunTest: () => void;
}

export const ScriptEditorView: React.FC<ScriptEditorViewProps> = ({
  scriptPath,
  onSelectScript,
  onRunTest,
}) => {
  const [content, setContent] = useState("");
  const [isSaved, setIsSaved] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");

  const loadCurrentScript = async () => {
    try {
      const code = await readScript(scriptPath);
      setContent(code);
      setIsSaved(true);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void loadCurrentScript();
  }, [scriptPath]);

  const handleSave = async () => {
    try {
      await saveScript(scriptPath, content);
      setIsSaved(true);
      setSaveStatus("Saved successfully");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch (error) {
      setSaveStatus(`Save error: ${error}`);
    }
  };

  const templates = [
    { name: "Locust (Python)", path: "examples/locust/basic_test.py", engine: "locust" },
    { name: "k6 (JavaScript)", path: "examples/k6/basic_test.js", engine: "k6" },
  ];
  const lineCount = content.split("\n").length;
  const language = scriptPath.endsWith(".py")
    ? "Python (Locust)"
    : scriptPath.endsWith(".js")
      ? "JavaScript (k6)"
      : "Rust (Goose)";

  return (
    <main className="loom-editor" aria-label="Script editor">
      <header className="loom-editor__toolbar">
        <div className="loom-editor__identity">
          <FileCode aria-hidden="true" />
          <span className="loom-file-chip" title={scriptPath}>{scriptPath}</span>
          {!isSaved && <span className="loom-editor__unsaved" title="Unsaved changes">Unsaved</span>}
          {saveStatus && (
            <span className="loom-editor__save-status" role="status">
              <Check aria-hidden="true" /> {saveStatus}
            </span>
          )}
        </div>

        <div className="loom-editor__actions">
          <div className="loom-editor__templates" aria-label="Script templates">
            <span>Templates</span>
            {templates.map((template) => (
              <button
                key={template.path}
                type="button"
                onClick={() => onSelectScript(template.path, template.engine)}
                className={`loom-editor__template ${scriptPath === template.path ? "is-active" : ""}`}
              >
                {template.name}
              </button>
            ))}
          </div>
          <LoomButton variant="secondary" className="loom-button--compact" onClick={loadCurrentScript} aria-label="Reload from disk" title="Reload from disk">
            <RefreshCw aria-hidden="true" />
          </LoomButton>
          <LoomButton variant="secondary" className="loom-button--compact" onClick={handleSave}>
            <Save aria-hidden="true" /> Save
          </LoomButton>
          <LoomButton className="loom-button--compact" onClick={onRunTest}>
            <Play aria-hidden="true" /> Run
          </LoomButton>
        </div>
      </header>

      <section className="loom-code-surface">
        <div className="loom-code-surface__lines" aria-hidden="true">
          {Array.from({ length: Math.max(lineCount, 25) }, (_, index) => <div key={index}>{index + 1}</div>)}
        </div>
        <textarea
          aria-label="Script source"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setIsSaved(false);
          }}
          spellCheck={false}
          className="loom-code-surface__input"
        />
      </section>

      <footer className="loom-editor__footer">
        <span>Lines: {lineCount} · Characters: {content.length}</span>
        <span>UTF-8 · LF · {language}</span>
      </footer>
    </main>
  );
};
