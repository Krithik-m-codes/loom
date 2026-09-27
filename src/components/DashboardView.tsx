import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  FileCode2,
  Globe,
  Play,
  Plus,
  Radio,
  RefreshCw,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";
import type { EngineInfo, Project, RunRecord } from "../types";
import { getRunHistory } from "../lib/ipc";
import { LoomButton } from "./ui/LoomButton";
import { MetricCard } from "./ui/MetricCard";
import { Panel, SectionHeader } from "./ui/Panel";
import { StatusBadge } from "./ui/StatusBadge";
import { AttentionNeeded } from "./dashboard/AttentionNeeded";
import { ProjectCards } from "./dashboard/ProjectCards";

interface DashboardViewProps {
  engines: EngineInfo[];
  refreshRevision?: number;
  onNavigate: (tab: string) => void;
  onSelectEngine: (id: string) => void;
  targetHost: string;
  onRerun: (engine: string, config: string) => void;
  projects?: Project[];
  onOpenNewProject?: () => void;
  onSelectProject?: (id: string) => void;
}

export const DashboardView = ({ engines, refreshRevision = 0, onNavigate, onSelectEngine, targetHost, onRerun, projects = [], onOpenNewProject, onSelectProject }: DashboardViewProps) => {
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);

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

  const readyEnginesCount = engines.filter((engine) => "Ready" in engine.availability).length;
  const runningRuns = recentRuns.filter((run) => run.status === "running").length;

  const allSuites = projects.flatMap((project) => project.suites);
  const hasProject = projects.length > 0;
  const hasSuite = allSuites.length > 0;
  const hasRun = recentRuns.length > 0;

  const quickstartSteps = [
    { label: "Select a project", hint: "Create or select a project to hold suites and history.", done: hasProject },
    { label: "Create a suite from a template", hint: "Add a Locust, k6, or Goose suite to the project.", done: hasSuite },
    { label: "Edit the script", hint: "Tailor requests, ramps, think time, and assertions.", done: hasSuite },
    { label: "Run the test", hint: "Launch the suite from the runner and watch live telemetry.", done: hasRun },
    { label: "Analyze results", hint: "Inspect metrics, logs, and history to compare runs.", done: hasRun },
  ];

  const runCounts: Record<string, number> = {};
  const lastStatus: Record<string, string> = {};
  for (const run of recentRuns) {
    const project = projects.find((entry) => entry.name === run.project);
    if (!project) continue;
    runCounts[project.id] = (runCounts[project.id] ?? 0) + 1;
    lastStatus[project.id] ??= run.status;
  }

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

      <section className="loom-quickstart" aria-label="Getting started">
        <SectionHeader title="Quickstart" description="Guided flow: project → suite → edit → run → analyze." />
        <ol className="loom-quickstart__steps">
          {quickstartSteps.map((step, index) => (
            <li key={step.label} className="loom-quickstart__step" data-done={step.done}>
              <span className="loom-quickstart__marker" aria-hidden="true">
                {step.done ? <Check size={14} /> : index + 1}
              </span>
              <span className="loom-quickstart__copy">
                <strong>Step {index + 1}: {step.label}</strong>
                <span>{step.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {hasProject ? (
        <section className="loom-dashboard__projects" aria-label="Projects">
          <SectionHeader title="Projects" description={`${projects.length} project${projects.length === 1 ? "" : "s"} in this workspace`} />
          <ProjectCards
            projects={projects}
            engines={engines}
            onSelectProject={onSelectProject ?? (() => {})}
            runCounts={runCounts}
            lastStatus={lastStatus}
          />
        </section>
      ) : (
        <Panel>
          <div className="loom-empty-state">
            <p className="loom-empty-state__title">No projects yet</p>
            <p className="loom-empty-state__description">Step 1: Create a project to organize suites and run history.</p>
            {onOpenNewProject && <LoomButton onClick={onOpenNewProject}><Plus aria-hidden="true" size={15} /> Create project</LoomButton>}
          </div>
        </Panel>
      )}

      <AttentionNeeded engines={engines} suites={allSuites} recentRuns={recentRuns} onNavigate={onNavigate} />

      <section className="loom-dashboard__metrics" aria-label="Current simulation metrics">
        <MetricCard label="Virtual users" value={runningRuns ? "Active" : "0"} icon={<Activity aria-hidden="true" size={16} />} footer="No active simulation" />
        <MetricCard label="Requests/sec" value="—" icon={<Zap aria-hidden="true" size={16} />} footer="Run a test to populate" />
        <MetricCard label="Avg. response time" value="—" icon={<TrendingUp aria-hidden="true" size={16} />} footer="Live telemetry unavailable" />
        <MetricCard label="Error rate" value="—" icon={<Activity aria-hidden="true" size={16} />} footer="Live telemetry unavailable" />
      </section>

      <section className="loom-dashboard__resources" aria-label="Local system resources">
        <Panel title="Local execution health" className="loom-dashboard__resource-panel">
          <div className="loom-resource-grid">
            <div className="loom-resource-summary">
              <span>Engines ready</span>
              <strong>{readyEnginesCount} / {engines.length}</strong>
              <small>Detected on your local PATH.</small>
            </div>
            <div className="loom-resource-summary">
              <span>Recent runs</span>
              <strong>{recentRuns.length}</strong>
              <small>Stored in the local run history.</small>
            </div>
            <div className="loom-resource-summary">
              <span>Local SQLite buffer</span>
              <strong>Ready</strong>
              <small>Run records persist on this machine.</small>
            </div>
          </div>
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
