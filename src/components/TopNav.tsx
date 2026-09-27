import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Activity, ChevronDown, FileCode2, Globe, History, LayoutDashboard,
  Menu, Play, Plus, Search, Settings, Square, Workflow, X, Zap,
} from "lucide-react";
import type { EngineInfo, Project } from "../types";
import { LoomLogo } from "./LoomLogo";
import { LoomButton } from "./ui/LoomButton";

const destinations = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "flowchart", label: "Visual flow", icon: Workflow },
  { id: "runner", label: "Test runner", icon: Zap },
  { id: "editor", label: "Script editor", icon: FileCode2 },
  { id: "history", label: "History", icon: History },
  { id: "engines", label: "Engines", icon: Activity },
] as const;

interface TopNavProps {
  activeTab: string;
  openTabs: string[];
  onSelectTab: (tab: string) => void;
  onCloseTab: (tab: string) => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenNewProject: () => void;
  engines: EngineInfo[];
  selectedEngineId: string;
  onSelectEngine: (id: string) => void;
  selectedEngineName: string;
  onOpenCmdk: () => void;
  onToggleNavigation: () => void;
  navigationOpen: boolean;
  isRunning: boolean;
  canRun?: boolean;
  onRunTest: () => void;
  onStopTest: () => void;
  targetHost: string;
  onChangeTargetHost: (host: string) => void;
  activeTestName: string;
}

