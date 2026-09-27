import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { DashboardView } from "./components/DashboardView";
import { FlowchartBuilderView } from "./components/FlowchartBuilderView";
import { RunnerView } from "./components/RunnerView";
import { ScriptEditorView } from "./components/ScriptEditorView";
import { HistoryView } from "./components/HistoryView";
import { EnginesView } from "./components/EnginesView";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { OnboardingWizard } from "./components/setup/OnboardingWizard";
import { NewProjectModal } from "./components/projects/NewProjectModal";
import {
  listEngines,
  listProjects,
  listSuites,
  startRun,
  stopRun,
  saveScript,
  subscribeToMetrics,
  subscribeToLogs,
  subscribeToRunStarted,
  subscribeToRunFinished,
} from "./lib/ipc";
import { EngineInfo, NormalizedMetric, Project, RunLog, TestConfig } from "./types";
import { configForSuite, projectConfigForSelection } from "./lib/projectState";

export default function App() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  // Default to Dashboard directly as requested
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [openTabs, setOpenTabs] = useState<string[]>(["dashboard"]);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isNarrowWindow, setIsNarrowWindow] = useState(() => window.innerWidth <= 760);
  const [runHistoryRevision, setRunHistoryRevision] = useState(0);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const navigationDrawerRef = useRef<HTMLDivElement>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<NormalizedMetric[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [isCmdkOpen, setIsCmdkOpen] = useState<boolean>(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState<boolean>(false);
  const [flowExportError, setFlowExportError] = useState<string>("");

  const openWorkspaceTab = (tab: string) => {
    setOpenTabs((current) => current.includes(tab) ? current : [...current, tab]);
    setActiveTab(tab);
    setNavigationOpen(false);
  };

  const closeWorkspaceTab = (tab: string) => {
    if (tab === "dashboard") return;
    const remaining = openTabs.filter((id) => id !== tab);
    setOpenTabs(remaining);
    if (activeTab === tab) setActiveTab(remaining[remaining.length - 1] ?? "dashboard");
  };

  useEffect(() => {
    const updateWindowSize = () => setIsNarrowWindow(window.innerWidth <= 760);
    window.addEventListener("resize", updateWindowSize);
    return () => window.removeEventListener("resize", updateWindowSize);
  }, []);

  useEffect(() => {
    if (!isNarrowWindow) setNavigationOpen(false);
  }, [isNarrowWindow]);

  useEffect(() => {
    if (!navigationOpen || !isNarrowWindow) return;
    navigationDrawerRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => {
      const activeElement = document.activeElement;
      if (activeElement === document.body || navigationDrawerRef.current?.contains(activeElement) ||
        activeElement?.classList.contains("loom-sidebar-backdrop")) navigationToggleRef.current?.focus();
    };
  }, [navigationOpen, isNarrowWindow]);

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const buttons = Array.from(navigationDrawerRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Projects state (loaded from SQLite via IPC; empty in non-Tauri browser preview)
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  // Suite selection source of truth for later tasks (Editor, modals, shell); read there.
  void activeSuiteId;

  // Professional Onboarding Wizard state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem("loom_onboarding_completed");
    } catch {
      return false;
    }
  });

  // Default test configuration
  const [config, setConfig] = useState<TestConfig>(() => projectConfigForSelection(projects, activeProjectId));
  const [selectedEngineId, setSelectedEngineId] = useState<string>(() => config.engine);

  // Load engines on mount
  useEffect(() => {
    loadEngineList();
  }, []);

  // Load projects and suites from SQLite on mount
  useEffect(() => {
    let cancelled = false;
    const loadProjectsAndSuites = async () => {
      try {
        const loaded = await listProjects();
        if (cancelled) return;
        setProjects(loaded);
        if (loaded.length === 0) return;
        const first = loaded[0];
        setActiveProjectId(first.id);
        try {
          const suites = await listSuites(first.id);
          if (cancelled) return;
          const merged = loaded.map((p) => (p.id === first.id ? { ...p, suites } : p));
          setProjects(merged);
          const nextConfig = projectConfigForSelection(merged, first.id);
          setSelectedEngineId(nextConfig.engine);
          setConfig(nextConfig);
        } catch (err) {
          console.error("Failed to list suites:", err);
        }
      } catch (err) {
        console.error("Failed to list projects:", err);
      }
    };
    loadProjectsAndSuites();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEngineList = async () => {
    try {
      const list = await listEngines();
      setEngines(list);
      if (list.length > 0 && !activeProjectId && !list.find((e) => e.id === selectedEngineId)) {
        setSelectedEngineId(list[0].id);
        setConfig((prev) => ({ ...prev, engine: list[0].id }));
      }
    } catch (err) {
      console.error("Failed to list engines:", err);
    }
  };

  // Subscribe to Tauri IPC events
  useEffect(() => {
    let unlistenMetrics: (() => void) | null = null;
    let unlistenLogs: (() => void) | null = null;
    let unlistenStarted: (() => void) | null = null;
    let unlistenFinished: (() => void) | null = null;

    const setup = async () => {
      unlistenMetrics = await subscribeToMetrics((metric) => {
        setMetrics((prev) => [...prev, metric]);
      });

      unlistenLogs = await subscribeToLogs((log) => {
        setLogs((prev) => [...prev, log]);
      });

      unlistenStarted = await subscribeToRunStarted((payload) => {
        setActiveRunId(payload.run_id);
        setIsRunning(true);
      });

      unlistenFinished = await subscribeToRunFinished((_payload) => {
        setIsRunning(false);
        setActiveRunId(null);
        setRunHistoryRevision((revision) => revision + 1);
      });
    };

    setup();

    return () => {
      if (unlistenMetrics) unlistenMetrics();
      if (unlistenLogs) unlistenLogs();
      if (unlistenStarted) unlistenStarted();
      if (unlistenFinished) unlistenFinished();
    };
  }, []);

  // Keyboard shortcut for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCmdkOpen((prev) => !prev);
      }
      if (e.key === "Escape") setNavigationOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setActiveProjectId(projectId);
    setActiveSuiteId(null);
    try {
      const suites = await listSuites(projectId);
      const merged = projects.map((p) => (p.id === projectId ? { ...p, suites } : p));
      setProjects(merged);
      const nextConfig = projectConfigForSelection(merged, projectId);
      setSelectedEngineId(nextConfig.engine);
      setConfig(nextConfig);
    } catch (err) {
      console.error("Failed to list suites:", err);
      const nextConfig = projectConfigForSelection(projects, projectId);
      setSelectedEngineId(nextConfig.engine);
      setConfig(nextConfig);
    }
  };

  const handleCreateProject = (newProj: Project) => {
    const updated = [newProj, ...projects];
    setProjects(updated);
    setActiveProjectId(newProj.id);
    const nextConfig = projectConfigForSelection(updated, newProj.id);
    setSelectedEngineId(nextConfig.engine);
    setConfig(nextConfig);
    setIsNewProjectOpen(false);
  };

  const handleSelectEngine = (engineId: string) => {
    setSelectedEngineId(engineId);
    setConfig(projectConfigForSelection(projects, activeProjectId, engineId));
  };

  const handleSelectScript = (path: string, engine: string) => {
    setSelectedEngineId(engine);
    const suite = projects.find((project) => project.id === activeProjectId)?.suites.find((entry) => entry.engine === engine && entry.scriptPath === path);
    setActiveSuiteId(suite ? suite.id : null);
    setConfig((prev) => suite ? configForSuite(suite) : {
      ...prev,
      engine,
      script_path: path,
    });
  };

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const canRun = Boolean(
    activeProject && config.engine === selectedEngineId && config.script_path.trim() && config.target.host.trim() &&
    engines.some((engine) => engine.id === selectedEngineId && "Ready" in engine.availability),
  );

  const handleRunTest = async () => {
    if (isRunning || !canRun) return;

    // Reset telemetry & navigate to Locust/Goose-grade runner dashboard
    openWorkspaceTab("runner");
    setMetrics([]);
    setLogs([]);
    setIsRunning(true);

    try {
      const runId = await startRun(selectedEngineId, config);
      setActiveRunId(runId);
    } catch (err: any) {
      console.error("Run error:", err);
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        {
          run_id: "error",
          stream: "stderr",
          message: `Launch error: ${err.message || err}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleStopTest = async () => {
    if (!isRunning || !activeRunId) return;
    try {
      await stopRun(activeRunId);
    } catch (err) {
      console.error("Stop error:", err);
    }
  };

  const handleRerun = (engine: string, configJson: string) => {
    try {
      const parsed = JSON.parse(configJson);
      setSelectedEngineId(engine);
      if (parsed.load_profile) {
        setConfig(parsed);
      }
      openWorkspaceTab("runner");
    } catch (e) {
      console.error("Failed to parse rerun config:", e);
    }
  };

  // Flowchart script transfer to Runner
  const handleExportFlowchartScript = async (
    scriptContent: string,
    engine: string
  ) => {
    const filename =
      engine === "locust"
        ? "examples/locust/visual_scenario.py"
        : "examples/k6/visual_scenario.js";

    try {
      await saveScript(filename, scriptContent);
    } catch (e) {
      console.error("Failed to save generated script:", e);
      setFlowExportError("Could not save the generated scenario. Resolve the error and try again before opening Runner.");
      return;
    }

    setFlowExportError("");
    setSelectedEngineId(engine);
    setConfig((prev) => ({
      ...prev,
      engine,
      script_path: filename,
    }));
    openWorkspaceTab("runner");
  };

  const handleCompleteOnboarding = () => {
    try {
      localStorage.setItem("loom_onboarding_completed", "true");
    } catch {}
    setShowOnboarding(false);
    openWorkspaceTab("dashboard");
  };

  const selectedEngineObj = engines.find((e) => e.id === selectedEngineId);
  const selectedEngineName = selectedEngineObj?.display_name || selectedEngineId;

  return (
    <div className="loom-app-shell select-none">
      <a className="loom-skip-link" href="#main-content" inert={navigationOpen && isNarrowWindow}>
        Skip to workspace content
      </a>
      <TopNav
        activeTab={activeTab}
        openTabs={openTabs}
        onSelectTab={openWorkspaceTab}
        onCloseTab={closeWorkspaceTab}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        engines={engines}
        selectedEngineId={selectedEngineId}
        onSelectEngine={handleSelectEngine}
        selectedEngineName={selectedEngineName}
        onOpenCmdk={() => setIsCmdkOpen(true)}
        onToggleNavigation={() => setNavigationOpen((open) => !open)}
        navigationOpen={navigationOpen}
        navigationToggleRef={navigationToggleRef}
        backgroundInert={navigationOpen && isNarrowWindow}
        isRunning={isRunning}
        canRun={canRun}
        onRunTest={handleRunTest}
        onStopTest={handleStopTest}
        targetHost={config.target.host}
        onChangeTargetHost={(host) => setConfig((prev) => ({ ...prev, target: { ...prev.target, host } }))}
        activeTestName={config.script_path.split("/").pop() || "Test"}
      />

      <div className={`loom-sidebar-slot ${navigationOpen ? "is-open" : ""}`}
        ref={navigationDrawerRef}
        role={navigationOpen && isNarrowWindow ? "dialog" : undefined}
        aria-modal={navigationOpen && isNarrowWindow ? true : undefined}
        aria-label={navigationOpen && isNarrowWindow ? "Workspace navigation" : undefined}
        onKeyDown={handleDrawerKeyDown}>
        <Sidebar
          engines={engines}
          selectedEngineId={selectedEngineId}
          onSelectEngine={handleSelectEngine}
          activeTab={activeTab}
          onSelectTab={openWorkspaceTab}
          onOpenCmdk={() => { setNavigationOpen(false); setIsCmdkOpen(true); }}
          selectedScript={config.script_path}
          onSelectScript={handleSelectScript}
          projects={projects}
          activeProjectId={activeProjectId}
          onOpenNewProject={() => { setNavigationOpen(false); setIsNewProjectOpen(true); }}
        />
      </div>
      {navigationOpen && <button type="button" className="loom-sidebar-backdrop" tabIndex={-1}
        aria-hidden="true" onClick={() => setNavigationOpen(false)} />}

      <div className="loom-workspace" inert={navigationOpen && isNarrowWindow}>
        {flowExportError && <p className="loom-action-error" role="alert">{flowExportError}</p>}
        <div id="main-content" className="loom-workspace__content" tabIndex={-1}>
          {openTabs.includes("dashboard") && (
            <div id="workspace-panel-dashboard" role="tabpanel" aria-labelledby="workspace-tab-dashboard"
              className="loom-workspace__panel" hidden={activeTab !== "dashboard"}>
              <DashboardView
                engines={engines}
                refreshRevision={runHistoryRevision}
                onNavigate={openWorkspaceTab}
                onSelectEngine={handleSelectEngine}
                targetHost={config.target.host}
                onRerun={handleRerun}
              />
            </div>
          )}

          {openTabs.includes("flowchart") && (
            <div id="workspace-panel-flowchart" role="tabpanel" aria-labelledby="workspace-tab-flowchart"
              className="loom-workspace__panel" hidden={activeTab !== "flowchart"}>
              <FlowchartBuilderView
                onExportToRunner={handleExportFlowchartScript}
                targetHost={config.target.host}
              />
            </div>
          )}

          {openTabs.includes("runner") && (
            <div id="workspace-panel-runner" role="tabpanel" aria-labelledby="workspace-tab-runner"
              className="loom-workspace__panel" hidden={activeTab !== "runner"}>
              <RunnerView
                engines={engines}
                selectedEngineId={selectedEngineId}
                onSelectEngine={handleSelectEngine}
                config={config}
                onChangeConfig={setConfig}
                isRunning={isRunning}
                canRun={canRun}
                onRunTest={handleRunTest}
                onStopTest={handleStopTest}
                metrics={metrics}
                logs={logs}
                onClearLogs={() => setLogs([])}
              />
            </div>
          )}

          {openTabs.includes("editor") && (
            <div id="workspace-panel-editor" role="tabpanel" aria-labelledby="workspace-tab-editor"
              className="loom-workspace__panel" hidden={activeTab !== "editor"}>
              <ScriptEditorView
                scriptPath={config.script_path}
                onSelectScript={handleSelectScript}
                onRunTest={() => {
                  openWorkspaceTab("runner");
                  handleRunTest();
                }}
              />
            </div>
          )}

          {openTabs.includes("history") && (
            <div id="workspace-panel-history" role="tabpanel" aria-labelledby="workspace-tab-history"
              className="loom-workspace__panel" hidden={activeTab !== "history"}>
              <HistoryView onRerun={handleRerun} refreshRevision={runHistoryRevision} />
            </div>
          )}

          {openTabs.includes("engines") && (
            <div id="workspace-panel-engines" role="tabpanel" aria-labelledby="workspace-tab-engines"
              className="loom-workspace__panel" hidden={activeTab !== "engines"}>
              <EnginesView engines={engines} />
            </div>
          )}
        </div>
      </div>

      {/* 3. Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        onRunTest={handleRunTest}
        onStopTest={handleStopTest}
        isRunning={isRunning}
        onSelectTab={openWorkspaceTab}
        onSelectEngine={handleSelectEngine}
        onSelectScript={handleSelectScript}
      />

      {/* 4. Professional Setup / Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          engines={engines}
          onComplete={handleCompleteOnboarding}
        />
      )}

      {/* 5. New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        engines={engines}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
