import { useState, useEffect } from "react";
import { History, RefreshCw, Search, Play } from "lucide-react";
import { getRunHistory } from "../lib/ipc";
import { RunRecord } from "../types";

interface HistoryViewProps {
  onRerun: (engine: string, config: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onRerun }) => {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");

  const loadHistory = async () => {
    setLoading(true);
    try {
      const list = await getRunHistory();
      setRuns(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredRuns = runs.filter(
    (r) =>
      r.engine.toLowerCase().includes(search.toLowerCase()) ||
      r.project.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-hidden">
      {/* History Header */}
      <div className="h-[52px] bg-[#141518] border-b border-[#26282D] px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-[#A3E635]" />
          <span className="font-bold text-[14px] text-[#E8E9EB]">Run History</span>
          <span className="text-[12px] font-mono text-[#5C6068] ml-2">
            ({runs.length} runs recorded in SQLite)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#1C1E22] border border-[#26282D] rounded-[6px] px-3 py-1.5 gap-2 text-[12px] focus-within:border-[#A3E635]">
            <Search className="w-3.5 h-3.5 text-[#5C6068]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search runs..."
              className="bg-transparent text-[#E8E9EB] outline-none w-[180px] font-mono"
            />
          </div>

          <button
            onClick={loadHistory}
            disabled={loading}
            className="btn-secondary h-[34px] text-[12px] px-3 gap-1.5"
            title="Refresh History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#A3E635]" : "text-[#9CA0A8]"}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded-[8px] border border-[#26282D] bg-[#141518] overflow-hidden shadow-sm">
          <table className="w-full text-left font-mono text-[12.5px]">
            <thead className="bg-[#1C1E22] text-[#9CA0A8] border-b border-[#26282D]">
              <tr>
                <th className="py-3.5 px-4 font-semibold">STATUS</th>
                <th className="py-3.5 px-4 font-semibold">RUN ID</th>
                <th className="py-3.5 px-4 font-semibold">ENGINE</th>
                <th className="py-3.5 px-4 font-semibold">PROJECT</th>
                <th className="py-3.5 px-4 font-semibold">STARTED</th>
                <th className="py-3.5 px-4 font-semibold">FINISHED</th>
                <th className="py-3.5 px-4 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26282D] text-[#9CA0A8]">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-[#5C6068]">
                    No historical runs found in database.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((r) => {
                  const isFinished = r.status === "finished";
                  const isRunning = r.status === "running";
                  return (
                    <tr key={r.id} className="hover:bg-[#1C1E22] transition-colors">
                      <td className="py-3.5 px-4">
                        <span
                          className={`status-pill ${
                            isRunning
                              ? "running"
                              : isFinished
                              ? "finished"
                              : "failed"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[#E8E9EB] font-medium">{r.id.substring(0, 8)}...</td>
                      <td className="py-3.5 px-4 text-[#A3E635] font-bold uppercase">{r.engine}</td>
                      <td className="py-3.5 px-4 text-[#E8E9EB]">{r.project}</td>
                      <td className="py-3.5 px-4 text-[#5C6068] text-[12px]">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-[#5C6068] text-[12px]">
                        {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onRerun(r.engine, r.config)}
                          className="btn-ghost text-[11px] px-3 py-1 gap-1.5 text-[#A3E635] hover:bg-[#A3E635]/15 font-semibold"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Re-run</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
