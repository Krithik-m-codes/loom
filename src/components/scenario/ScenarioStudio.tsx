import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Code2, GripVertical, Plus, Trash2 } from "lucide-react";
import type {
  EngineAdapterMetadata,
  EngineConfigFormat,
  EngineConfigFile,
  EngineBundle,
  ConfigParseResult,
  ScenarioDiagnostic,
  ScenarioDocument,
  ScenarioNode,
  SourceDocument,
} from "../../lib/scenario/types";

type EditableNode = Exclude<ScenarioNode, { kind: "native" }>;

interface ScenarioStudioProps {
  document: ScenarioDocument;
  adapters: EngineAdapterMetadata[];
  diagnostics?: ScenarioDiagnostic[];
  supportPercent?: number;
  bundle?: EngineBundle | null;
  onChange: (document: ScenarioDocument) => void;
  onGenerateBundle?: (engineId: string, document: ScenarioDocument) => Promise<EngineBundle>;
  onParseConfig?: (engineId: string, source: EngineConfigFile) => Promise<ConfigParseResult>;
  onSaveBundle?: (bundle: EngineBundle) => void;
}

const paletteKinds = ["request", "wait", "check", "group", "loop"] as const;
type PaletteKind = (typeof paletteKinds)[number];
const INITIAL_VISIBLE_NODES = 60;
const NODE_PAGE_SIZE = 60;

function newNode(kind: PaletteKind, engineId: string, id: string): EditableNode {
  const base = { id, engineIds: [engineId] };
  switch (kind) {
    case "request": return { ...base, kind, method: "GET", url: "/" };
    case "wait": return { ...base, kind, seconds: 1 };
    case "check": return { ...base, kind, expression: "response.status === 200" };
    case "group": return { ...base, kind, label: "Transaction", children: [] };
    case "loop": return { ...base, kind, label: "Repeat steps", iterations: 3, children: [] };
  }
}

function nodeTitle(node: ScenarioNode): string {
  switch (node.kind) {
    case "request": return `${node.method} ${node.url}`;
    case "wait": return `Wait ${node.seconds}s`;
    case "check": return `Check ${node.expression}`;
    case "group": return `Group ${node.label}`;
    case "loop": return `Loop ${node.label}`;
    case "native": return "Native code";
  }
}

function sourceExcerpt(sources: SourceDocument[], node: Extract<ScenarioNode, { kind: "native" }>): string {
  const source = sources.find((item) => item.id === node.span.fileId);
  if (!source) return "Source file is not present in this scenario document.";
  const bytes = new TextEncoder().encode(source.content);
  return new TextDecoder().decode(bytes.slice(node.span.startOffset, node.span.endOffset));
}

function updateNode(nodes: ScenarioNode[], id: string, patch: Partial<ScenarioNode>): ScenarioNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, ...patch } as ScenarioNode;
    if (node.kind === "group" || node.kind === "loop") {
      return { ...node, children: updateNode(node.children, id, patch) };
    }
    return node;
  });
}

function flatten(nodes: ScenarioNode[], depth = 0, parentId: string | null = null): Array<{ node: ScenarioNode; depth: number; parentId: string | null }> {
  const output: Array<{ node: ScenarioNode; depth: number; parentId: string | null }> = [];
  const stack = nodes.slice().reverse().map((node) => ({ node, depth, parentId }));
  while (stack.length) {
    const current = stack.pop()!;
    output.push(current);
    if (current.node.kind === "group" || current.node.kind === "loop") {
      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: current.node.children[index], depth: current.depth + 1, parentId: current.node.id });
      }
    }
  }
  return output;
}

function reorderNode(nodes: ScenarioNode[], id: string, delta: -1 | 1): ScenarioNode[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return nodes.map((node) => node.kind === "group" || node.kind === "loop"
    ? { ...node, children: reorderNode(node.children, id, delta) }
    : node);
}

function reorderInParent(nodes: ScenarioNode[], parentId: string | null, id: string, delta: -1 | 1): ScenarioNode[] {
  if (parentId === null) return reorderNode(nodes, id, delta);
  return nodes.map((node) => {
    if (node.id === parentId && (node.kind === "group" || node.kind === "loop")) {
      return { ...node, children: reorderNode(node.children, id, delta) };
    }
    return node.kind === "group" || node.kind === "loop"
      ? { ...node, children: reorderInParent(node.children, parentId, id, delta) }
      : node;
  });
}

