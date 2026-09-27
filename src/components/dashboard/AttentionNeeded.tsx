import { AlertTriangle } from "lucide-react";
import type { EngineInfo, RunRecord, TestSuite } from "../../types";
import { Panel, SectionHeader } from "../ui/Panel";

interface AttentionNeededProps {
  engines: EngineInfo[];
  suites: TestSuite[];
  recentRuns: RunRecord[];
  onNavigate: (tab: string) => void;
}

interface Issue {
  label: string;
  target: string;
}

export const AttentionNeeded = ({ engines, suites, recentRuns, onNavigate }: AttentionNeededProps) => {
  const issues: Issue[] = [
    ...engines
      .filter((engine) => "NotInstalled" in engine.availability)
      .map((engine) => ({ label: `${engine.display_name} not installed`, target: "engines" })),
    ...suites
      .filter((suite) => !suite.config?.target?.host?.trim())
      .map((suite) => ({ label: `Suite '${suite.name}' has no target`, target: "editor" })),
    ...recentRuns
      .filter((run) => run.status === "failed")
      .map((run) => ({ label: `Run ${run.id.substring(0, 8)} failed`, target: "history" })),
  ];

  return (
    <Panel className="loom-issues">
      <SectionHeader title="Attention needed" description={`${issues.length} open issue${issues.length === 1 ? "" : "s"}`} />
      {issues.length === 0 ? (
        <p className="loom-issues__empty">All clear</p>
      ) : (
        <ul className="loom-issues__list">
          {issues.map((issue) => (
            <li key={issue.label}>
              <button type="button" className="loom-issues__row" onClick={() => onNavigate(issue.target)}>
                <AlertTriangle aria-hidden="true" size={15} />
                <span>{issue.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
