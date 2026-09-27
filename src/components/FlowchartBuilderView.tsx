import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle,
  Clock,
  Copy,
  FileCode,
  Globe,
  Layers,
  Repeat,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { LoomButton } from "./ui/LoomButton";

export interface FlowNode {
  id: string;
  type: "start" | "http" | "think_time" | "loop" | "assertion";
  title: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path?: string;
  payload?: string;
  delaySeconds?: number;
  expectedStatus?: number;
  maxLatencyMs?: number;
  iterations?: number;
  x: number;
  y: number;
}

interface FlowchartBuilderViewProps {
  onExportToRunner: (scriptContent: string, engine: string) => void;
  targetHost: string;
  suiteId?: string;
  initialNodes?: FlowNode[];
  onSaveVisualFlow?: (nodes: FlowNode[]) => void;
}

const initialNodes: FlowNode[] = [
  { id: "node-1", type: "start", title: "Test Entrypoint (Load Profile)", x: 60, y: 60 },
  { id: "node-2", type: "http", title: "Homepage Browse", method: "GET", path: "/", x: 60, y: 190 },
  { id: "node-3", type: "think_time", title: "User Reading Delay", delaySeconds: 2, x: 60, y: 320 },
  {
    id: "node-4",
    type: "http",
    title: "User Login Action",
    method: "POST",
    path: "/api/v1/auth/login",
    payload: '{"username": "test_user", "password": "secure_password"}',
    x: 60,
    y: 450,
  },
  {
    id: "node-5",
    type: "assertion",
    title: "Verify 200 OK & Latency < 400ms",
    expectedStatus: 200,
    maxLatencyMs: 400,
    x: 60,
    y: 580,
  },
];

const nodeDetails: Record<Exclude<FlowNode["type"], "start">, { label: string; detail: string; icon: typeof Globe }> = {
  http: { label: "HTTP Request", detail: "GET, POST, PUT, DELETE", icon: Globe },
  think_time: { label: "Think Time", detail: "Pause between steps", icon: Clock },
  assertion: { label: "Assertion", detail: "Status & latency", icon: CheckCircle },
  loop: { label: "Loop Block", detail: "Repeat following steps", icon: Repeat },
};