function siblingIds(nodes: ScenarioNode[], parentId: string | null): string[] {
  if (parentId === null) return nodes.map((node) => node.id);
  for (const node of nodes) {
    if (node.id === parentId && (node.kind === "group" || node.kind === "loop")) return node.children.map((child) => child.id);
    if (node.kind === "group" || node.kind === "loop") {
      const found = siblingIds(node.children, parentId);
      if (found.length || node.children.some((child) => child.id === parentId)) return found;
    }
  }
  return [];
}

function orderIsSourceBacked(rows: Array<{ node: ScenarioNode; depth: number; parentId: string | null }>, rowIndex: number): boolean {
  const row = rows[rowIndex];
  if (!row) return false;
  if (row.parentId) {
    const parent = rows.find((item) => item.node.id === row.parentId)?.node;
    if (parent?.span) return false; // the generator regenerates a source-backed group as a unit.
  }
  return rows.some((item) => item.parentId === row.parentId && Boolean(item.node.span));
}

function indexSiblingPositions(nodes: ScenarioNode[], output = new Map<string, { index: number; count: number }>()): Map<string, { index: number; count: number }> {
  nodes.forEach((node, index) => output.set(node.id, { index, count: nodes.length }));
  for (const node of nodes) {
    if (node.kind === "group" || node.kind === "loop") {
      node.children.forEach((child, index) => output.set(child.id, { index, count: node.children.length }));
      indexSiblingPositions(node.children, output);
    }
  }
  return output;
}

function insertBeforeNode(nodes: ScenarioNode[], draggedId: string, targetId: string): ScenarioNode[] {
  const from = nodes.findIndex((node) => node.id === draggedId);
  const to = nodes.findIndex((node) => node.id === targetId);
  if (from >= 0 && to >= 0 && from !== to) {
    const next = [...nodes];
    const [picked] = next.splice(from, 1);
    next.splice(next.findIndex((node) => node.id === targetId), 0, picked);
    return next;
  }
  return nodes.map((node) => node.kind === "group" || node.kind === "loop"
    ? { ...node, children: insertBeforeNode(node.children, draggedId, targetId) }
    : node);
}

function insertNewBefore(nodes: ScenarioNode[], targetId: string, inserted: ScenarioNode): ScenarioNode[] {
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index, 0, inserted);
    return next;
  }
  return nodes.map((node) => node.kind === "group" || node.kind === "loop"
    ? { ...node, children: insertNewBefore(node.children, targetId, inserted) }
    : node);
}

function removeFromTree(nodes: ScenarioNode[], id: string): ScenarioNode[] {
  return nodes.filter((node) => node.id !== id).map((node) => node.kind === "group" || node.kind === "loop"
    ? { ...node, children: removeFromTree(node.children, id) }
    : node);
}

