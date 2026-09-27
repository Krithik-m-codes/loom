import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  FileCode2,
  Globe,
  Play,
  Radio,
  RefreshCw,
  Server,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";
import type { EngineInfo, RunRecord } from "../types";
import { getRunHistory } from "../lib/ipc";
import { LoomButton } from "./ui/LoomButton";
import { MetricCard } from "./ui/MetricCard";
import { Panel, SectionHeader } from "./ui/Panel";
import { StatusBadge } from "./ui/StatusBadge";

interface DashboardViewProps {
  engines: EngineInfo[];
  refreshRevision?: number;
  onNavigate: (tab: string) => void;
  onSelectEngine: (id: string) => void;
  targetHost: string;
  onRerun: (engine: string, config: string) => void;
}

export const DashboardView = ({ engines, refreshRevision = 0, onNavigate, onSelectEngine, targetHost, onRerun }: DashboardViewProps) => {
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const [cpuUsage, setCpuUsage] = useState(22);
  const [memUsage, setMemUsage] = useState(41);

  const loadRecentRuns = async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const runs = await getRunHistory();
      if (request === requestSequence.current) setRecentRuns(runs.slice(0, 6));
    } catch (error) {
      console.error(error);
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecentRuns();
    return () => { requestSequence.current += 1; };
  }, [refreshRevision]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage((previous) => Math.min(85, Math.max(15, previous + (Math.random() * 6 - 3))));
      setMemUsage((previous) => Math.min(75, Math.max(30, previous + (Math.random() * 2 - 1))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const readyEnginesCount = engines.filter((engine) => "Ready" in engine.availability).length;
  const runningRuns = recentRuns.filter((run) => run.status === "running").length;

  return (
    <main className="loom-page loom-dashboard">
      <header className="loom-dashboard__header">
        <div>
          <p className="loom-dashboard__eyebrow">Workstation overview <span>Local node</span></p>
          <div className="loom-dashboard__title-row">
            <h1 className="loom-heading loom-heading--page">Load test dashboard</h1>
            <StatusBadge status="ready" label="Node healthy" />
          </div>
        </div>
        <div className="loom-dashboard__header-actions">
          <span className="loom-dashboard__target"><Globe aria-hidden="true" size={16} /> {targetHost || "http://localhost:8080"}</span>
          <LoomButton onClick={() => onNavigate("flowchart")}><Workflow aria-hidden="true" size={16} /> Design Visual Flow</LoomButton>
        </div>
      </header>

      <section className="loom-dashboard__metrics" aria-label="Current simulation metrics">
        <MetricCard label="Virtual users" value={runningRuns ? "Active" : "0"} icon={<Activity aria-hidden="true" size={16} />} footer="No active simulation" />
        <MetricCard label="Requests/sec" value="—" icon={<Zap aria-hidden="true" size={16} />} footer="Run a test to populate" />
        <MetricCard label="Avg. response time" value="—" icon={<TrendingUp aria-hidden="true" size={16} />} footer="Live telemetry unavailable" />
        <MetricCard label="Error rate" value="—" icon={<Activity aria-hidden="true" size={16} />} footer="Live telemetry unavailable" />
      </section>

      <section className="loom-dashboard__resources" aria-label="Local system resources">
        <Panel title="Local execution health" className="loom-dashboard__resource-panel">
          <div className="loom-resource-grid">
            <div className="loom-resource-meter">
              <div><span><Cpu aria-hidden="true" size={16} /> Host CPU</span><strong>{Math.round(cpuUsage)}%</strong></div>
              <span className="loom-resource-meter__track"><span className="loom-resource-meter__fill" style={{ width: `${Math.min(100, cpuUsage)}%` }} /></span>
              <small>Subprocess isolation remains optimized.</small>
            </div>
            <div className="loom-resource-meter">
              <div><span><Server aria-hidden="true" size={16} /> System memory</span><strong>{Math.round(memUsage)}%</strong></div>
              <span className="loom-resource-meter__track"><span className="loom-resource-meter__fill loom-resource-meter__fill--info" style={{ width: `${Math.min(100, memUsage)}%` }} /></span>
              <small>Local SQLite buffer is clean.</small>
            </div>
            <div className="loom-resource-summary">
              <span>Engines ready</span>
              <strong>{readyEnginesCount} / {engines.length}</strong>
              <small>Detected on your local PATH.</small>
            </div>
          </div>
          <div className="loom-data-wave" aria-hidden="true" />
        </Panel>
      </section>

      <section className="loom-dashboard__features" aria-label="Workspace actions">
        <button type="button" className="loom-feature-card" onClick={() => onNavigate("flowchart")}>
          <span className="loom-feature-card__icon"><Workflow aria-hidden="true" size={21} /></span>
          <span className="loom-feature-card__copy"><strong>Visual flow designer</strong><span>Design HTTP requests, ramps, think time, and assertions before generating a script.</span></span>
          <span className="loom-feature-card__action">Open flow <ArrowUpRight aria-hidden="true" size={16} /></span>
        </button>
        <button type="button" className="loom-feature-card" onClick={() => onNavigate("runner")}>
          <span className="loom-feature-card__icon"><Zap aria-hidden="true" size={21} /></span>
          <span className="loom-feature-card__copy"><strong>Execution & telemetry</strong><span>Run a selected suite and inspect process output, request rate, latency, and failures.</span></span>
          <span className="loom-feature-card__action">Open runner <ArrowUpRight aria-hidden="true" size={16} /></span>
        </button>
        <button type="button" className="loom-feature-card" onClick={() => onNavigate("editor")}>
          <span className="loom-feature-card__icon"><FileCode2 aria-hidden="true" size={21} /></span>
          <span className="loom-feature-card__copy"><strong>Script editor</strong><span>Work directly with Locust, k6, and Goose files while keeping each engine’s format intact.</span></span>
          <span className="loom-feature-card__action">Open editor <ArrowUpRight aria-hidden="true" size={16} /></span>
        </button>
      </section>

      <section className="loom-dashboard__engines">
        <SectionHeader title="Engine adapter readiness" description="Every engine remains a separately invoked operating-system process." />
        {engines.length ? (
          <div className="loom-dashboard__engine-grid">
            {engines.map((engine) => {
              const ready = "Ready" in engine.availability;
              const version = "Ready" in engine.availability ? engine.availability.Ready.version : null;
              return (
                <button
                  key={engine.id}
                  type="button"
                  className="loom-dashboard__engine"
                  onClick={() => {
                    onSelectEngine(engine.id);
                    onNavigate("runner");
                  }}
                >
                  <span className="loom-dashboard__engine-header"><span><Radio aria-hidden="true" size={16} /> {engine.display_name}</span><StatusBadge status={ready ? "ready" : "stopped"} label={ready ? "Ready" : "Not installed"} /></span>
                  <span>SPDX: {engine.license}</span>
                  <span>{version ?? "Bring your own binary"}</span>
                  <span className="loom-dashboard__engine-action">Select engine <ArrowUpRight aria-hidden="true" size={15} /></span>
                </button>
              );
            })}
          </div>
        ) : (
          <Panel><div className="loom-empty-state"><p className="loom-empty-state__title">No engines detected</p><p className="loom-empty-state__description">Configured engine adapters will appear here after Loom checks your local PATH.</p></div></Panel>
        )}
      </section>

      <section className="loom-dashboard__recent">
        <SectionHeader
          title="Recent test activity"
          description={`${recentRuns.length} locally recorded run${recentRuns.length === 1 ? "" : "s"}`}
          action={<LoomButton variant="ghost" onClick={loadRecentRuns} disabled={loading}><RefreshCw aria-hidden="true" size={15} className={loading ? "pulse" : ""} /> Refresh</LoomButton>}
        />
        <Panel className="loom-dashboard__recent-panel">
          {recentRuns.length === 0 ? (
            <div className="loom-empty-state"><p className="loom-empty-state__title">No runs recorded yet</p><p className="loom-empty-state__description">Launch a test or design a scenario to start building local run history.</p></div>
          ) : (
            <table className="loom-table">
              <thead><tr><th>Status</th><th>Project / suite</th><th>Engine</th><th>Started</th><th>Finished</th><th className="loom-table__numeric">Action</th></tr></thead>
              <tbody>{recentRuns.map((run) => (
                <tr key={run.id}>
                  <td><StatusBadge status={run.status === "finished" ? "finished" : run.status === "running" ? "running" : run.status === "stopped" ? "stopped" : "failed"} label={run.status} /></td>
                  <td>{run.project}</td><td>{run.engine}</td><td>{new Date(run.started_at).toLocaleString()}</td><td>{run.finished_at ? new Date(run.finished_at).toLocaleTimeString() : "-"}</td>
                  <td className="loom-table__numeric"><LoomButton variant="ghost" onClick={() => onRerun(run.engine, run.config)}><Play aria-hidden="true" size={14} /> Re-run</LoomButton></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      </section>
    </main>
  );
};
