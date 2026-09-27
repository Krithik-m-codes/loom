import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
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
  navigationToggleRef?: Ref<HTMLButtonElement>;
  backgroundInert?: boolean;
  isRunning: boolean;
  canRun?: boolean;
  onRunTest: () => void;
  onStopTest: () => void;
  targetHost: string;
  onChangeTargetHost: (host: string) => void;
  activeTestName: string;
}

const NEW_TAB_MENU_WIDTH = 192;

const menuItems = (menu: HTMLDivElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);

const moveMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  const items = menuItems(event.currentTarget);
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
  event.preventDefault();
  items[next].focus();
};

export const TopNav = ({
  activeTab, openTabs, onSelectTab, onCloseTab, projects, activeProjectId,
  onSelectProject, onOpenNewProject, engines, selectedEngineId, onSelectEngine,
  selectedEngineName, onOpenCmdk, onToggleNavigation, navigationOpen, isRunning,
  navigationToggleRef, backgroundInert = false,
  canRun = true, onRunTest, onStopTest, targetHost, onChangeTargetHost, activeTestName,
}: TopNavProps) => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const [newTabMenuPosition, setNewTabMenuPosition] = useState({ left: 0, top: 0, width: NEW_TAB_MENU_WIDTH });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const newTabButtonRef = useRef<HTMLButtonElement>(null);
  const newTabMenuRef = useRef<HTMLDivElement>(null);
  const pendingTabFocusRef = useRef<string | null>(null);
  const previousTabCount = useRef(openTabs.length);
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedEngine = engines.find((engine) => engine.id === selectedEngineId);
  const engineReady = Boolean(selectedEngine && "Ready" in selectedEngine.availability);
  const engineAvailability = selectedEngine
    ? engineReady ? "Ready" : ("NotInstalled" in selectedEngine.availability ? selectedEngine.availability.NotInstalled.install_hint : "Not installed")
    : "No engine detected";
  const availableTabs = destinations.filter((destination) => !openTabs.includes(destination.id));

  useEffect(() => {
    if (openTabs.length < previousTabCount.current) tabRefs.current[activeTab]?.focus();
    previousTabCount.current = openTabs.length;
  }, [openTabs, activeTab]);

  useEffect(() => {
    const target = pendingTabFocusRef.current;
    if (target && openTabs.includes(target)) {
      tabRefs.current[target]?.focus();
      pendingTabFocusRef.current = null;
    }
  }, [openTabs]);

  useEffect(() => {
    if (projectMenuOpen) menuItems(projectMenuRef.current)[0]?.focus();
  }, [projectMenuOpen]);

  useEffect(() => {
    if (newTabMenuOpen) menuItems(newTabMenuRef.current)[0]?.focus();
  }, [newTabMenuOpen]);

  useEffect(() => {
    if (!projectMenuOpen && !newTabMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (projectMenuOpen && !projectButtonRef.current?.contains(target) && !projectMenuRef.current?.contains(target)) setProjectMenuOpen(false);
      if (newTabMenuOpen && !newTabButtonRef.current?.contains(target) && !newTabMenuRef.current?.contains(target)) setNewTabMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [projectMenuOpen, newTabMenuOpen]);

  const selectDestination = (id: string) => {
    onSelectTab(id);
    setNewTabMenuOpen(false);
  };

  const openNewTabMenu = () => {
    if (newTabMenuOpen) {
      setNewTabMenuOpen(false);
      return;
    }
    const rect = newTabButtonRef.current?.getBoundingClientRect();
    const width = Math.min(NEW_TAB_MENU_WIDTH, Math.max(0, window.innerWidth - 16));
    setNewTabMenuPosition({
      left: Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - width - 8)),
      top: (rect?.bottom ?? 0) + 6,
      width,
    });
    setNewTabMenuOpen(true);
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
    <div className="loom-topnav" inert={backgroundInert}>
      <header className="loom-contextbar">
        <div className="loom-contextbar__identity">
          <button type="button" className="loom-contextbar__menu" aria-label="Toggle workspace navigation"
            aria-expanded={navigationOpen} onClick={onToggleNavigation} ref={navigationToggleRef}>
            <Menu aria-hidden="true" size={18} />
          </button>
          <LoomLogo size={28} showText />
          <div className="loom-project-switcher" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setProjectMenuOpen(false);
          }}>
            <button type="button" className="loom-project-switcher__trigger" ref={projectButtonRef}
              aria-expanded={projectMenuOpen} aria-haspopup="menu"
              onClick={() => setProjectMenuOpen((open) => !open)}
              onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setProjectMenuOpen(true); } }}>
              <span className="loom-project-switcher__name loom-truncate">{activeProject?.name ?? "No project selected"}</span>
              <ChevronDown aria-hidden="true" size={15} />
            </button>
            {projectMenuOpen && (
              <div className="loom-project-switcher__menu" role="menu" ref={projectMenuRef} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setProjectMenuOpen(false);
                  projectButtonRef.current?.focus();
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") moveMenuFocus(event);
              }}>
                {projects.map((project) => (
                  <button key={project.id} type="button" role="menuitemradio"
                    aria-checked={project.id === activeProjectId}
                    className={`loom-project-switcher__option ${project.id === activeProjectId ? "loom-project-switcher__option--active" : ""}`}
                    onClick={() => { onSelectProject(project.id); setProjectMenuOpen(false); projectButtonRef.current?.focus(); }}>
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
          <span className={`loom-contextbar__engine-state ${engineReady ? "is-ready" : "is-missing"}`}
            role="status" aria-label="Engine availability" title={engineAvailability}>
            <span aria-hidden="true" className="loom-contextbar__status-dot" />
            <span>{engineAvailability}</span>
          </span>
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
        <div className="loom-workspace-tabs__add" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setNewTabMenuOpen(false);
        }}>
          <button type="button" className="loom-workspace-tabs__add-button" aria-label="Open workspace tab"
            aria-expanded={newTabMenuOpen} aria-haspopup="menu" ref={newTabButtonRef}
            onClick={openNewTabMenu}
            onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); openNewTabMenu(); } }}>
            <Plus aria-hidden="true" size={17} /></button>
          {newTabMenuOpen && (
            <div className="loom-workspace-tabs__menu" role="menu" ref={newTabMenuRef}
              style={newTabMenuPosition} onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setNewTabMenuOpen(false);
                newTabButtonRef.current?.focus();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") moveMenuFocus(event);
            }}>
              {availableTabs.length ? availableTabs.map((destination) => (
                <button key={destination.id} type="button" role="menuitem"
                  onClick={() => { pendingTabFocusRef.current = destination.id; selectDestination(destination.id); }}>
                  {destination.label}</button>
              )) : <p>All views are open.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
