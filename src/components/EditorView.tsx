import { useEffect, useState } from "react";
import { MonacoEditor, monacoLanguageForEngine } from "./ui/MonacoEditor";
import { ScenarioStudio } from "./scenario/ScenarioStudio";
import { TemplatePickerModal } from "./projects/TemplatePickerModal";
import type { StarterTemplate } from "../templates";
import { generateScenarioBundle, getSuite, listScenarioAdapters, parseEngineConfig, parseScenarioSource, updateSuite } from "../lib/ipc";
import { validateScenarioDocument } from "../lib/scenario/types";
import type { EngineAdapterMetadata, ScenarioDiagnostic, ScenarioDocument, SourceDocument } from "../lib/scenario/types";
import type { TestConfig, TestSuite } from "../types";

interface EditorViewProps {
  suiteId: string | null;
  scriptPath: string;
  engine: string;
  targetHost: string;
  onRunTest: () => void;
  onSuiteSaved?: (suite: TestSuite) => void;
  onRunBlockedChange?: (reason: string | null) => void;
  config?: TestConfig;
}

function parseScenarioDocument(raw: unknown): ScenarioDocument | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return validateScenarioDocument(parsed);
  } catch {
    return null;
  }
}

function languageForPath(path: string): string {
  const pathParts = path.split(/[\\/]/);
  const nameParts = (pathParts[pathParts.length - 1] ?? "").split(".");
  const extension = nameParts[nameParts.length - 1]?.toLowerCase();
  if (extension === "py") return "python";
  if (extension === "rs") return "rust";
  if (extension === "ts") return "typescript";
  return "javascript";
}