export function ScenarioStudio({
  document,
  adapters,
  diagnostics = [],
  supportPercent,
  bundle = null,
  onChange,
  onGenerateBundle,
  onParseConfig,
  onSaveBundle,
}: ScenarioStudioProps) {
  const [engineId, setEngineId] = useState(document.engineId);
  const [selectedId, setSelectedId] = useState(document.nodes[0]?.id ?? "");
  const [announcement, setAnnouncement] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generatedBundle, setGeneratedBundle] = useState<EngineBundle | null>(bundle);
  const [generating, setGenerating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [visibleNodeCount, setVisibleNodeCount] = useState(INITIAL_VISIBLE_NODES);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<PaletteKind | null>(null);
  const [configFormOpen, setConfigFormOpen] = useState(false);
  const [configFileName, setConfigFileName] = useState("");
  const [configFormat, setConfigFormat] = useState<EngineConfigFormat>("json");
  const [configContent, setConfigContent] = useState("");
  const [configParsing, setConfigParsing] = useState(false);
  const [configDiagnostics, setConfigDiagnostics] = useState<ScenarioDiagnostic[]>([]);
  const [configError, setConfigError] = useState("");
  const idSequence = useRef(0);
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const adapter = adapters.find((item) => item.id === engineId);
  const rows = useMemo(() => flatten(document.nodes), [document.nodes]);
  const visibleRows = useMemo(() => rows.slice(0, visibleNodeCount), [rows, visibleNodeCount]);
  const nestedPositions = useMemo(() => indexSiblingPositions(document.nodes), [document.nodes]);
  const selected = rows.find(({ node }) => node.id === selectedId)?.node ?? rows[0]?.node ?? null;
  const incompatibilities = rows.filter(({ node }) => adapter && !adapter.compatibleNodeKinds.includes(node.kind));

  useEffect(() => {
    const formats = adapter?.configKinds ?? [];
    if (formats.length && !formats.includes(configFormat)) setConfigFormat(formats[0] as EngineConfigFormat);
  }, [adapter, configFormat]);

  const replaceNodes = (nodes: ScenarioNode[]) => {
    setGeneratedBundle(null);
    onChange({ ...document, nodes });
  };

  const addNode = (kind: PaletteKind) => {
    idSequence.current += 1;
    const node = newNode(kind, engineId, `visual-${Date.now()}-${idSequence.current}`);
    const currentSelected = rows.find(({ node: item }) => item.id === selectedId)?.node;
    if (currentSelected && (currentSelected.kind === "group" || currentSelected.kind === "loop")) {
      replaceNodes(updateNode(document.nodes, currentSelected.id, { children: [...currentSelected.children, node] }));
    } else {
      replaceNodes([...document.nodes, node]);
    }
    setSelectedId(node.id);
    setAnnouncement(`${kind} node added`);
  };

  const moveNode = (id: string, delta: -1 | 1) => {
    const rowIndex = rows.findIndex(({ node }) => node.id === id);
    if (rowIndex < 0) return;
    const { parentId } = rows[rowIndex];
    const siblings = siblingIds(document.nodes, parentId);
    const siblingIndex = siblings.indexOf(id);
    const nextIndex = siblingIndex + delta;
    if (siblingIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const nodes = reorderInParent(document.nodes, parentId, id, delta);
    replaceNodes(nodes);
    setSelectedId(id);
    const title = nodeTitle(rows[rowIndex].node);
    setAnnouncement(`Moved ${title} to position ${nextIndex + 1} in its group`);
    requestAnimationFrame(() => nodeButtons.current.get(id)?.focus());
  };

  const removeNode = (id: string) => {
    const next = removeFromTree(document.nodes, id);
    replaceNodes(next);
    setSelectedId(flatten(next)[0]?.node.id ?? "");
    setAnnouncement("Scenario node removed");
  };

  const patchSelected = (patch: Partial<ScenarioNode>) => {
    if (selected) replaceNodes(updateNode(document.nodes, selected.id, patch));
  };

  const dropOnNode = (targetId: string) => {
    const targetIndex = rows.findIndex(({ node }) => node.id === targetId);
    if (dragId) {
      const from = rows.findIndex(({ node }) => node.id === dragId);
      const target = rows.findIndex(({ node }) => node.id === targetId);
      if (from >= 0 && targetIndex >= 0 && dragId !== targetId) {
        if (rows[from].parentId !== rows[target].parentId) {
          setAnnouncement("Drag a step within the same group to reorder it");
          setDragId(null);
          return;
        }
        if (orderIsSourceBacked(rows, from)) {
          setAnnouncement("Source-backed order is preserved. Reorder these statements in Code view, then import again.");
          setDragId(null);
          return;
        }
        const nodes = insertBeforeNode(document.nodes, dragId, targetId);
        replaceNodes(nodes);
        setSelectedId(dragId);
        setAnnouncement(`Moved ${nodeTitle(rows[from].node)} in the scenario flow`);
      }
    } else if (dragKind) {
      const node = newNode(dragKind, engineId, `visual-${Date.now()}-${++idSequence.current}`);
      const target = rows[targetIndex]?.node;
      const nodes = target && (target.kind === "group" || target.kind === "loop")
        ? updateNode(document.nodes, target.id, { children: [...target.children, node] })
        : insertNewBefore(document.nodes, targetId, node);
      replaceNodes(nodes);
      setSelectedId(node.id);
      setAnnouncement(`${dragKind} node inserted at position ${targetIndex + 1}`);
    }
    setDragId(null);
    setDragKind(null);
  };

  const preview = async () => {
    if (!onGenerateBundle) return;
    setGenerating(true);
    setGenerationError("");
    setConfirmed(false);
    try {
      setGeneratedBundle(await onGenerateBundle(engineId, { ...document, engineId }));
    } catch (error) {
      setGeneratedBundle(null);
      setGenerationError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  const attachConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configFileName.trim() || !configContent.trim()) return;
    if (new TextEncoder().encode(configContent).length > 2 * 1024 * 1024) {
      setConfigError("Configuration exceeds the 2 MiB import limit.");
      return;
    }
    const source: EngineConfigFile = {
      id: `config-${Date.now()}-${document.configFiles.length}`,
      fileName: configFileName.trim(),
      format: configFormat,
      content: configContent,
    };
    setConfigParsing(true);
    setConfigError("");
    try {
      const result = onParseConfig ? await onParseConfig(engineId, source) : { source, recognized: {}, diagnostics: [] };
      onChange({ ...document, configFiles: [...document.configFiles, result.source] });
      setGeneratedBundle(null);
      setConfigDiagnostics((current) => [...current, ...result.diagnostics]);
      setConfigFormOpen(false);
      setConfigFileName("");
      setConfigContent("");
      setAnnouncement(`${source.fileName} attached with ${result.diagnostics.length} diagnostics`);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    } finally {
      setConfigParsing(false);
    }
  };

  return (
    <main className="loom-scenario-studio" aria-label="Scenario visual editor">
      <aside className="loom-scenario-palette" aria-label="Scenario steps">
        <h2>Build the flow</h2>
        <p>Drag a step into the sequence, or add it with the button.</p>
        {paletteKinds.map((kind) => {
          const allowed = adapter?.compatibleNodeKinds.includes(kind) ?? false;
          return (
            <button
              key={kind}
              type="button"
              className="loom-scenario-palette__item"
              draggable={allowed}
              disabled={!allowed}
              onDragStart={(event) => { setDragKind(kind); event.dataTransfer.setData("text/plain", kind); }}
              onClick={() => addNode(kind)}
              aria-label={`Add ${kind === "wait" ? "Wait" : kind[0].toUpperCase() + kind.slice(1)}`}
              title={allowed ? `Add ${kind}` : `${kind} is not supported by ${adapter?.displayName ?? engineId}`}
            >
              <Plus aria-hidden="true" />
              <span>{kind === "wait" ? "Wait" : kind[0].toUpperCase() + kind.slice(1)}</span>
              <small>{allowed ? "Add" : "Unavailable"}</small>
            </button>
          );
        })}
        <section className="loom-scenario-configs" aria-label="Configuration and parse report">
          <div className="loom-scenario-configs__heading"><h3>Configuration files</h3><button type="button" onClick={() => setConfigFormOpen((open) => !open)} aria-expanded={configFormOpen}>Attach config file</button></div>
          {configFormOpen && <form className="loom-scenario-config-form" onSubmit={attachConfig}>
            <label>Config file name<input aria-label="Config file name" required value={configFileName} onChange={(event) => setConfigFileName(event.target.value)} placeholder="locust.conf / options.json" /></label>
            <label>Config format<select aria-label="Config format" value={configFormat} onChange={(event) => setConfigFormat(event.target.value as EngineConfigFormat)}>
              {(adapter?.configKinds ?? []).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select></label>
            <label>Config contents<textarea aria-label="Config contents" required value={configContent} onChange={(event) => setConfigContent(event.target.value)} placeholder="Paste the engine configuration" /></label>
            {configError && <p className="loom-scenario-error" role="alert">{configError}</p>}
            <button type="submit" disabled={configParsing || (adapter?.configKinds.length ?? 0) === 0}>{configParsing ? "Parsing…" : "Parse and attach config"}</button>
          </form>}
          {document.configFiles.length ? (
            <ul>{document.configFiles.map((file) => <li key={file.id}><code>{file.fileName}</code><span>{file.format}</span><button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => onChange({ ...document, configFiles: document.configFiles.filter((item) => item.id !== file.id) })}>Remove</button></li>)}</ul>
          ) : <p>No engine config files attached.</p>}
          <h3>Import report</h3>
          <p>{diagnostics.length ? `${diagnostics.length} diagnostics` : "No parser diagnostics"}</p>
          {diagnostics.map((diagnostic, index) => <p className={`loom-scenario-diagnostic loom-scenario-diagnostic--${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}>{diagnostic.message}</p>)}
          {configDiagnostics.map((diagnostic, index) => <p className={`loom-scenario-diagnostic loom-scenario-diagnostic--${diagnostic.severity}`} key={`config-${diagnostic.code}-${index}`}>{diagnostic.message}</p>)}
        </section>
      </aside>

      <section className="loom-scenario-canvas" aria-label="Scenario sequence" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragKind) addNode(dragKind); }}>
        <div className="loom-scenario-canvas__toolbar">
          <div>
            <h2>Scenario flow</h2>
          <p>{rows.length} steps · order defines execution</p>
          {supportPercent !== undefined && <p>Source coverage {supportPercent}% · unrecognized code remains visible and intact.</p>}
          </div>
          <div className="loom-scenario-engines" role="tablist" aria-label="Preview engine">
            {adapters.map((item) => <button key={item.id} role="tab" aria-selected={engineId === item.id} type="button" onClick={() => { setEngineId(item.id); setGeneratedBundle(null); }}>{item.displayName}</button>)}
          </div>
        </div>
        {incompatibilities.length > 0 && <div className="loom-scenario-warning" role="alert">{incompatibilities.length} step{incompatibilities.length === 1 ? " is" : "s are"} not supported by {adapter?.displayName}; switch engines or edit these steps before preview.</div>}
        {rows.some((_, index) => orderIsSourceBacked(rows, index)) && <div className="loom-scenario-source-order" role="note">Source-backed statements keep their original order. Reorder them in Code view and re-import; generated groups can be reordered internally.</div>}
        <ol className="loom-scenario-flow">
          {visibleRows.map(({ node, depth }, index) => (
            <li key={node.id} className="loom-scenario-flow__item" style={{ marginInlineStart: `${depth * 1.5}rem` }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); dropOnNode(node.id); }}>
              <div className="loom-scenario-flow__row">
                <button type="button" className="loom-scenario-flow__drag" draggable={!orderIsSourceBacked(rows, index)} aria-label={`Drag ${nodeTitle(node)}`} onDragStart={(event) => { setDragId(node.id); event.dataTransfer.setData("text/plain", node.id); }} onDragEnd={() => setDragId(null)} title={orderIsSourceBacked(rows, index) ? "Source-backed order is preserved" : "Drag to reorder"}>
                  <GripVertical aria-hidden="true" />
                </button>
                <button type="button" className={`loom-scenario-node${selected?.id === node.id ? " is-selected" : ""}`} aria-label={`Select ${nodeTitle(node)}`} ref={(element) => { if (element) nodeButtons.current.set(node.id, element); }} onClick={() => setSelectedId(node.id)} aria-pressed={selected?.id === node.id}>
                  <span>{node.kind.toUpperCase()}</span><strong>{nodeTitle(node)}</strong>
                  {node.kind === "native" && <small>{node.reason}</small>}
                </button>
                <span className="loom-scenario-flow__ordering">
                  <button type="button" aria-label={`Move up ${nodeTitle(node)}`} disabled={orderIsSourceBacked(rows, index) || (nestedPositions.get(node.id)?.index ?? index) === 0} onClick={() => moveNode(node.id, -1)}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" aria-label={`Move down ${nodeTitle(node)}`} disabled={orderIsSourceBacked(rows, index) || (nestedPositions.get(node.id)?.index ?? index) === (nestedPositions.get(node.id)?.count ?? document.nodes.length) - 1} onClick={() => moveNode(node.id, 1)}><ArrowDown aria-hidden="true" /></button>
                </span>
              </div>
              {index < visibleRows.length - 1 && visibleRows[index + 1].depth === depth && <span className="loom-scenario-flow__connector" aria-hidden="true" />}
            </li>
          ))}
          {document.nodes.length === 0 && <li className="loom-scenario-empty">Add a step to begin. Imported source stays unchanged until you preview and confirm generated files.</li>}
        </ol>
        {visibleRows.length < rows.length && <button type="button" className="loom-scenario-load-more" onClick={() => setVisibleNodeCount((count) => Math.min(rows.length, count + NODE_PAGE_SIZE))}>Show next {Math.min(NODE_PAGE_SIZE, rows.length - visibleRows.length)} steps · {rows.length - visibleRows.length} remaining</button>}
        <p className="loom-scenario-announcement" role="status" aria-live="polite">{announcement}</p>
      </section>

      <aside className="loom-scenario-inspector" aria-label="Step inspector and generated artifacts">
        <header><Code2 aria-hidden="true" /><h2>Step details</h2>{selected && selected.kind !== "native" && <button type="button" className="loom-scenario-delete" onClick={() => removeNode(selected.id)} aria-label={`Delete ${nodeTitle(selected)}`}><Trash2 aria-hidden="true" /></button>}</header>
        {selected ? <ScenarioNodeFields node={selected} sources={document.sources} onChange={patchSelected} /> : <p>Select a step to inspect it.</p>}
        <section className="loom-scenario-artifacts" aria-label="Generated artifacts">
          <div className="loom-scenario-artifacts__header"><h3>Generated preview</h3><button type="button" disabled={!onGenerateBundle || generating || incompatibilities.length > 0} onClick={preview}>{generating ? "Generating…" : "Preview"}</button></div>
          {generationError && <p className="loom-scenario-error" role="alert">{generationError}</p>}
          {(generatedBundle ?? bundle)?.files.map((file) => <details key={file.path}><summary><code>{file.path}</code><span>{file.role}</span></summary><pre>{file.content}</pre></details>)}
          {(generatedBundle ?? bundle) && <>
            <label className="loom-scenario-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the generated files and want to apply them.</label>
            <button type="button" className="loom-scenario-apply" onClick={() => onSaveBundle?.((generatedBundle ?? bundle)!)} disabled={!onSaveBundle || !confirmed}>Apply generated bundle</button>
          </>}
          {!generatedBundle && !bundle && <p>Preview validates compatibility and shows the exact generated files before applying changes.</p>}
        </section>
      </aside>
    </main>
  );
}

function ScenarioNodeFields({ node, sources, onChange }: { node: ScenarioNode; sources: SourceDocument[]; onChange: (patch: Partial<ScenarioNode>) => void }) {
  if (node.kind === "native") return <section className="loom-scenario-fields"><h3>Source-preserved code</h3><p>{node.reason}</p><code>{node.span.fileId}:{node.span.startOffset}–{node.span.endOffset}</code><pre className="loom-scenario-native-source">{sourceExcerpt(sources, node)}</pre><p>This region stays byte-for-byte intact; edit it in Code view, then re-import.</p></section>;
  return (
    <section className="loom-scenario-fields">
      {(node.kind === "group" || node.kind === "loop") && <label>Step name<input aria-label="Step name" value={node.label} onChange={(event) => onChange({ label: event.target.value })} /></label>}
      {node.kind === "request" && <>
        <label>Method<select aria-label="Request method" value={node.method} onChange={(event) => onChange({ method: event.target.value })}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Request URL<input aria-label="Request URL" value={node.url} onChange={(event) => onChange({ url: event.target.value })} /></label>
        <label>Headers (JSON)<textarea aria-label="Request headers" value={JSON.stringify(node.headers ?? {}, null, 2)} onChange={(event) => { try { onChange({ headers: JSON.parse(event.target.value) as Record<string, string> }); } catch { /* keep the last valid semantic value */ } }} /></label>
        <label>Request body<textarea aria-label="Request body" value={node.body ?? ""} onChange={(event) => onChange({ body: event.target.value })} /></label>
      </>}
      {node.kind === "wait" && <label>Duration (seconds)<input aria-label="Wait duration" type="number" min="0" step="0.1" value={node.seconds} onChange={(event) => onChange({ seconds: Math.max(0, Number(event.target.value) || 0) })} /></label>}
      {node.kind === "check" && <label>Expression<input aria-label="Check expression" value={node.expression} onChange={(event) => onChange({ expression: event.target.value })} /></label>}
      {(node.kind === "group" || node.kind === "loop") && <>
        {node.kind === "loop" && <label>Iterations<input aria-label="Loop iterations" type="number" min="1" value={node.iterations ?? 1} onChange={(event) => onChange({ iterations: Math.max(1, Number(event.target.value) || 1) })} /></label>}
        <p>{node.children.length} nested steps. Nested structures are shown in the scenario source tree.</p>
      </>}
      {node.span && <p className="loom-scenario-source-ref">Source mapped · {node.span.fileId}:{node.span.startOffset}–{node.span.endOffset}</p>}
    </section>
  );
}