export const FlowchartBuilderView = ({ onExportToRunner, targetHost, suiteId, initialNodes: initialNodesProp, onSaveVisualFlow }: FlowchartBuilderViewProps) => {
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodesProp && initialNodesProp.length > 0 ? initialNodesProp : initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState("node-2");
  const [previewLanguage, setPreviewLanguage] = useState<"locust" | "k6">("locust");
  const [copiedScript, setCopiedScript] = useState(false);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? initialNodes[0];

  useEffect(() => {
    setNodes(initialNodesProp && initialNodesProp.length > 0 ? initialNodesProp : initialNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId]);

  const addNode = (type: Exclude<FlowNode["type"], "start">) => {
    const newY = nodes.length > 0 ? nodes[nodes.length - 1].y + 130 : 60;
    const id = `node-${Date.now()}`;
    const defaults: Record<Exclude<FlowNode["type"], "start">, Omit<FlowNode, "id" | "x" | "y">> = {
      http: { type: "http", title: "API Request", method: "GET", path: "/api/endpoint" },
      think_time: { type: "think_time", title: "Simulated Delay", delaySeconds: 1 },
      assertion: { type: "assertion", title: "Assert Status OK", expectedStatus: 200, maxLatencyMs: 500 },
      loop: { type: "loop", title: "Repeat Transaction", iterations: 3 },
    };
    setNodes((current) => [...current, { ...defaults[type], id, x: 60, y: newY }]);
    setSelectedNodeId(id);
  };

  const deleteNode = (id: string) => {
    if (nodes.length <= 1) return;
    setNodes((current) => current.filter((node) => node.id !== id));
    if (selectedNodeId === id) setSelectedNodeId((nodes[0] ?? initialNodes[0]).id);
  };

  const updateNodeProperty = (key: keyof FlowNode, value: FlowNode[keyof FlowNode]) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, [key]: value } : node));
  };

  const generateLocustCode = (): string => {
    const comment = (value: string) => value.replace(/[\r\n]/g, " ");
    const pythonString = (value: string) => JSON.stringify(value);
    const indent = (depth: number) => `${"        "}${"    ".repeat(depth)}`;
    const renderNodes = (startIndex: number, depth = 0): string => {
      let tasksCode = "";
      for (let index = startIndex; index < nodes.length; index += 1) {
        const node = nodes[index];
      if (node.type === "http") {
        const method = (node.method || "GET").toLowerCase();
        const payload = (method === "post" || method === "put") && node.payload ? `, json=json.loads(${pythonString(node.payload)})` : "";
        tasksCode += `${indent(depth)}# ${comment(node.title)}\n${indent(depth)}last_response = self.client.${method}(${pythonString(node.path || "/")}${payload}, name=${pythonString(node.title)})\n`;
      } else if (node.type === "think_time") {
        tasksCode += `${indent(depth)}# Think time: ${node.delaySeconds || 1}s\n${indent(depth)}time.sleep(${node.delaySeconds || 1})\n`;
      } else if (node.type === "assertion") {
        const missingMessage = pythonString(`${node.title}: no preceding HTTP response`);
        const statusMessage = pythonString(`${node.title}: expected ${node.expectedStatus || 200}, got `);
        const latencyMessage = pythonString(`${node.title}: response exceeded ${node.maxLatencyMs || 500}ms`);
        tasksCode += `${indent(depth)}if last_response is None:\n${indent(depth + 1)}raise AssertionError(${missingMessage})\n${indent(depth)}if last_response.status_code != ${node.expectedStatus || 200}:\n${indent(depth + 1)}raise AssertionError(${statusMessage} + str(last_response.status_code))\n${indent(depth)}if last_response.elapsed.total_seconds() * 1000 > ${node.maxLatencyMs || 500}:\n${indent(depth + 1)}raise AssertionError(${latencyMessage})\n`;
      } else if (node.type === "loop") {
        const nestedSteps = renderNodes(index + 1, depth + 1);
        tasksCode += `${indent(depth)}for _ in range(${node.iterations || 3}):\n${nestedSteps || `${indent(depth + 1)}pass\n`}`;
        return tasksCode;
      }
      }
      return tasksCode;
    };
    const tasksCode = renderNodes(0);
    return `# Generated by Loom Visual Flow Designer
# Target Host: ${comment(targetHost || "http://localhost:8080")}

import json
import time
from locust import HttpUser, task, between

class VisualFlowUser(HttpUser):
    wait_time = between(1.0, 2.5)

    @task
    def execute_flow_scenario(self):
        last_response = None
${tasksCode || '        self.client.get("/", name="Homepage")\n'}
`;
  };

  const generateK6Code = (): string => {
    const comment = (value: string) => value.replace(/[\r\n]/g, " ");
    const jsString = (value: string) => JSON.stringify(value);
    const indent = (depth: number) => `${"  "}${"  ".repeat(depth)}`;
    const renderNodes = (startIndex: number, depth = 0): string => {
      let stepsCode = "";
      for (let index = startIndex; index < nodes.length; index += 1) {
        const node = nodes[index];
      if (node.type === "http") {
        const method = (node.method || "GET").toLowerCase();
        const url = `target + ${jsString(node.path || "/")}`;
        const request = method === "get"
          ? `http.get(${url})`
          : method === "delete"
            ? `http.del(${url})`
            : `http.${method}(${url}, ${jsString(node.payload || "{}")}, { headers: { 'Content-Type': 'application/json' } })`;
        stepsCode += `${indent(depth)}// ${comment(node.title)}\n${indent(depth)}res = ${request};\n`;
      } else if (node.type === "think_time") {
        stepsCode += `${indent(depth)}sleep(${node.delaySeconds || 1});\n`;
      } else if (node.type === "assertion") {
        stepsCode += `${indent(depth)}if (!res) { throw new Error(${jsString(`${node.title}: no preceding HTTP response`)}); }\n${indent(depth)}check(res, {\n${indent(depth + 1)}${jsString(`${node.title} status`)}: (r) => r.status === ${node.expectedStatus || 200},\n${indent(depth + 1)}${jsString(`${node.title} latency`)}: (r) => r.timings.duration <= ${node.maxLatencyMs || 500},\n${indent(depth)}});\n`;
      } else if (node.type === "loop") {
        const nestedSteps = renderNodes(index + 1, depth + 1);
        stepsCode += `${indent(depth)}for (let iteration = 0; iteration < ${node.iterations || 3}; iteration += 1) {\n${nestedSteps || `${indent(depth + 1)}// Add flow steps inside this loop.\n`}${indent(depth)}}\n`;
        return stepsCode;
      }
      }
      return stepsCode;
    };
    const stepsCode = renderNodes(0);
    return `// Generated by Loom Visual Flow Designer
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '5s', target: 0 },
  ],
};

const target = __ENV.TARGET_HOST || ${jsString(targetHost || "http://localhost:8080")};

export default function () {
  let res;
${stepsCode}
}
`;
  };

  const activeGeneratedScript = previewLanguage === "locust" ? generateLocustCode() : generateK6Code();
  const copyScript = async () => {
    await navigator.clipboard.writeText(activeGeneratedScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <main className="loom-flow-builder" aria-label="Visual flow builder">
      <aside className="loom-node-palette" aria-label="Add scenario nodes">
        <p className="loom-overline">Add scenario nodes</p>
        {(Object.keys(nodeDetails) as Array<Exclude<FlowNode["type"], "start">>).map((type) => {
          const detail = nodeDetails[type];
          const Icon = detail.icon;
          return (
            <button key={type} type="button" className="loom-node-palette__button" onClick={() => addNode(type)}>
              <span className="loom-node-palette__icon"><Icon aria-hidden="true" /></span>
              <span><strong>{detail.label}</strong>{" "}<small>{detail.detail}</small></span>
            </button>
          );
        })}
        <div className="loom-node-palette__hint">
          <Sparkles aria-hidden="true" />
          <strong>Interactive graph</strong>
          <span>Nodes execute sequentially to simulate a user workflow under load.</span>
        </div>
      </aside>

      <section className="loom-canvas" aria-label="Scenario canvas">
        <div className="loom-canvas__flow">
          {nodes.map((node, index) => (
            <div className="loom-canvas__step" key={node.id}>
              <div className="loom-canvas__node-row">
                <button
                  type="button"
                  className={`loom-node ${selectedNodeId === node.id ? "loom-node--selected" : ""}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  aria-label={`Select ${node.title}`}
                  aria-pressed={selectedNodeId === node.id}
                >
                  <span className="loom-node__title">
                    {node.type === "start" && <span className="loom-node__start-dot" aria-hidden="true" />}
                    {node.type === "http" && <span className="loom-node__method">{node.method || "GET"}</span>}
                    {node.type === "think_time" && <Clock aria-hidden="true" />}
                    {node.type === "assertion" && <CheckCircle aria-hidden="true" />}
                    {node.type === "loop" && <Repeat aria-hidden="true" />}
                    <strong>{node.title}</strong>
                  </span>
                  <span className="loom-node__detail">
                    {node.type === "http" && (node.path || "/")}
                    {node.type === "think_time" && `Wait ${node.delaySeconds || 1}s delay`}
                    {node.type === "assertion" && `Status == ${node.expectedStatus || 200}, <${node.maxLatencyMs || 500}ms`}
                    {node.type === "loop" && `Repeats following steps ${node.iterations || 3} times`}
                    {node.type === "start" && "Concurrent load profile generator"}
                  </span>
                </button>
                {node.type !== "start" && (
                  <button type="button" className="loom-icon-button loom-node__delete" onClick={() => deleteNode(node.id)} aria-label={`Delete ${node.title}`}>
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
              {index < nodes.length - 1 && <span className="loom-canvas__connector" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <aside className="loom-flow-inspector" aria-label="Step inspector">
        <header className="loom-flow-inspector__header">
          <span><Layers aria-hidden="true" /> Step inspector</span>
          <LoomButton className="loom-button--compact" onClick={() => onSaveVisualFlow?.(nodes)}>
            Save flow
          </LoomButton>
          <LoomButton className="loom-button--compact" onClick={() => onExportToRunner(activeGeneratedScript, previewLanguage)}>
            <Send aria-hidden="true" /> Send to Runner
          </LoomButton>
        </header>
        <section className="loom-flow-inspector__fields">
          <label className="loom-form-field">Step title
            <input value={selectedNode.title} onChange={(event) => updateNodeProperty("title", event.target.value)} />
          </label>
          {selectedNode.type === "http" && <>
            <label className="loom-form-field">Method
              <select value={selectedNode.method || "GET"} onChange={(event) => updateNodeProperty("method", event.target.value as FlowNode["method"])}>
                <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option>
              </select>
            </label>
            <label className="loom-form-field">Endpoint path
              <input value={selectedNode.path || "/"} placeholder="/api/v1/..." onChange={(event) => updateNodeProperty("path", event.target.value)} />
            </label>
            {(selectedNode.method === "POST" || selectedNode.method === "PUT") && <label className="loom-form-field">JSON payload
              <textarea rows={3} value={selectedNode.payload || "{}"} onChange={(event) => updateNodeProperty("payload", event.target.value)} />
            </label>}
          </>}
          {selectedNode.type === "think_time" && <label className="loom-form-field">Delay duration (seconds)
            <input type="number" min="0.1" step="0.5" value={selectedNode.delaySeconds || 1} onChange={(event) => updateNodeProperty("delaySeconds", Number(event.target.value) || 1)} />
          </label>}
          {selectedNode.type === "assertion" && <div className="loom-form-field-row">
            <label className="loom-form-field">Status code
              <input type="number" value={selectedNode.expectedStatus || 200} onChange={(event) => updateNodeProperty("expectedStatus", Number(event.target.value) || 200)} />
            </label>
            <label className="loom-form-field">Max latency (ms)
              <input type="number" value={selectedNode.maxLatencyMs || 500} onChange={(event) => updateNodeProperty("maxLatencyMs", Number(event.target.value) || 500)} />
            </label>
          </div>}
          {selectedNode.type === "loop" && <label className="loom-form-field">Iterations
            <input type="number" min="1" value={selectedNode.iterations || 3} onChange={(event) => updateNodeProperty("iterations", Number(event.target.value) || 1)} />
          </label>}
        </section>
        <section className="loom-code-preview" aria-label="Generated code">
          <header className="loom-code-preview__header">
            <span><FileCode aria-hidden="true" /> Generated code</span>
            <div className="loom-code-preview__controls">
              <button type="button" className={previewLanguage === "locust" ? "is-active" : ""} onClick={() => setPreviewLanguage("locust")}>Python (Locust)</button>
              <button type="button" className={previewLanguage === "k6" ? "is-active" : ""} onClick={() => setPreviewLanguage("k6")}>JS (k6)</button>
              <button type="button" className="loom-code-preview__copy" onClick={copyScript} aria-label="Copy generated code">
                {copiedScript ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copiedScript ? "Copied" : "Copy"}
              </button>
            </div>
          </header>
          <pre>{activeGeneratedScript}</pre>
        </section>
      </aside>
    </main>
  );
};
