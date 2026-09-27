import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  FolderOpen,
  History,
  Layers,
  LayoutDashboard,
  Plus,
  Settings,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import type { EngineInfo, Project } from "../types";
import { LoomLogo } from "./LoomLogo";
import { StatusBadge } from "./ui/StatusBadge";

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
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const navSections = [
    { label: "Platform", items: [{ id: "dashboard", label: "Dashboard", Icon: LayoutDashboard }] },
    {
      label: "Design & authoring",
      items: [
        { id: "flowchart", label: "Visual flow", Icon: Workflow },
        { id: "editor", label: "Script editor", Icon: FileCode2 },
      ],
    },
    {
      label: "Execution & history",
      items: [
        { id: "runner", label: "Test runner", Icon: Zap },
        { id: "history", label: "Run history", Icon: History },
      ],
    },
  ];

  return (
    <aside className="loom-sidebar" aria-label="Loom workspace navigation">
      <div className="loom-sidebar__brand">
        <LoomLogo size={30} showText />
        {isRunning && <StatusBadge status="running" label="Running" />}
      </div>

      <section className="loom-sidebar__project" aria-label="Active project">
        <div className="loom-sidebar__project-heading">
          <span>Active project</span>
          <button type="button" onClick={onOpenNewProject} className="loom-sidebar__new-project">
            <Plus aria-hidden="true" size={14} />
            <span>New</span>
          </button>
        </div>

        <div className="loom-project-switcher">
          <button
            type="button"
            onClick={() => setProjectMenuOpen((open) => !open)}
            className="loom-project-switcher__trigger"
            aria-expanded={projectMenuOpen}
          >
            <span className="loom-project-switcher__name">
              <Layers aria-hidden="true" size={16} />
              <span className="loom-truncate">{activeProject?.name ?? "No project selected"}</span>
            </span>
            <ChevronDown aria-hidden="true" size={15} />
          </button>

          {projectMenuOpen && (
            <div className="loom-project-switcher__menu" role="menu">
              {projects.map((project) => {
                const selected = project.id === activeProject?.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onSelectProject(project.id);
                      setProjectMenuOpen(false);
                    }}
                    className={`loom-project-switcher__option ${selected ? "loom-project-switcher__option--active" : ""}`}
                  >
                    <span className="loom-truncate">{project.name}</span>
                    <span>{project.suites.length} suites</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setProjectMenuOpen(false);
                  onOpenNewProject();
                }}
                className="loom-project-switcher__create"
              >
                <Plus aria-hidden="true" size={14} />
                Create new project
              </button>
            </div>
          )}
        </div>
      </section>

      <nav className="loom-sidebar__nav" aria-label="Primary navigation">
        {navSections.map((section) => (
          <div className="loom-sidebar__nav-group" key={section.label}>
            <span className="loom-sidebar__section-label">{section.label}</span>
            {section.items.map(({ id, label, Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  className={`loom-nav-item ${selected ? "loom-nav-item--active" : ""}`}
                  aria-current={selected ? "page" : undefined}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span className="loom-truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <section className="loom-sidebar__explorer" aria-label="Project suites and engines">
        <div className="loom-sidebar__explorer-section">
          <button
            type="button"
            onClick={() => setSamplesExpanded((expanded) => !expanded)}
            className="loom-sidebar__explorer-heading"
            aria-expanded={samplesExpanded}
          >
            {samplesExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
            <FolderOpen aria-hidden="true" size={16} />
            <span>Suites ({activeProject?.suites.length ?? 0})</span>
          </button>

          {samplesExpanded && activeProject && (
            <div className="loom-sidebar__suite-list">
              {activeProject.suites.map((suite) => {
                const selected = selectedScript === suite.scriptPath;
                return (
                  <button
                    key={suite.id}
                    type="button"
                    onClick={() => {
                      onSelectScript(suite.scriptPath, suite.engine);
                      onSelectTab("runner");
                    }}
                    className={`loom-sidebar__suite ${selected ? "loom-sidebar__suite--active" : ""}`}
                  >
                    <span className="loom-sidebar__suite-name">
                      <Zap aria-hidden="true" size={14} />
                      <span className="loom-truncate">{suite.name}</span>
                    </span>
                    <span className="loom-engine-tag">{suite.engine}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="loom-sidebar__explorer-section">
          <div className="loom-sidebar__engines-heading">
            <span><Cpu aria-hidden="true" size={15} /> Engines</span>
            <span>{engines.length} registered</span>
          </div>
          <div className="loom-sidebar__engine-list">
            {engines.map((engine) => {
              const selected = selectedEngineId === engine.id;
              const ready = "Ready" in engine.availability;
              return (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() => onSelectEngine(engine.id)}
                  className={`loom-engine-row ${selected ? "loom-engine-row--active" : ""}`}
                >
                  <span className="loom-engine-row__name">
                    <span className="loom-engine-row__availability" data-ready={ready} aria-hidden="true" />
                    <span className="loom-truncate">{engine.display_name}</span>
                  </span>
                  <span className={`loom-engine-tier loom-engine-tier--${engine.license_tier.toLowerCase()}`}>
                    {engine.license_tier}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="loom-sidebar__footer">
        <button type="button" onClick={onOpenCmdk} className="loom-sidebar__quick-actions">
          <Terminal aria-hidden="true" size={16} />
          <span>Quick actions</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("engines")}
          className={`loom-sidebar__settings ${activeTab === "engines" ? "loom-sidebar__settings--active" : ""}`}
          aria-label="Engine configuration"
        >
          <Settings aria-hidden="true" size={16} />
        </button>
      </footer>
    </aside>
  );
};
