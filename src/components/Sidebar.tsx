import { useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  Zap,
  FileCode2,
  Settings,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  History,
  Terminal,
  Cpu,
  Plus,
  Layers,
} from "lucide-react";
import { EngineInfo, Project } from "../types";
import { LoomLogo } from "./LoomLogo";

interface SidebarProps {
  engines: EngineInfo[];
  selectedEngineId: string;
  onSelectEngine: (id: string) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenCmdk: () => void;
  isRunning: boolean;
  selectedScript: string;
  onSelectScript: (script: string, engine: string) => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenNewProject: () => void;
}

export const Sidebar = ({
  engines,
  selectedEngineId,
  onSelectEngine,
  activeTab,
  onSelectTab,
  onOpenCmdk,
  isRunning,
  selectedScript,
  onSelectScript,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewProject,
}: SidebarProps) => {
  const [samplesExpanded, setSamplesExpanded] = useState(true);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  return (
    <aside className="w-[270px] min-w-[270px] h-full bg-[#141518] border-r border-[#26282D] flex flex-col select-none text-[13.5px]">
      {/* App Workspace Banner with New Loom Logo */}
      <div className="h-[56px] px-4 border-b border-[#26282D] flex items-center justify-between bg-[#141518]">
        <LoomLogo size={30} showText={true} />

        {isRunning && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5A623]/15 border border-[#F5A623]/30 text-[#F5A623] text-[11px] font-mono font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#F5A623] pulse" />
            <span>RUNNING</span>
          </div>
        )}
      </div>

      {/* Workspace / Active Project Switcher */}
      <div className="p-3 border-b border-[#26282D] bg-[#141518]">
        <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C6068] mb-1.5 px-1">
          <span>Active Project</span>
          <button
            onClick={onOpenNewProject}
            className="flex items-center gap-1 text-[#A3E635] hover:text-[#B4F04A] transition-colors"
            title="Create New Project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="w-full h-[36px] px-3 rounded-[6px] bg-[#1C1E22] border border-[#26282D] hover:border-[#3A3D44] flex items-center justify-between text-left text-[13px] text-[#E8E9EB] font-medium transition-all shadow-sm"
          >
            <div className="flex items-center gap-2 truncate">
              <Layers className="w-4 h-4 text-[#A3E635] shrink-0" />
              <span className="truncate">{activeProject?.name || "Default Project"}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#9CA0A8] shrink-0 ml-1" />
          </button>

          {/* Project Dropdown Menu */}
          {projectMenuOpen && (
            <div className="absolute top-[40px] left-0 right-0 z-30 bg-[#1C1E22] border border-[#26282D] rounded-[6px] shadow-xl p-1 flex flex-col gap-0.5 animate-in fade-in duration-100">
              {projects.map((proj) => {
                const isSelected = proj.id === activeProject?.id;
                return (
                  <button
                    key={proj.id}
                    onClick={() => {
                      onSelectProject(proj.id);
                      setProjectMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[4px] text-[12.5px] truncate flex items-center justify-between ${
                      isSelected
                        ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold"
                        : "text-[#E8E9EB] hover:bg-[#26282D]"
                    }`}
                  >
                    <span className="truncate">{proj.name}</span>
                    <span className="text-[10px] font-mono text-[#5C6068]">
                      {proj.suites.length} suites
                    </span>
                  </button>
                );
              })}

              <div className="border-t border-[#26282D] mt-1 pt-1">
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    onOpenNewProject();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-[4px] text-[12px] text-[#A3E635] hover:bg-[#A3E635]/15 flex items-center gap-1.5 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Project...</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <div className="p-3 border-b border-[#26282D] flex flex-col gap-1">
        <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C6068] px-2.5 py-1">
          Platform
        </div>

        <button
          onClick={() => onSelectTab("dashboard")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-left transition-all ${
            activeTab === "dashboard"
              ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold shadow-sm border border-[#A3E635]/25"
              : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
          }`}
        >
          <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
          <span>Overview Dashboard</span>
        </button>

        <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C6068] px-2.5 py-1 mt-2">
          Design & Authoring
        </div>

        <button
          onClick={() => onSelectTab("flowchart")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-left transition-all ${
            activeTab === "flowchart"
              ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold shadow-sm border border-[#A3E635]/25"
              : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
          }`}
        >
          <Workflow className="w-[18px] h-[18px] shrink-0" />
          <span>Visual Flowchart</span>
        </button>

        <button
          onClick={() => onSelectTab("editor")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-left transition-all ${
            activeTab === "editor"
              ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold shadow-sm border border-[#A3E635]/25"
              : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
          }`}
        >
          <FileCode2 className="w-[18px] h-[18px] shrink-0" />
          <span>Script Editor</span>
        </button>

        <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C6068] px-2.5 py-1 mt-2">
          Execution & History
        </div>

        <button
          onClick={() => onSelectTab("runner")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-left transition-all ${
            activeTab === "runner"
              ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold shadow-sm border border-[#A3E635]/25"
              : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
          }`}
        >
          <Zap className="w-[18px] h-[18px] shrink-0" />
          <span>Test Runner & Telemetry</span>
        </button>

        <button
          onClick={() => onSelectTab("history")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-left transition-all ${
            activeTab === "history"
              ? "bg-[#A3E635]/15 text-[#A3E635] font-semibold shadow-sm border border-[#A3E635]/25"
              : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
          }`}
        >
          <History className="w-[18px] h-[18px] shrink-0" />
          <span>Run History & Audit</span>
        </button>
      </div>

      {/* Explorer / Active Project Test Suites */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-4">
          <div
            onClick={() => setSamplesExpanded(!samplesExpanded)}
            className="flex items-center gap-2 px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#9CA0A8] cursor-pointer hover:text-[#E8E9EB] transition-colors"
          >
            {samplesExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#A3E635]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#5C6068]" />
            )}
            <FolderOpen className="w-4 h-4 text-[#A3E635]" />
            <span>Suites ({activeProject?.suites.length || 0})</span>
          </div>

          {samplesExpanded && activeProject && (
            <div className="mt-1.5 flex flex-col gap-1 pl-3.5 border-l border-[#26282D] ml-4">
              {activeProject.suites.map((suite) => {
                const isSelected = selectedScript === suite.scriptPath;
                return (
                  <button
                    key={suite.id}
                    onClick={() => {
                      onSelectScript(suite.scriptPath, suite.engine);
                      onSelectTab("runner");
                    }}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-[5px] text-left transition-colors ${
                      isSelected
                        ? "bg-[#1C1E22] text-[#A3E635] font-medium border border-[#3A3D44]"
                        : "text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Zap className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-[#A3E635]" : "text-[#5C6068]"}`} />
                      <span className="truncate text-[13px]">{suite.name}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0A0A0B] text-[#9CA0A8] border border-[#26282D] uppercase">
                      {suite.engine}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Registered Engines Section */}
        <div className="mt-4">
          <div className="px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#9CA0A8] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#A3E635]" />
              <span>Engines</span>
            </span>
            <span className="text-[10px] font-mono text-[#5C6068]">
              {engines.length} REGISTERED
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            {engines.map((eng) => {
              const isSelected = selectedEngineId === eng.id;
              const isReady = "Ready" in eng.availability;
              const isPlugin = eng.license_tier === "Plugin";

              return (
                <div
                  key={eng.id}
                  onClick={() => onSelectEngine(eng.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-[6px] cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[#1C1E22] border border-[#3A3D44] text-[#E8E9EB] shadow-sm"
                      : "hover:bg-[#1C1E22]/60 text-[#9CA0A8] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isReady ? "bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-[#F5A623]"
                      }`}
                    />
                    <span className="font-medium text-[13px] text-[#E8E9EB]">{eng.display_name}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isPlugin ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/25 font-mono font-medium">
                        Plugin
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#A3E635]/10 text-[#A3E635] border border-[#A3E635]/25 font-mono font-medium">
                        Core
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-[#26282D] flex items-center justify-between bg-[#0A0A0B]">
        <button
          onClick={onOpenCmdk}
          className="flex items-center gap-2 text-[#9CA0A8] hover:text-[#E8E9EB] transition-colors text-[12px] font-medium"
        >
          <Terminal className="w-4 h-4 text-[#A3E635]" />
          <span>Quick Actions</span>
          <span className="font-mono bg-[#1C1E22] px-2 py-0.5 rounded border border-[#3A3D44] text-[11px] text-[#E8E9EB]">
            Ctrl+K
          </span>
        </button>

        <button
          onClick={() => onSelectTab("engines")}
          className={`p-2 rounded-[6px] transition-colors ${
            activeTab === "engines"
              ? "text-[#A3E635] bg-[#1C1E22] border border-[#A3E635]/30"
              : "text-[#9CA0A8] hover:text-[#E8E9EB] hover:bg-[#1C1E22]"
          }`}
          title="Engine Configuration"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
