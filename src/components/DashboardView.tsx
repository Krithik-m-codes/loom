import { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  Server,
  Zap,
  Play,
  FileCode2,
  Workflow,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Globe,
  Radio,
} from "lucide-react";
import { EngineInfo, RunRecord } from "../types";
import { getRunHistory } from "../lib/ipc";

interface DashboardViewProps {
  engines: EngineInfo[];
  onNavigate: (tab: string) => void;
  onSelectEngine: (id: string) => void;
  targetHost: string;
  onRerun: (engine: string, config: string) => void;
}

export const DashboardView = ({
  engines,
  onNavigate,
  onSelectEngine,
  targetHost,
  onRerun,
}: DashboardViewProps) => {
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Simulated host CPU & Memory gauges
  const [cpuUsage, setCpuUsage] = useState<number>(22);
  const [memUsage, setMemUsage] = useState<number>(41);

  useEffect(() => {
    loadRecentRuns();
    const interval = setInterval(() => {
      setCpuUsage((prev) => Math.min(85, Math.max(15, prev + (Math.random() * 6 - 3))));
      setMemUsage((prev) => Math.min(75, Math.max(30, prev + (Math.random() * 2 - 1))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadRecentRuns = async () => {
    setLoading(true);
    try {
      const runs = await getRunHistory();
      setRecentRuns(runs.slice(0, 6));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const readyEnginesCount = engines.filter((e) => "Ready" in e.availability).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-y-auto p-8 select-none">
      {/* Top Banner: Environment Context Header */}
      <div className="flex items-center justify-between pb-6 border-b border-[#26282D] mb-8">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-mono text-[#5C6068] uppercase tracking-wider mb-1.5">
            <span>Workstation Overview</span>
            <span>/</span>
            <span className="text-[#A3E635] font-semibold">Local Node</span>
          </div>
          <h1 className="text-2xl font-bold text-[#E8E9EB] tracking-tight leading-none flex items-center gap-3">
            <span>Load Test Dashboard</span>
            <span className="text-[12px] px-2.5 py-0.5 rounded-full bg-[#4ADE80]/15 text-[#4ADE80] border border-[#4ADE80]/30 font-mono font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] pulse" />
              Node Healthy
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Target Host Indicator */}
          <div className="flex items-center gap-2 px-3.5 h-[38px] rounded-[6px] bg-[#141518] border border-[#26282D] text-[13px] font-mono">
            <Globe className="w-4 h-4 text-[#A3E635]" />
            <span className="text-[#9CA0A8]">Target:</span>
            <span className="text-[#E8E9EB] font-semibold">{targetHost || "http://localhost:8080"}</span>
          </div>

          <button
            onClick={() => onNavigate("flowchart")}
            className="btn-primary h-[38px] text-[13px] px-4 gap-2 font-semibold"
          >
            <Workflow className="w-4 h-4 fill-current" />
            <span>Design Visual Flow</span>
          </button>
        </div>
      </div>

      {/* 1. System Resource Monitoring & Health Gauges */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {/* Card 1: Host CPU Usage */}
        <div className="p-5 rounded-[8px] bg-[#141518] border border-[#26282D] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-[#9CA0A8] text-[12px] font-medium font-mono">
            <span className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#A3E635]" />
              <span>HOST CPU</span>
            </span>
            <span className="text-[#A3E635] font-semibold">
              {Math.round(cpuUsage)}%
            </span>
          </div>
          <div className="my-3">
            <div className="w-full bg-[#1C1E22] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#A3E635] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(163,230,53,0.5)]"
                style={{ width: `${Math.min(100, cpuUsage)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] font-mono text-[#5C6068]">
            Subprocess isolation: <span className="text-[#9CA0A8]">Optimized</span>
          </div>
        </div>

        {/* Card 2: Memory Utilization */}
        <div className="p-5 rounded-[8px] bg-[#141518] border border-[#26282D] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-[#9CA0A8] text-[12px] font-medium font-mono">
            <span className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#38BDF8]" />
              <span>SYSTEM MEMORY</span>
            </span>
            <span className="text-[#38BDF8] font-semibold">
              {Math.round(memUsage)}%
            </span>
          </div>
          <div className="my-3">
            <div className="w-full bg-[#1C1E22] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#38BDF8] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, memUsage)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] font-mono text-[#5C6068]">
            Local SQLite buffer: <span className="text-[#9CA0A8]">Clean</span>
          </div>
        </div>

        {/* Card 3: Ready Engines */}
        <div className="p-5 rounded-[8px] bg-[#141518] border border-[#26282D] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-[#9CA0A8] text-[12px] font-medium font-mono">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#4ADE80]" />
              <span>ENGINES ACTIVE</span>
            </span>
            <span className="text-[#4ADE80] font-semibold">
              {readyEnginesCount} / {engines.length}
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#E8E9EB] leading-none">
              {readyEnginesCount} Ready
            </span>
          </div>
          <div className="text-[11px] font-mono text-[#5C6068]">
            Locust & Goose: <span className="text-[#4ADE80]">Operational</span>
          </div>
        </div>

        {/* Card 4: Total Completed Runs */}
        <div className="p-5 rounded-[8px] bg-[#141518] border border-[#26282D] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-[#9CA0A8] text-[12px] font-medium font-mono">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#F5A623]" />
              <span>STORED RUNS</span>
            </span>
            <span className="text-[#F5A623] font-semibold">
              {recentRuns.length}
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#E8E9EB] leading-none">
              {recentRuns.length} Recorded
            </span>
          </div>
          <div className="text-[11px] font-mono text-[#5C6068]">
            Database: <span className="text-[#9CA0A8]">loom.db</span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Feature Navigation Cards */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        {/* Action 1: Visual Scenario Designer */}
        <div
          onClick={() => onNavigate("flowchart")}
          className="p-6 rounded-[8px] bg-[#141518] border border-[#26282D] hover:border-[#A3E635]/60 hover:bg-[#1C1E22] transition-all cursor-pointer group flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-11 h-11 rounded-[6px] bg-[#A3E635]/10 border border-[#A3E635]/25 flex items-center justify-center text-[#A3E635] mb-4 group-hover:scale-105 transition-transform">
              <Workflow className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#E8E9EB] mb-1.5 group-hover:text-[#A3E635] transition-colors flex items-center justify-between">
              <span>Visual Flow Designer</span>
              <ArrowUpRight className="w-4 h-4 text-[#5C6068] group-hover:text-[#A3E635]" />
            </h3>
            <p className="text-[13px] text-[#9CA0A8] leading-relaxed">
              Drag & drop HTTP requests, think times, ramp-up stages, and assertions. Auto-generates Locust & k6 scripts.
            </p>
          </div>
          <div className="mt-5 pt-3.5 border-t border-[#26282D] text-[12px] font-mono text-[#A3E635] font-semibold flex items-center gap-1">
            <span>Open Canvas Flow →</span>
          </div>
        </div>

        {/* Action 2: Test Runner */}
        <div
          onClick={() => onNavigate("runner")}
          className="p-6 rounded-[8px] bg-[#141518] border border-[#26282D] hover:border-[#A3E635]/60 hover:bg-[#1C1E22] transition-all cursor-pointer group flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-11 h-11 rounded-[6px] bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] mb-4 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#E8E9EB] mb-1.5 group-hover:text-[#38BDF8] transition-colors flex items-center justify-between">
              <span>Execution & Live Telemetry</span>
              <ArrowUpRight className="w-4 h-4 text-[#5C6068] group-hover:text-[#38BDF8]" />
            </h3>
            <p className="text-[13px] text-[#9CA0A8] leading-relaxed">
              Execute tests with real-time RPS, P50/P95 latency percentiles, error tracking, and live subprocess terminal output.
            </p>
          </div>
          <div className="mt-5 pt-3.5 border-t border-[#26282D] text-[12px] font-mono text-[#38BDF8] font-semibold flex items-center gap-1">
            <span>Launch Runner →</span>
          </div>
        </div>

        {/* Action 3: Script Editor */}
        <div
          onClick={() => onNavigate("editor")}
          className="p-6 rounded-[8px] bg-[#141518] border border-[#26282D] hover:border-[#A3E635]/60 hover:bg-[#1C1E22] transition-all cursor-pointer group flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-11 h-11 rounded-[6px] bg-[#A855F7]/10 border border-[#A855F7]/25 flex items-center justify-center text-[#A855F7] mb-4 group-hover:scale-105 transition-transform">
              <FileCode2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#E8E9EB] mb-1.5 group-hover:text-[#A855F7] transition-colors flex items-center justify-between">
              <span>Script Editor & Templates</span>
              <ArrowUpRight className="w-4 h-4 text-[#5C6068] group-hover:text-[#A855F7]" />
            </h3>
            <p className="text-[13px] text-[#9CA0A8] leading-relaxed">
              Write and edit custom test scripts in Python (Locust), JavaScript (k6), or Rust (Goose) with instant disk sync.
            </p>
          </div>
          <div className="mt-5 pt-3.5 border-t border-[#26282D] text-[12px] font-mono text-[#A855F7] font-semibold flex items-center gap-1">
            <span>Open Code Editor →</span>
          </div>
        </div>
      </div>

      {/* 3. Engine Readiness Matrix */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[14px] font-bold text-[#E8E9EB] flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#A3E635]" />
            <span>Engine Adapter Readiness</span>
          </div>
          <span className="text-[11px] font-mono text-[#5C6068]">
            SUBPROCESS-ONLY PROCESS BOUNDARY
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {engines.map((eng) => {
            const isReady = "Ready" in eng.availability;
            const version = "Ready" in eng.availability ? eng.availability.Ready.version : null;
            const isPlugin = eng.license_tier === "Plugin";

            return (
              <div
                key={eng.id}
                onClick={() => {
                  onSelectEngine(eng.id);
                  onNavigate("runner");
                }}
                className="p-5 rounded-[8px] bg-[#141518] border border-[#26282D] hover:border-[#3A3D44] hover:bg-[#1C1E22] transition-all cursor-pointer flex flex-col justify-between shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-[#E8E9EB]">
                        {eng.display_name}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                          isPlugin
                            ? "bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30"
                            : "bg-[#A3E635]/10 text-[#A3E635] border border-[#A3E635]/30"
                        }`}
                      >
                        {eng.license_tier}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#5C6068] font-mono mt-1">
                      SPDX: {eng.license}
                    </div>
                  </div>

                  {isReady ? (
                    <span className="text-[12px] font-mono text-[#4ADE80] flex items-center gap-1.5 bg-[#4ADE80]/10 px-2.5 py-1 rounded border border-[#4ADE80]/25 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span className="text-[12px] font-mono text-[#F5A623] flex items-center gap-1.5 bg-[#F5A623]/10 px-2.5 py-1 rounded border border-[#F5A623]/25 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Not Installed</span>
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#26282D] flex items-center justify-between text-[12px] font-mono text-[#9CA0A8]">
                  <span className="truncate max-w-[200px]">
                    {version ? version.split(" ")[0] + " " + (version.split(" ")[1] || "") : "BYO Binary Required"}
                  </span>
                  <span className="text-[#A3E635] font-semibold hover:underline">Select →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Recent Test Runs Table */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[14px] font-bold text-[#E8E9EB] flex items-center gap-2">
            <span>Recent Test Activity</span>
            <span className="text-[12px] font-mono text-[#5C6068]">({recentRuns.length})</span>
          </div>
          <button
            onClick={loadRecentRuns}
            className="btn-ghost text-[12px] gap-1.5 text-[#9CA0A8] hover:text-[#E8E9EB]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#A3E635]" : ""}`} />
            <span>Refresh Table</span>
          </button>
        </div>

        <div className="rounded-[8px] border border-[#26282D] bg-[#141518] overflow-hidden shadow-sm">
          <table className="w-full text-left font-mono text-[12px]">
            <thead className="bg-[#1C1E22] text-[#9CA0A8] border-b border-[#26282D]">
              <tr>
                <th className="py-3.5 px-4 font-semibold">STATUS</th>
                <th className="py-3.5 px-4 font-semibold">PROJECT / SUITE</th>
                <th className="py-3.5 px-4 font-semibold">ENGINE</th>
                <th className="py-3.5 px-4 font-semibold">STARTED</th>
                <th className="py-3.5 px-4 font-semibold">FINISHED</th>
                <th className="py-3.5 px-4 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26282D] text-[#9CA0A8]">
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5C6068]">
                    No test runs logged yet. Launch a test or design a visual scenario to record data.
                  </td>
                </tr>
              ) : (
                recentRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-[#1C1E22] transition-colors">
                    <td className="py-3.5 px-4">
                      <span
                        className={`status-pill ${
                          r.status === "running"
                            ? "running"
                            : r.status === "finished"
                            ? "finished"
                            : "failed"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#E8E9EB]">{r.project}</td>
                    <td className="py-3.5 px-4 text-[#A3E635] font-semibold uppercase">{r.engine}</td>
                    <td className="py-3.5 px-4 text-[#5C6068]">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-[#5C6068]">
                      {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : "-"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onRerun(r.engine, r.config)}
                        className="btn-ghost text-[11px] px-2.5 py-1 gap-1.5 text-[#A3E635] hover:bg-[#A3E635]/15 font-semibold"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Re-run</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