export const TopNav = ({
  activeTab, openTabs, onSelectTab, onCloseTab, projects, activeProjectId,
  onSelectProject, onOpenNewProject, engines, selectedEngineId, onSelectEngine,
  selectedEngineName, onOpenCmdk, onToggleNavigation, navigationOpen, isRunning,
  canRun = true, onRunTest, onStopTest, targetHost, onChangeTargetHost, activeTestName,
}: TopNavProps) => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousTabCount = useRef(openTabs.length);
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const availableTabs = destinations.filter((destination) => !openTabs.includes(destination.id));

  useEffect(() => {
    if (openTabs.length < previousTabCount.current) tabRefs.current[activeTab]?.focus();
    previousTabCount.current = openTabs.length;
  }, [openTabs, activeTab]);

  const selectDestination = (id: string) => {
    onSelectTab(id);
    setNewTabMenuOpen(false);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const index = openTabs.indexOf(id);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % openTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + openTabs.length) % openTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = openTabs.length - 1;
    else return;
    event.preventDefault();
    const nextId = openTabs[nextIndex];
    selectDestination(nextId);
    tabRefs.current[nextId]?.focus();
  };

  return (
    <div className="loom-topnav">
      <header className="loom-contextbar">
        <div className="loom-contextbar__identity">
          <button type="button" className="loom-contextbar__menu" aria-label="Toggle workspace navigation"
            aria-expanded={navigationOpen} onClick={onToggleNavigation}>
            <Menu aria-hidden="true" size={18} />
          </button>
          <LoomLogo size={28} showText />
          <div className="loom-project-switcher">
            <button type="button" className="loom-project-switcher__trigger"
              aria-expanded={projectMenuOpen} aria-haspopup="menu"
              onClick={() => setProjectMenuOpen((open) => !open)}>
              <span className="loom-project-switcher__name loom-truncate">{activeProject?.name ?? "No project selected"}</span>
              <ChevronDown aria-hidden="true" size={15} />
            </button>
            {projectMenuOpen && (
              <div className="loom-project-switcher__menu" role="menu" onKeyDown={(event) => {
                if (event.key === "Escape") setProjectMenuOpen(false);
              }}>
                {projects.map((project) => (
                  <button key={project.id} type="button" role="menuitemradio"
                    aria-checked={project.id === activeProjectId}
                    className={`loom-project-switcher__option ${project.id === activeProjectId ? "loom-project-switcher__option--active" : ""}`}
                    onClick={() => { onSelectProject(project.id); setProjectMenuOpen(false); }}>
                    <span className="loom-truncate">{project.name}</span>
                    <span>{project.suites.length} suites</span>
                  </button>
                ))}
                {projects.length === 0 && <p className="loom-project-switcher__empty">Create a project to organize your tests.</p>}
                <button type="button" role="menuitem" className="loom-project-switcher__create"
                  onClick={() => { setProjectMenuOpen(false); onOpenNewProject(); }}>
                  <Plus aria-hidden="true" size={14} /> Create project
                </button>
              </div>
            )}
          </div>
          <button type="button" className="loom-contextbar__create" aria-label="Create project"
            title="Create project" onClick={onOpenNewProject}>
            <Plus aria-hidden="true" size={17} />
          </button>
        </div>

        <div className="loom-contextbar__controls">
          <label className="loom-contextbar__engine">
            <span>Engine</span>
            <select aria-label="Active engine" value={selectedEngineId}
              onChange={(event) => onSelectEngine(event.target.value)}>
              {engines.length === 0 && <option value={selectedEngineId}>{selectedEngineName || "No engine"}</option>}
              {engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}
            </select>
          </label>
          <label className="loom-target-input">
            <Globe aria-hidden="true" size={15} />
            <span>Target</span>
            <input aria-label="Target host" type="text" value={targetHost}
              onChange={(event) => onChangeTargetHost(event.target.value)} placeholder="https://example.com" />
          </label>
          <span className={`loom-contextbar__run-status ${isRunning ? "is-running" : ""}`}
            role="status" aria-label="Run status">
            <span aria-hidden="true" className="loom-contextbar__status-dot" />
            {isRunning ? "Running" : "Idle"}
          </span>
          <button type="button" className="loom-contextbar__icon" onClick={onOpenCmdk}
            aria-label="Quick actions" title="Quick actions (Ctrl+K)">
            <Search aria-hidden="true" size={18} />
          </button>
          <button type="button" className="loom-contextbar__icon" onClick={() => selectDestination("engines")}
            aria-label="Engine configuration" title="Engine configuration">
            <Settings aria-hidden="true" size={18} />
          </button>
          {isRunning ? (
            <LoomButton onClick={onStopTest} className="loom-topbar__run" variant="danger">
              <Square aria-hidden="true" size={14} fill="currentColor" /><span>Stop Test</span>
            </LoomButton>
          ) : (
            <LoomButton onClick={onRunTest} disabled={!canRun} className="loom-topbar__run">
              <Play aria-hidden="true" size={14} fill="currentColor" /><span>Run Test</span>
            </LoomButton>
          )}
        </div>
      </header>

      <div className="loom-workspace-tabs">
        <div role="tablist" aria-label="Workspace views" className="loom-workspace-tabs__list">
          {openTabs.map((id) => {
            const destination = destinations.find((item) => item.id === id);
            if (!destination) return null;
            const Icon = destination.icon;
            const label = id === "runner" && activeTestName && activeTestName !== "Test" ? activeTestName : destination.label;
            const selected = activeTab === id;
            return (
              <div key={id} className={`loom-workspace-tab ${selected ? "is-active" : ""}`} role="presentation">
                <button type="button" role="tab" id={`workspace-tab-${id}`} aria-controls={`workspace-panel-${id}`}
                  aria-selected={selected} tabIndex={selected ? 0 : -1}
                  ref={(node) => { tabRefs.current[id] = node; }}
                  onKeyDown={(event) => handleTabKeyDown(event, id)}
                  onClick={() => selectDestination(id)} className={`loom-tab ${selected ? "loom-tab--active" : ""}`}>
                  <Icon aria-hidden="true" size={15} />
                  <span className="loom-truncate">{label}</span>
                </button>
                {id !== "dashboard" && (
                  <button type="button" className="loom-workspace-tab__close" aria-label={`Close ${label} tab`}
                    onClick={() => onCloseTab(id)}><X aria-hidden="true" size={13} /></button>
                )}
              </div>
            );
          })}
        </div>
        <div className="loom-workspace-tabs__add">
          <button type="button" className="loom-workspace-tabs__add-button" aria-label="Open workspace tab"
            aria-expanded={newTabMenuOpen} aria-haspopup="menu"
            onClick={() => setNewTabMenuOpen((open) => !open)}><Plus aria-hidden="true" size={17} /></button>
          {newTabMenuOpen && (
            <div className="loom-workspace-tabs__menu" role="menu" onKeyDown={(event) => {
              if (event.key === "Escape") setNewTabMenuOpen(false);
            }}>
              {availableTabs.length ? availableTabs.map((destination) => (
                <button key={destination.id} type="button" role="menuitem"
                  onClick={() => selectDestination(destination.id)}>{destination.label}</button>
              )) : <p>All views are open.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
