import { useEffect, useState } from "react";
import { MonacoEditor, monacoLanguageForEngine } from "./ui/MonacoEditor";
import { FlowchartBuilderView, type FlowNode } from "./FlowchartBuilderView";
import { TemplatePickerModal } from "./projects/TemplatePickerModal";
import type { StarterTemplate } from "../templates";
import { getSuite, saveVisualFlow, updateSuite } from "../lib/ipc";
import type { TestConfig, TestSuite } from "../types";

interface EditorViewProps {
  suiteId: string | null;
  scriptPath: string;
  engine: string;
  targetHost: string;
  onRunTest: () => void;
  onSuiteSaved?: (suite: TestSuite) => void;
  config?: TestConfig;
}

function parseVisualNodes(raw: unknown): FlowNode[] | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        typeof (node as FlowNode).id === "string" &&
        typeof (node as FlowNode).type === "string",
    );
    return valid ? (parsed as FlowNode[]) : null;
  } catch {
    return null;
  }
}

export const EditorView: React.FC<EditorViewProps> = ({
  suiteId,
  scriptPath,
  engine,
  targetHost,
  onRunTest,
  onSuiteSaved,
  config,
}) => {
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [code, setCode] = useState<string>("");
  const [visualNodes, setVisualNodes] = useState<FlowNode[] | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [templateOpen, setTemplateOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (suiteId === null) {
      setCode("");
      setVisualNodes(null);
      setDirty(false);
      setStatus("");
      return;
    }
    setStatus("");
    getSuite(suiteId)
      .then((suite) => {
        if (cancelled) return;
        setCode(suite.scriptContent ?? "");
        setVisualNodes(parseVisualNodes(suite.visualNodes));
        setDirty(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(`Failed to load suite: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [suiteId]);

  const handleSave = async () => {
    if (!suiteId) {
      setStatus("Open a suite to save");
      return;
    }
    try {
      const updated = await updateSuite(suiteId, {
        scriptContent: code,
        visualNodes: visualNodes ?? undefined,
      });
      onSuiteSaved?.(updated);
      setDirty(false);
      setStatus("Saved successfully");
    } catch (err) {
      setStatus(`Save error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handlePickTemplate = async (template: StarterTemplate) => {
    setCode(template.script);
    setDirty(true);
    setMode("code");
    setTemplateOpen(false);
    if (!suiteId) return;
    try {
      const updated = await updateSuite(suiteId, {
        scriptContent: template.script,
        ...(config ? { config: { ...config, load_profile: { ...template.config } } } : {}),
      });
      onSuiteSaved?.(updated);
      setDirty(false);
      setStatus(`Applied template "${template.name}"`);
    } catch (err) {
      setStatus(`Template apply error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (suiteId === null) {
    return (
      <main className="loom-editor" aria-label="Suite editor">
        <p>1. Select a project, 2. create a suite from a template, 3. edit it here</p>
      </main>
    );
  }

  const language = monacoLanguageForEngine(engine, scriptPath);

  return (
    <main className="loom-editor" aria-label="Suite editor">
      <div role="tablist" aria-label="Editor mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          Visual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          onClick={() => setMode("code")}
        >
          Code
        </button>
      </div>

      {mode === "visual" ? (
        <FlowchartBuilderView
          key={suiteId ?? "none"}
          suiteId={suiteId ?? undefined}
          initialNodes={visualNodes ?? undefined}
          targetHost={targetHost}
          onExportToRunner={(script) => {
            setCode(script);
            setDirty(true);
            setMode("code");
          }}
          onSaveVisualFlow={(nodes) => {
            setVisualNodes(nodes);
            if (suiteId) {
              saveVisualFlow(suiteId, JSON.stringify(nodes)).catch((err) =>
                setStatus(
                  `Failed to save visual flow: ${err instanceof Error ? err.message : String(err)}`,
                ),
              );
            }
          }}
        />
      ) : (
        <section aria-label="Code editor">
          <header>
            <span>{language}</span>
            {dirty && <span title="Unsaved changes">Unsaved</span>}
            <button type="button" onClick={() => setTemplateOpen(true)}>
              New from Template
            </button>
            <button type="button" onClick={handleSave}>
              Save
            </button>
            <button type="button" onClick={onRunTest}>
              Run
            </button>
          </header>
          <MonacoEditor
            language={language}
            value={code}
            onChange={(next) => {
              setCode(next);
              setDirty(true);
            }}
          />
        </section>
      )}

      {status && <p role="status">{status}</p>}

      <TemplatePickerModal
        isOpen={templateOpen}
        engine={engine}
        onClose={() => setTemplateOpen(false)}
        onPick={handlePickTemplate}
      />
    </main>
  );
};
