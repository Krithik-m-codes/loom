import { useEffect, useRef, useState } from "react";
import { History, Play, RefreshCw } from "lucide-react";
import { getRunHistory } from "../lib/ipc";
import type { RunRecord } from "../types";
import { LoomButton } from "./ui/LoomButton";
import { Panel, SectionHeader } from "./ui/Panel";
import { SearchInput } from "./ui/SearchInput";
import { StatusBadge, type LoomStatus } from "./ui/StatusBadge";

interface HistoryViewProps {
  onRerun: (engine: string, config: string) => void;
  refreshRevision?: number;
}

const toStatusBadge = (status: RunRecord["status"]): LoomStatus => {
  if (status === "finished") return "finished";
  if (status === "running") return "running";
  if (status === "stopped") return "stopped";
  return "failed";
};

export const HistoryView: React.FC<HistoryViewProps> = ({ onRerun, refreshRevision = 0 }) => {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const requestSequence = useRef(0);

  const loadHistory = async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const history = await getRunHistory();
      if (request === requestSequence.current) setRuns(history);
    } catch (error) {
      console.error(error);
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    return () => { requestSequence.current += 1; };
  }, [refreshRevision]);

  const filteredRuns = runs.filter((run) =>
    run.engine.toLowerCase().includes(search.toLowerCase()) ||
    run.project.toLowerCase().includes(search.toLowerCase()) ||
    run.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="loom-page loom-history">
      <header className="loom-history__header">
        <SectionHeader
          title={<span className="loom-history__title"><History aria-hidden="true" size={18} /> Run history</span>}
          description={`${runs.length} runs recorded locally in SQLite`}
          action={
            <div className="loom-history__controls">
              <SearchInput aria-label="Search runs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search runs…" />
              <LoomButton variant="secondary" onClick={loadHistory} disabled={loading}><RefreshCw aria-hidden="true" size={15} className={loading ? "pulse" : ""} /> Refresh</LoomButton>
            </div>
          }
        />
      </header>

      <div className="loom-history__body">
        <Panel className="loom-history__panel">
          {filteredRuns.length === 0 ? (
            <div className="loom-empty-state">
              <p className="loom-empty-state__title">No local run history</p>
              <p className="loom-empty-state__description">No historical runs found in database.</p>
            </div>
          ) : (
            <table className="loom-table">
              <thead><tr><th>Status</th><th>Run ID</th><th>Engine</th><th>Project</th><th>Started</th><th>Finished</th><th className="loom-table__numeric">Action</th></tr></thead>
              <tbody>{filteredRuns.map((run) => (
                <tr key={run.id}>
                  <td><StatusBadge status={toStatusBadge(run.status)} label={run.status} /></td>
                  <td className="loom-mono">{run.id.substring(0, 8)}…</td>
                  <td>{run.engine}</td>
                  <td>{run.project}</td>
                  <td>{new Date(run.started_at).toLocaleString()}</td>
                  <td>{run.finished_at ? new Date(run.finished_at).toLocaleTimeString() : "-"}</td>
                  <td className="loom-table__numeric"><LoomButton variant="ghost" onClick={() => onRerun(run.engine, run.config)}><Play aria-hidden="true" size={14} /> Re-run</LoomButton></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      </div>
    </main>
  );
};
