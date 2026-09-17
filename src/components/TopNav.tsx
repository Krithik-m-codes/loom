import {
  LayoutDashboard,
  Workflow,
  Zap,
  FileCode2,
  History,
  Activity,
  Play,
  Square,
  Globe,
} from "lucide-react";

interface TopNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isRunning: boolean;
  onRunTest: () => void;
  onStopTest: () => void;
  selectedEngineName: string;
  targetHost: string;
  onChangeTargetHost: (host: string) => void;
  activeTestName: string;
}

export const TopNav = ({
  activeTab,
  onSelectTab,
  isRunning,
  onRunTest,
  onStopTest,
  selectedEngineName,
  targetHost,
  onChangeTargetHost,
  activeTestName,
}: TopNavProps) => {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "flowchart", label: "Visual Flow", icon: Workflow },
    {
      id: "runner",
      label: activeTestName || "Test Runner",
      icon: Zap,
      suffix: selectedEngineName,
    },
    { id: "editor", label: "Script Editor", icon: FileCode2 },
    { id: "history", label: "History", icon: History },
    { id: "engines", label: "Engines", icon: Activity },
  ];

  return (
    <div className="h-[52px] bg-[#141518] border-b border-[#26282D] flex items-center justify-between px-4 select-none">
      {/* Horizontal Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto h-full pt-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`h-[42px] flex items-center gap-2 px-3.5 rounded-t-[6px] text-[13px] font-medium transition-all border-t border-x relative ${
                isActive
                  ? "bg-[#0A0A0B] border-[#26282D] text-[#E8E9EB] font-semibold border-b-transparent shadow-sm after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2.5px] after:bg-[#A3E635] after:rounded-full"
                  : "bg-transparent border-transparent text-[#9CA0A8] hover:bg-[#1C1E22] hover:text-[#E8E9EB]"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-[#A3E635]" : "text-[#5C6068]"}`} />
              <span className="truncate max-w-[150px]">{tab.label}</span>
              {tab.suffix && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C1E22] text-[#A3E635] border border-[#26282D] uppercase font-semibold">
                  {tab.suffix}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Target & Action Quick Controls (Right side) */}
      <div className="flex items-center gap-3">
        {/* Environment / Target Selector */}
        <div className="flex items-center gap-2 px-3 h-[36px] rounded-[6px] bg-[#1C1E22] border border-[#26282D] focus-within:border-[#A3E635]/60 focus-within:ring-1 focus-within:ring-[#A3E635]/30 text-[12px] font-mono transition-all">
          <Globe className="w-3.5 h-3.5 text-[#A3E635]" />
          <span className="text-[#9CA0A8]">target:</span>
          <input
            type="text"
            value={targetHost}
            onChange={(e) => onChangeTargetHost(e.target.value)}
            placeholder="http://localhost:8080"
            className="bg-transparent text-[#E8E9EB] outline-none w-[180px] text-[12px] font-mono"
          />
        </div>

        {/* Run / Stop Button */}
        {isRunning ? (
          <button
            onClick={onStopTest}
            className="btn-danger h-[36px] text-[13px] px-4 font-semibold"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop Test</span>
          </button>
        ) : (
          <button
            onClick={onRunTest}
            className="btn-primary h-[36px] text-[13px] px-5 font-bold tracking-wide"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Test</span>
          </button>
        )}
      </div>
    </div>
  );
};
