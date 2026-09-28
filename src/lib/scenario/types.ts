export interface SourceSpan {
  fileId: string;
  startOffset: number;
  endOffset: number;
}

export interface SourceDocument {
  id: string;
  fileName: string;
  language: string;
  content: string;
}

export type EngineConfigFormat = "locust-conf" | "toml" | "json" | "loom-goose-toml";

export interface EngineConfigFile {
  id: string;
  fileName: string;
  format: EngineConfigFormat;
  content: string;
}

export interface ScenarioDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  span?: SourceSpan;
}

export interface ParseContext {
  projectId: string;
  suiteId: string;
  maxBytes: number;
  cancelId: string;
}

interface ScenarioNodeBase {
  id: string;
  engineIds: string[];
  span?: SourceSpan;
}

export type ScenarioNode =
  | (ScenarioNodeBase & { kind: "request"; method: string; url: string; headers?: Record<string, string>; body?: string })
  | (ScenarioNodeBase & { kind: "wait"; seconds: number })
  | (ScenarioNodeBase & { kind: "check"; expression: string })
  | (ScenarioNodeBase & { kind: "group" | "loop"; label: string; children: ScenarioNode[]; iterations?: number })
  | (Omit<ScenarioNodeBase, "span"> & { kind: "native"; span: SourceSpan; reason: string });

export interface ScenarioDocument {
  schemaVersion: 1;
  engineId: string;
  projectId: string;
  suiteId: string;
  sources: SourceDocument[];
  nodes: ScenarioNode[];
  configFiles: EngineConfigFile[];
  legacyPayload?: string;
}

export interface ParseResult {
  source: SourceDocument;
  nodes: ScenarioNode[];
  diagnostics: ScenarioDiagnostic[];
  coveredRanges: SourceSpan[];
  supportPercent: number;
}

export interface ConfigParseResult {
  source: EngineConfigFile;
  recognized: Record<string, unknown>;
  diagnostics: ScenarioDiagnostic[];
}

export interface EngineBundle {
  engineId: string;
  files: Array<{ path: string; content: string; role: "script" | "config" | "manifest" }>;
  diagnostics: ScenarioDiagnostic[];
}

export interface EngineAdapterMetadata {
  id: string;
  displayName: string;
  licenseTier: "core" | "plugin";
  sourceKinds: string[];
  configKinds: string[];
  compatibleNodeKinds: string[];
}

export function validateScenarioDocument(value: unknown): ScenarioDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || typeof document.engineId !== "string" ||
      typeof document.projectId !== "string" || typeof document.suiteId !== "string" ||
      !Array.isArray(document.sources) || !Array.isArray(document.nodes) || !Array.isArray(document.configFiles)) return null;
  const validNode = (node: unknown): node is ScenarioNode => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const item = node as Record<string, unknown>;
    if (typeof item.id !== "string" || !Array.isArray(item.engineIds) || !item.engineIds.every((id) => typeof id === "string")) return false;
    if (item.kind === "request") return typeof item.method === "string" && typeof item.url === "string";
    if (item.kind === "wait") return typeof item.seconds === "number" && Number.isFinite(item.seconds) && item.seconds >= 0;
    if (item.kind === "check") return typeof item.expression === "string";
    if (item.kind === "native") return typeof item.reason === "string" && !!item.span && typeof item.span === "object";
    if (item.kind === "group" || item.kind === "loop") return typeof item.label === "string" && Array.isArray(item.children) && item.children.every(validNode);
    return false;
  };
  if (!document.nodes.every(validNode)) return null;
  return value as ScenarioDocument;
}
