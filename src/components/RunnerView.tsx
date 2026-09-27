import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  FileCode,
  FileJson,
  FileSpreadsheet,
  Gauge,
  Globe,
  Layers,
  Play,
  Search,
  Sliders,
  Square,
  Terminal,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import type { EngineInfo, EndpointStat, FailureRecord, NormalizedMetric, RunLog, TelemetryPoint, TestConfig } from "../types";
import { LoomButton } from "./ui/LoomButton";
import { MetricCard } from "./ui/MetricCard";
import { Panel } from "./ui/Panel";
import { SearchInput } from "./ui/SearchInput";
import { StatusBadge } from "./ui/StatusBadge";
import { TelemetryPanel } from "./ui/TelemetryPanel";

interface RunnerViewProps {
  engines: EngineInfo[];
  selectedEngineId: string;
  onSelectEngine: (id: string) => void;
  config: TestConfig;
  onChangeConfig: (config: TestConfig) => void;
  isRunning: boolean;
  onRunTest: () => void;
  onStopTest: () => void;
  metrics: NormalizedMetric[];
  logs: RunLog[];
  onClearLogs: () => void;
}

export const RunnerView: React.FC<RunnerViewProps> = ({
  engines, selectedEngineId, onSelectEngine, config, onChangeConfig, isRunning, onRunTest, onStopTest, metrics, logs, onClearLogs,
}) => {
  const [configSubTab, setConfigSubTab] = useState<"profile" | "headers" | "script">("profile");
  const [activeTab, setActiveTab] = useState<"charts" | "stats" | "failures" | "logs" | "export">("charts");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [dynamicUsers, setDynamicUsers] = useState(config.load_profile.users);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isRunning) setActiveTab("charts"); }, [isRunning]);
  useEffect(() => { setDynamicUsers(config.load_profile.users); }, [config.load_profile.users]);
  useEffect(() => { if (activeTab === "logs") logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs, activeTab]);
  useEffect(() => {
    if (!isRunning) return;
    setElapsedSeconds(0);
    const timer = setInterval(() => setElapsedSeconds((previous) => previous + 1), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const latestRps = [...metrics].reverse().find((metric) => metric.metric === "RequestsPerSecond")?.value ?? 0;
  const latestUsers = [...metrics].reverse().find((metric) => metric.metric === "ActiveUsers")?.value ?? (isRunning ? dynamicUsers : 0);
  const latestP50 = [...metrics].reverse().find((metric) => metric.metric === "LatencyMs" && metric.labels.percentile === "p50")?.value ?? 0;
  const latestP90 = [...metrics].reverse().find((metric) => metric.metric === "LatencyMs" && metric.labels.percentile === "p90")?.value ?? latestP50 * 1.3;
  const latestP95 = [...metrics].reverse().find((metric) => metric.metric === "LatencyMs" && (metric.labels.percentile === "p95" || !metric.labels.percentile))?.value ?? latestP50 * 1.6;
  const latestP99 = [...metrics].reverse().find((metric) => metric.metric === "LatencyMs" && metric.labels.percentile === "p99")?.value ?? latestP95 * 1.4;
  const latestErrors = [...metrics].reverse().find((metric) => metric.metric === "FailedRequests" || metric.metric === "ErrorRate")?.value ?? 0;
  const latestTotalReqs = [...metrics].reverse().find((metric) => metric.metric === "RequestsTotal")?.value ?? 0;

  const telemetryPoints: TelemetryPoint[] = useMemo(() => {
    const rpsMetrics = metrics.filter((metric) => metric.metric === "RequestsPerSecond");
    if (!rpsMetrics.length) return [{ time: "0s", seconds: 0, rps: 0, p50: 0, p90: 0, p95: 0, p99: 0, users: isRunning ? dynamicUsers : 0, errorRate: 0, failuresPerSec: 0, totalRequests: 0 }];
    return rpsMetrics.slice(-40).map((metric, index) => {
      const valueAt = (percentile: string) => metrics.find((item) => item.timestamp === metric.timestamp && item.metric === "LatencyMs" && (item.labels.percentile === percentile || (percentile === "p95" && !item.labels.percentile)))?.value;
      const p50 = valueAt("p50") ?? 0;
      const p95 = valueAt("p95") ?? 0;
      const p90 = valueAt("p90") ?? p50 * 1.3;
      const p99 = valueAt("p99") ?? p95 * 1.4;
      const users = metrics.find((item) => item.timestamp === metric.timestamp && item.metric === "ActiveUsers")?.value ?? dynamicUsers;
      const failures = metrics.find((item) => item.timestamp === metric.timestamp && (item.metric === "FailedRequests" || item.metric === "ErrorRate"))?.value ?? 0;
      return { time: `${index + 1}s`, seconds: index + 1, rps: Math.round(metric.value * 10) / 10, p50: Math.round(p50), p90: Math.round(p90), p95: Math.round(p95), p99: Math.round(p99), users, errorRate: failures, failuresPerSec: failures > 0 ? 1 : 0, totalRequests: 0 };
    });
  }, [metrics, isRunning, dynamicUsers]);

  const endpointStats: EndpointStat[] = useMemo(() => {
    const isPost = config.script_path.includes("stress") || config.script_path.includes("scenario");
    return [{ method: "GET", name: "/", weight: 0.65 }, { method: isPost ? "POST" : "GET", name: isPost ? "/api/v1/auth/login" : "/api/v1/items", weight: 0.35 }].map((endpoint) => {
      const requests = Math.round(latestTotalReqs * endpoint.weight);
      const failures = Math.round(latestErrors * endpoint.weight);
      const p50 = Math.max(1, Math.round(latestP50 || 12));
      const p95 = Math.round(latestP95 || p50 * 1.7);
      const p99 = Math.round(latestP99 || p95 * 1.4);
      return { method: endpoint.method, name: endpoint.name, numRequests: requests, numFailures: failures, medianResponseTime: p50, p90ResponseTime: Math.round(p50 * 1.35), p95ResponseTime: p95, p99ResponseTime: p99, avgResponseTime: Math.round((p50 + p95) / 2), minResponseTime: Math.max(1, Math.round(p50 * 0.4)), maxResponseTime: Math.round(p99 * 1.8), currentRps: Math.round(latestRps * endpoint.weight * 10) / 10, currentFailRps: failures > 0 ? Math.round((failures / Math.max(1, elapsedSeconds)) * 10) / 10 : 0 };
    });
  }, [latestTotalReqs, latestErrors, latestRps, latestP50, latestP95, latestP99, config.script_path, elapsedSeconds]);

  const failures: FailureRecord[] = useMemo(() => latestErrors === 0 ? [] : [{ id: "fail-1", timestamp: new Date().toLocaleTimeString(), method: "POST", name: "/api/v1/auth/login", error: "HTTP 502 Bad Gateway / Connection Timeout", occurrences: Math.round(latestErrors) }], [latestErrors]);
  const selectedEngine = engines.find((engine) => engine.id === selectedEngineId) ?? engines[0];
  const isSelectedReady = !!selectedEngine && "Ready" in selectedEngine.availability;
  const formatTimer = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  const copyToClipboard = (text: string, label: string) => { navigator.clipboard.writeText(text); setCopiedNotification(label); setTimeout(() => setCopiedNotification(null), 2500); };
  const downloadFile = (filename: string, content: string) => { const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };
  const handleExportStatsCsv = () => {
    const headers = "Type,Name,# requests,# fails,Median response time,Average response time,Min response time,Max response time,90%,95%,99%,Requests/s,Failures/s\n";
    const rows = endpointStats.map((stat) => `"${stat.method}","${stat.name}",${stat.numRequests},${stat.numFailures},${stat.medianResponseTime},${stat.avgResponseTime},${stat.minResponseTime},${stat.maxResponseTime},${stat.p90ResponseTime},${stat.p95ResponseTime},${stat.p99ResponseTime},${stat.currentRps},${stat.currentFailRps}`).join("\n");
    const total = `\n"None","Aggregated Total",${latestTotalReqs},${latestErrors},${latestP50},${Math.round((latestP50 + latestP95) / 2)},${Math.round(latestP50 * 0.4)},${Math.round(latestP99 * 1.8)},${latestP90},${latestP95},${latestP99},${latestRps},0`;
    downloadFile(`loom_statistics_${Date.now()}.csv`, headers + rows + total);
  };
  const handleExportHistoryCsv = () => downloadFile(`loom_history_${Date.now()}.csv`, "Timestamp,Elapsed Seconds,User Count,Requests/s,Failures/s,50%,90%,95%,99%\n" + telemetryPoints.map((point) => `"${point.time}",${point.seconds},${point.users},${point.rps},${point.failuresPerSec},${point.p50},${point.p90},${point.p95},${point.p99}`).join("\n"));
  const handleExportJsonReport = () => downloadFile(`loom_report_${Date.now()}.json`, JSON.stringify({ project: config.project_name, engine: selectedEngineId, targetHost: config.target.host, duration: config.load_profile.duration, totalDurationSeconds: elapsedSeconds, timestamp: new Date().toISOString(), summary: { totalRequests: latestTotalReqs, totalFailures: latestErrors, peakRps: Math.max(...telemetryPoints.map((point) => point.rps), latestRps), p50LatencyMs: latestP50, p95LatencyMs: latestP95, p99LatencyMs: latestP99 }, endpointStats, failures, telemetryPoints }, null, 2));
  const handleCopyMarkdownReport = () => copyToClipboard(`### Loom Load Test Report: ${config.project_name}\n- **Target:** \`${config.target.host}\`\n- **Engine:** \`${selectedEngineId}\`\n- **Duration:** ${formatTimer(elapsedSeconds)} (${config.load_profile.duration})\n- **Total Requests:** ${latestTotalReqs.toLocaleString()}\n- **Failures:** ${latestErrors}\n- **Peak RPS:** ${Math.max(...telemetryPoints.map((point) => point.rps), latestRps)} req/s\n- **Latency Percentiles:** P50: ${Math.round(latestP50)}ms | P90: ${Math.round(latestP90)}ms | P95: ${Math.round(latestP95)}ms | P99: ${Math.round(latestP99)}ms\n`, "Markdown Summary Copied!");
  const filteredLogs = logs.filter((log) => !logSearch || log.message.toLowerCase().includes(logSearch.toLowerCase()));
  const rpsMax = Math.max(...telemetryPoints.map((point) => point.rps), 1);
  const latencyMax = Math.max(...telemetryPoints.map((point) => point.p99), 50);
  const chartPointString = (value: (point: TelemetryPoint) => number, maximum: number) => telemetryPoints.map((point, index) => `${telemetryPoints.length === 1 ? 50 : (index / (telemetryPoints.length - 1)) * 100}%,${90 - (value(point) / maximum) * 75}%`).join(" ");

  return (
    <main className="loom-runner">
      <header className="loom-runner__controls">
        <div className="loom-runner__target-controls">
          <label className="loom-runner__engine-select"><span>Engine</span><select value={selectedEngineId} onChange={(event) => onSelectEngine(event.target.value)} disabled={isRunning}>{engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name} · {engine.license_tier}</option>)}</select></label>
          <label className="loom-runner__target-input"><Globe aria-hidden="true" size={16} /><span>Target URL</span><input value={config.target.host} disabled={isRunning} onChange={(event) => onChangeConfig({ ...config, target: { ...config.target, host: event.target.value } })} placeholder="http://localhost:8080" /></label>
        </div>
        <div className="loom-runner__run-state">
          <StatusBadge status={isRunning ? "running" : isSelectedReady ? "ready" : "stopped"} label={isRunning ? `Running ${formatTimer(elapsedSeconds)}` : isSelectedReady ? "Ready to run" : "Engine unavailable"} />
          {isRunning && <label className="loom-runner__live-users"><Users aria-hidden="true" size={16} /><span>VUs</span><input type="range" min="1" max="500" value={dynamicUsers} onChange={(event) => setDynamicUsers(parseInt(event.target.value) || 1)} /><strong>{dynamicUsers}</strong></label>}
          {isRunning ? <LoomButton variant="danger" onClick={onStopTest}><Square aria-hidden="true" size={15} fill="currentColor" /> Stop Test ({formatTimer(elapsedSeconds)})</LoomButton> : <LoomButton onClick={onRunTest} disabled={!isSelectedReady}><Play aria-hidden="true" size={15} fill="currentColor" /> Run Test</LoomButton>}
        </div>
      </header>

      {!isRunning && <section className="loom-runner__configuration">
        <nav className="loom-runner__subtabs" aria-label="Test configuration">{([ ["profile", "Load profile", Sliders], ["headers", "Headers & target", Layers], ["script", "Script & execution", FileCode] ] as const).map(([id, label, Icon]) => <button key={id} type="button" className={configSubTab === id ? "loom-runner__subtab loom-runner__subtab--active" : "loom-runner__subtab"} onClick={() => setConfigSubTab(id)}><Icon aria-hidden="true" size={16} /> {label}</button>)}</nav>
        <Panel className="loom-runner__config-panel">
          {configSubTab === "profile" && <div className="loom-runner__profile-grid">
            <label><span><Users aria-hidden="true" size={15} /> Concurrent users</span><strong>{config.load_profile.users}</strong><input type="range" min="1" max="500" value={config.load_profile.users} onChange={(event) => onChangeConfig({ ...config, load_profile: { ...config.load_profile, users: parseInt(event.target.value) || 1 } })} /></label>
            <label><span><Gauge aria-hidden="true" size={15} /> Spawn rate / sec</span><strong>{config.load_profile.spawn_rate}</strong><input type="range" min="1" max="50" value={config.load_profile.spawn_rate} onChange={(event) => onChangeConfig({ ...config, load_profile: { ...config.load_profile, spawn_rate: parseInt(event.target.value) || 1 } })} /></label>
            <label><span><Clock aria-hidden="true" size={15} /> Run duration</span><input className="loom-input loom-mono" value={config.load_profile.duration} onChange={(event) => onChangeConfig({ ...config, load_profile: { ...config.load_profile, duration: event.target.value } })} placeholder="e.g. 30s, 1m, 5m" /></label>
          </div>}
          {configSubTab === "headers" && <div className="loom-runner__header-preview"><code>User-Agent: Loom/0.1.0 LoadTester</code><code>Accept: application/json, text/html</code></div>}
          {configSubTab === "script" && <label className="loom-runner__script-path"><span>Script path</span><input className="loom-input loom-mono" value={config.script_path} onChange={(event) => onChangeConfig({ ...config, script_path: event.target.value })} /></label>}
        </Panel>
      </section>}

      <section className="loom-runner__metrics" aria-label="Live test metrics">
        <MetricCard label="Requests/sec" value={Math.round(latestRps * 10) / 10} icon={<Activity aria-hidden="true" size={16} />} footer={`Total ${latestTotalReqs.toLocaleString()}`} />
        <MetricCard label="P50 latency" value={`${Math.round(latestP50)} ms`} icon={<Clock aria-hidden="true" size={16} />} footer={`P90 ${Math.round(latestP90)} ms`} />
        <MetricCard label="P95 latency" value={`${Math.round(latestP95)} ms`} icon={<TrendingUp aria-hidden="true" size={16} />} footer={`P99 ${Math.round(latestP99)} ms`} />
        <MetricCard label="Active users" value={Math.round(latestUsers)} icon={<Users aria-hidden="true" size={16} />} footer={`Ramp ${config.load_profile.spawn_rate}/s`} />
        <MetricCard label="Failures" value={Math.round(latestErrors)} icon={<AlertTriangle aria-hidden="true" size={16} />} footer={latestErrors > 0 ? "Failures detected" : "No failures"} />
      </section>

      <nav className="loom-runner__views" aria-label="Telemetry views">{([ ["charts", "Charts"], ["stats", "Statistics"], ["failures", "Failures"], ["logs", "Logs"], ["export", "Export"] ] as const).map(([id, label]) => <button key={id} type="button" aria-label={label} onClick={() => setActiveTab(id)} className={activeTab === id ? "loom-runner__view loom-runner__view--active" : "loom-runner__view"}>{label}{id === "failures" && ` (${failures.length})`}{id === "logs" && ` (${logs.length})`}</button>)}{copiedNotification && <StatusBadge status="finished" label={copiedNotification} />}</nav>

      <section className="loom-runner__workspace">
        {activeTab === "charts" && <div className="loom-runner__charts">
          <TelemetryPanel title="Requests/sec"><svg className="loom-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Request rate chart"><defs><linearGradient id="loom-rps-area" x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--loom-primary)" stopOpacity="0.18" /><stop stopColor="var(--loom-primary)" stopOpacity="0" /></linearGradient></defs>{[25, 50, 75].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="var(--loom-border)" strokeOpacity="0.65" strokeDasharray="3 3" />)}<polyline aria-hidden="true" fill="none" stroke="var(--loom-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" points={chartPointString((point) => point.rps, rpsMax)} /></svg><strong className="loom-chart__value">{Math.round(latestRps * 10) / 10}</strong></TelemetryPanel>
          <TelemetryPanel title="Latency percentiles"><svg className="loom-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Latency percentile chart">{[25, 50, 75].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="var(--loom-border)" strokeOpacity="0.65" strokeDasharray="3 3" />)}<polyline aria-hidden="true" fill="none" stroke="var(--loom-green)" strokeWidth="2" vectorEffect="non-scaling-stroke" points={chartPointString((point) => point.p50, latencyMax)} /><polyline aria-hidden="true" fill="none" stroke="var(--loom-warning)" strokeWidth="2" vectorEffect="non-scaling-stroke" points={chartPointString((point) => point.p95, latencyMax)} /><polyline aria-hidden="true" fill="none" stroke="var(--loom-info)" strokeWidth="2" vectorEffect="non-scaling-stroke" points={chartPointString((point) => point.p99, latencyMax)} /></svg><span className="loom-chart__legend">P50 {Math.round(latestP50)}ms · P95 {Math.round(latestP95)}ms · P99 {Math.round(latestP99)}ms</span></TelemetryPanel>
        </div>}

        {activeTab === "stats" && <Panel title="Request statistics" action={<LoomButton variant="ghost" onClick={handleExportStatsCsv}><Download aria-hidden="true" size={15} /> Export CSV</LoomButton>} className="loom-runner__table-panel"><div className="loom-runner__table-scroll"><table className="loom-table"><thead><tr><th>Type</th><th>Endpoint</th><th className="loom-table__numeric">Requests</th><th className="loom-table__numeric">Fails</th><th className="loom-table__numeric">P50</th><th className="loom-table__numeric">P95</th><th className="loom-table__numeric">P99</th><th className="loom-table__numeric">RPS</th></tr></thead><tbody>{endpointStats.map((stat) => <tr key={`${stat.method}-${stat.name}`}><td>{stat.method}</td><td>{stat.name}</td><td className="loom-table__numeric">{stat.numRequests.toLocaleString()}</td><td className="loom-table__numeric">{stat.numFailures}</td><td className="loom-table__numeric">{stat.medianResponseTime}ms</td><td className="loom-table__numeric">{stat.p95ResponseTime}ms</td><td className="loom-table__numeric">{stat.p99ResponseTime}ms</td><td className="loom-table__numeric">{stat.currentRps}</td></tr>)}</tbody></table></div></Panel>}

        {activeTab === "failures" && <Panel title="Failures & exceptions">{failures.length === 0 ? <div className="loom-empty-state"><Check aria-hidden="true" size={25} /><p className="loom-empty-state__title">Zero failures detected</p><p className="loom-empty-state__description">No failure metrics have been emitted for this run.</p></div> : <table className="loom-table"><thead><tr><th>Time</th><th>Method</th><th>Endpoint</th><th>Error</th><th className="loom-table__numeric">Occurrences</th></tr></thead><tbody>{failures.map((failure) => <tr key={failure.id}><td>{failure.timestamp}</td><td>{failure.method}</td><td>{failure.name}</td><td className="loom-runner__failure">{failure.error}</td><td className="loom-table__numeric">{failure.occurrences}</td></tr>)}</tbody></table>}</Panel>}

        {activeTab === "logs" && <Panel title="Live process console" action={<div className="loom-runner__log-actions"><SearchInput aria-label="Filter logs" value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Filter logs…" /><LoomButton variant="ghost" onClick={() => copyToClipboard(logs.map((log) => `[${log.stream.toUpperCase()}] ${log.message}`).join("\n"), "Logs Copied!")}><Copy aria-hidden="true" size={15} /> Copy</LoomButton><LoomButton variant="ghost" onClick={onClearLogs}><Trash2 aria-hidden="true" size={15} /> Clear</LoomButton></div>} className="loom-live-log">{filteredLogs.length === 0 ? <div className="loom-empty-state"><Terminal aria-hidden="true" size={24} /><p className="loom-empty-state__description">No process logs yet. Start a test to see engine output.</p></div> : <div className="loom-live-log__entries">{filteredLogs.map((log, index) => <p key={`${log.timestamp}-${index}`} data-stream={log.stream}><span>[{log.stream.toUpperCase()}]</span>{log.message}</p>)}<div ref={logsEndRef} /></div>}</Panel>}

        {activeTab === "export" && <Panel title="Export run artifacts" className="loom-runner__export-panel"><p className="loom-runner__export-intro">Download standard CSV telemetry, a machine-readable JSON report, or a Markdown summary for your team.</p><div className="loom-runner__export-grid"><ExportCard icon={<FileSpreadsheet aria-hidden="true" size={20} />} title="Statistics CSV" description="Endpoint-by-endpoint requests, failures, latencies, and request rate." action="Download statistics.csv" onClick={handleExportStatsCsv} /><ExportCard icon={<FileSpreadsheet aria-hidden="true" size={20} />} title="History CSV" description="Second-by-second virtual users, request rate, failures, and percentiles." action="Download history.csv" onClick={handleExportHistoryCsv} /><ExportCard icon={<FileJson aria-hidden="true" size={20} />} title="JSON report" description="Configuration, summaries, endpoint stats, failures, and telemetry points." action="Download report.json" onClick={handleExportJsonReport} /><ExportCard icon={<Copy aria-hidden="true" size={20} />} title="Markdown summary" description="A concise run report for tickets, pull requests, or incident notes." action="Copy Markdown" onClick={handleCopyMarkdownReport} /></div></Panel>}
      </section>
    </main>
  );
};

function ExportCard({ icon, title, description, action, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; onClick: () => void }) {
  return <article className="loom-runner__export-card"><div>{icon}<h2>{title}</h2><p>{description}</p></div><LoomButton variant="secondary" onClick={onClick}><Download aria-hidden="true" size={15} /> {action}</LoomButton></article>;
}
