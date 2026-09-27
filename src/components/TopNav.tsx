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
import { LoomButton } from "./ui/LoomButton";

interface TopNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isRunning: boolean;
  canRun?: boolean;
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
  canRun = true,
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
    <header className="loom-topbar">
      <nav className="loom-topbar__tabs" aria-label="Workspace views">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`loom-tab ${isActive ? "loom-tab--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={16} />
              <span className="loom-truncate">{tab.label}</span>
              {tab.suffix && (
                <span className="loom-engine-tag">
                  {tab.suffix}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="loom-topbar__actions">
        <label className="loom-target-input">
          <Globe aria-hidden="true" size={15} />
          <span>Target</span>
          <input
            aria-label="Target host"
            type="text"
            value={targetHost}
            onChange={(e) => onChangeTargetHost(e.target.value)}
            placeholder="http://localhost:8080"
          />
        </label>

        {isRunning ? (
          <LoomButton
            onClick={onStopTest}
            className="loom-topbar__run"
            variant="danger"
          >
            <Square aria-hidden="true" size={14} fill="currentColor" />
            <span>Stop Test</span>
          </LoomButton>
        ) : (
          <LoomButton
            onClick={onRunTest}
            disabled={!canRun}
            className="loom-topbar__run"
          >
            <Play aria-hidden="true" size={14} fill="currentColor" />
            <span>Run Test</span>
          </LoomButton>
        )}
      </div>
    </header>
  );
};
