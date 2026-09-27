import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  FolderOpen,
  History,
  LayoutDashboard,
  Play,
  Plus,
  Settings,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import type { EngineInfo, Project } from "../types";

interface SidebarProps {
  engines: EngineInfo[];
  selectedEngineId: string;
  onSelectEngine: (id: string) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenCmdk: () => void;
  selectedScript: string;
  onSelectScript: (script: string, engine: string) => void;
  projects: Project[];
  activeProjectId: string;
  onOpenNewProject: () => void;
  onOpenNewSuite?: () => void;
  onRunSuite?: (scriptPath: string, engine: string) => void;
}

export const Sidebar = ({
  engines,
  selectedEngineId,
  onSelectEngine,
  activeTab,
  onSelectTab,
  onOpenCmdk,
  selectedScript,
  onSelectScript,
  projects,
  activeProjectId,
  onOpenNewProject,
  onOpenNewSuite,
  onRunSuite,
}: SidebarProps) => {
  const [samplesExpanded, setSamplesExpanded] = useState(true);
  const [suiteFilter, setSuiteFilter] = useState("");
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const visibleSuites = (activeProject?.suites ?? []).filter((suite) =>
    suite.name.toLowerCase().includes(suiteFilter.toLowerCase()),
  );

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
      <section className="loom-sidebar__project" aria-label="Project resources">
        <div className="loom-sidebar__project-heading">
          <span>Projects</span>
          <button type="button" onClick={onOpenNewProject} className="loom-sidebar__new-project" aria-label="New project">
            <Plus aria-hidden="true" size={14} />
            <span>New</span>
          </button>
        </div>
        {activeProject ? (
          <>
            <div className="loom-sidebar__project-name" title={activeProject.name}>
              <FolderOpen aria-hidden="true" size={16} />
              <span className="loom-truncate">{activeProject.name}</span>
            </div>
            <button type="button" onClick={() => setSamplesExpanded((expanded) => !expanded)}
              className="loom-sidebar__explorer-heading" aria-expanded={samplesExpanded}>
              {samplesExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
              <span>Suites ({activeProject.suites.length})</span>
            </button>
            {samplesExpanded && (
              activeProject.suites.length ? (
                <>
                  <input
                    type="search"
                    aria-label="Filter suites"
                    placeholder="Filter suites…"
                    value={suiteFilter}
                    onChange={(event) => setSuiteFilter(event.target.value)}
                    className="loom-input loom-sidebar__filter"
                  />
                  {visibleSuites.length ? (
                    <div className="loom-sidebar__suite-list">
                      {visibleSuites.map((suite) => {
                        const selected = selectedScript === suite.scriptPath;
                        return (
                          <div key={suite.id} className={`loom-sidebar__suite-row ${selected ? "loom-sidebar__suite-row--active" : ""}`}>
                            <button type="button"
                              onClick={() => { onSelectScript(suite.scriptPath, suite.engine); onSelectTab("editor"); }}
                              className={`loom-sidebar__suite ${selected ? "loom-sidebar__suite--active" : ""}`}>
                              <span className="loom-sidebar__suite-name"><Zap aria-hidden="true" size={14} />
                                <span className="loom-truncate">{suite.name}</span></span>
                              <span className="loom-engine-tag">{suite.engine}</span>
                            </button>
                            {onRunSuite && (
                              <button type="button"
                                onClick={() => onRunSuite(suite.scriptPath, suite.engine)}
                                className="loom-sidebar__suite-run"
                                aria-label="Run suite"
                                title={`Run ${suite.name}`}>
                                <Play aria-hidden="true" size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="loom-sidebar__empty">No suites match &ldquo;{suiteFilter}&rdquo;.</p>}
                </>
              ) : <p className="loom-sidebar__empty">No suites yet. Step 2: Create a suite from a template to begin.</p>
            )}
            <button type="button" onClick={() => onOpenNewSuite?.()} className="loom-sidebar__new-suite" aria-label="New suite">
              <Plus aria-hidden="true" size={14} />
              <span>New Suite</span>
            </button>
          </>
        ) : <p className="loom-sidebar__empty">Create a project to organize scenarios and run history.</p>}
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

      <section className="loom-sidebar__explorer" aria-label="Engines and runtime">
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