export const EditorView: React.FC<EditorViewProps> = ({
  suiteId,
  scriptPath,
  engine,
  targetHost,
  onRunTest,
  onSuiteSaved,
  onRunBlockedChange,
  config,
}) => {
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [code, setCode] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [scenarioDocument, setScenarioDocument] = useState<ScenarioDocument | null>(null);
  const [adapters, setAdapters] = useState<EngineAdapterMetadata[]>([]);
  const [scenarioDiagnostics, setScenarioDiagnostics] = useState<ScenarioDiagnostic[]>([]);
  const [supportPercent, setSupportPercent] = useState<number | undefined>();
  const [sourceStale, setSourceStale] = useState(false);
  const [scriptDirty, setScriptDirty] = useState(false);
  const [scenarioPending, setScenarioPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [templateOpen, setTemplateOpen] = useState<boolean>(false);

  useEffect(() => {
    const reason = sourceStale
      ? "The script changed after its diagram was imported. Re-import before running."
      : scenarioPending
        ? "Visual or config edits need a generated preview to be applied before running."
        : scriptDirty
          ? "Save the changed script before running."
          : null;
    onRunBlockedChange?.(reason);
  }, [onRunBlockedChange, scenarioPending, scriptDirty, sourceStale]);

  useEffect(() => () => onRunBlockedChange?.(null), [onRunBlockedChange]);

  useEffect(() => {
    let cancelled = false;
    if (suiteId === null) {
      setCode("");
      setProjectId("");
      setScenarioDocument(null);
      setScenarioDiagnostics([]);
      setSupportPercent(undefined);
      setSourceStale(false);
      setScriptDirty(false);
      setScenarioPending(false);
      setDirty(false);
      setStatus("");
      return;
    }
    setStatus("");
    getSuite(suiteId)
      .then((suite) => {
        if (cancelled) return;
        setCode(suite.scriptContent ?? "");
        setProjectId(suite.projectId);
        const savedDocument = parseScenarioDocument(suite.visualNodes);
        setScenarioDocument(savedDocument);
        setSourceStale(false);
        setScriptDirty(false);
        setScenarioPending(false);
        if (suite.visualNodes && !savedDocument) setStatus("Saved flow metadata is from an older format. Import the current script to rebuild its diagram safely.");
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

  useEffect(() => {
    let cancelled = false;
    listScenarioAdapters()
      .then((items) => { if (!cancelled) setAdapters(items); })
      .catch((err) => { if (!cancelled) setStatus(`Scenario adapters unavailable: ${err instanceof Error ? err.message : String(err)}`); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!suiteId) {
      setStatus("Open a suite to save");
      return;
    }
    try {
      const updated = await updateSuite(suiteId, {
        scriptContent: code,
        visualNodes: scenarioDocument ?? undefined,
      });
      onSuiteSaved?.(updated);
      setDirty(false);
      setScriptDirty(false);
      setStatus("Saved successfully");
    } catch (err) {
      setStatus(`Save error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const importSource = async () => {
    if (!suiteId || !projectId) return;
    setImporting(true);
    setStatus("");
    try {
      const source: SourceDocument = {
        id: `source-${suiteId}`,
        fileName: scriptPath.split(/[\\/]/).pop() || `scenario.${engine === "goose" ? "rs" : engine === "k6" ? "js" : "py"}`,
        language: languageForPath(scriptPath),
        content: code,
      };
      const parsed = await parseScenarioSource(engine, source, {
        projectId,
        suiteId,
        maxBytes: 2 * 1024 * 1024,
        cancelId: globalThis.crypto?.randomUUID?.() ?? `parse-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setScenarioDocument({ schemaVersion: 1, engineId: engine, projectId, suiteId, sources: [parsed.source], nodes: parsed.nodes, configFiles: [] });
      setScenarioDiagnostics(parsed.diagnostics);
      setSupportPercent(parsed.supportPercent);
      setSourceStale(false);
      setScenarioPending(false);
      setDirty(true);
      setStatus(parsed.diagnostics.some((item) => item.severity === "error")
        ? "Some source could not be interpreted. It remains visible as preserved native code; review diagnostics before editing."
        : `Imported ${parsed.nodes.length} scenario nodes; ${parsed.supportPercent}% of the script maps to editable steps.`);
    } catch (err) {
      setStatus(`Could not import script: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const applyBundle = async (bundle: import("../lib/scenario/types").EngineBundle) => {
    if (bundle.engineId !== engine) {
      setStatus(`This suite uses ${engine}; create or select a ${bundle.engineId} suite before applying that engine's output.`);
      return;
    }
    const script = bundle.files.find((file) => file.role === "script");
    if (!script) {
      setStatus("The generated bundle has no script file to apply.");
      return;
    }
    try {
      const pathParts = script.path.split(/[\\/]/);
      const source: SourceDocument = {
        id: `source-${suiteId}`,
        fileName: pathParts[pathParts.length - 1] || script.path,
        language: languageForPath(script.path),
        content: script.content,
      };
      const parsed = await parseScenarioSource(engine, source, {
        projectId,
        suiteId: suiteId ?? "",
        maxBytes: 2 * 1024 * 1024,
        cancelId: globalThis.crypto?.randomUUID?.() ?? `apply-${Date.now()}`,
      });
      setCode(script.content);
      setScenarioDocument((current) => current ? { ...current, engineId: engine, sources: [parsed.source], nodes: parsed.nodes } : null);
      setScenarioDiagnostics(parsed.diagnostics);
      setSupportPercent(parsed.supportPercent);
      setSourceStale(false);
      setScenarioPending(bundle.files.some((file) => file.role === "config"));
      setMode("code");
      setDirty(true);
      setScriptDirty(true);
      setStatus(`Generated ${script.path} is staged in the editor and diagram. Save the suite to persist both; extra bundle files will be saved with project-artifact support.`);
    } catch (err) {
      setStatus(`Generated preview was not applied because its source could not be re-imported: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const generateBundle = async (engineId: string, document: ScenarioDocument) => {
    if (sourceStale) throw new Error("Code changed after import. Re-import the source before generating.");
    return await generateScenarioBundle(engineId, document);
  };

  const handlePickTemplate = async (template: StarterTemplate) => {
    setCode(template.script);
    setDirty(true);
    setScriptDirty(true);
    setSourceStale(Boolean(scenarioDocument));
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
      setScriptDirty(false);
      setStatus(`Applied template "${template.name}"`);
    } catch (err) {
      setStatus(`Template apply error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const requestRun = () => {
    if (sourceStale) {
      setStatus("The script changed after the diagram was imported. Re-import it before running.");
      return;
    }
    if (scenarioPending) {
      setStatus("Visual or config edits are not in the runnable script yet. Generate a preview, apply it, then save before running.");
      return;
    }
    if (scriptDirty) {
      setStatus("Save the changed script before running so the runner uses the code shown in this editor.");
      return;
    }
    onRunTest();
  };

  if (suiteId === null) {
    return (
      <main className="loom-editor" aria-label="Suite editor">
        <p>Select a project and suite to edit or run its load-test scenario.</p>
      </main>
    );
  }

  const language = monacoLanguageForEngine(engine, scriptPath);

  return (
    <main className="loom-editor" aria-label="Suite editor">
      <header className="loom-editor__toolbar">
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
        <div className="loom-editor__actions">
          {dirty && <span className="loom-editor__unsaved">Unsaved changes</span>}
          <button type="button" onClick={handleSave}>Save suite</button>
          <button type="button" onClick={requestRun}>Run</button>
        </div>
      </header>

      {mode === "visual" ? (
        scenarioDocument ? <>
          <ScenarioStudio
            key={suiteId ?? "none"}
            document={scenarioDocument}
            adapters={adapters}
            diagnostics={scenarioDiagnostics}
            supportPercent={supportPercent}
            onChange={(next) => { setScenarioDocument(next); setDirty(true); setScenarioPending(true); }}
            onGenerateBundle={generateBundle}
            onParseConfig={parseEngineConfig}
            onSaveBundle={applyBundle}
          />
          {sourceStale && <p className="loom-action-error" role="alert">Code changed after this diagram was imported. Re-import the source before generating another bundle.</p>}
        </> : <section className="loom-editor__import-empty">
          <h2>Turn the script into a flow</h2>
          <p>Import the selected suite source to map supported operations. Dynamic or unsupported code stays in the original source and is reported as opaque code. Target: {targetHost || "not configured"}</p>
          <button type="button" onClick={importSource} disabled={importing || adapters.length === 0}>{importing ? "Parsing source…" : "Visualize current source"}</button>
          {adapters.length === 0 && <p>Loading engine adapters…</p>}
        </section>
      ) : (
        <section aria-label="Code editor">
          <header>
            <span>{language}</span>
            {dirty && <span title="Unsaved changes">Unsaved</span>}
            {sourceStale && <span role="alert">Diagram is stale — re-import after saving code edits.</span>}
            <button type="button" onClick={() => setTemplateOpen(true)}>
              New from Template
            </button>
            <button type="button" onClick={handleSave}>
              Save
            </button>
            <button type="button" onClick={requestRun}>
              Run
            </button>
          </header>
          <MonacoEditor
            language={language}
            value={code}
            onChange={(next) => {
              setCode(next);
              setSourceStale(Boolean(scenarioDocument));
              setScriptDirty(true);
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
