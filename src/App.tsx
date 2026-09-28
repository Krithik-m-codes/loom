import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { DashboardView } from "./components/DashboardView";
import { RunnerView } from "./components/RunnerView";
import { EditorView } from "./components/EditorView";
import { HistoryView } from "./components/HistoryView";
import { EnginesView } from "./components/EnginesView";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { LogDock } from "./components/dock/LogDock";
import { RunDetailsDrawer } from "./components/RunDetailsDrawer";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { OnboardingWizard } from "./components/setup/OnboardingWizard";
import { cancelRuntimeInstallation, getRuntimeStatus, installRuntimes, subscribeToRuntimeError, subscribeToRuntimeProgress, subscribeToRuntimeReady, type K6Consent, type RuntimeSelection } from "./lib/runtime-ipc";
import { NewProjectModal } from "./components/projects/NewProjectModal";
import { NewSuiteModal } from "./components/projects/NewSuiteModal";
import {
  listEngines,
  listProjects,
  listSuites,
  startRun,
  stopRun,
  subscribeToMetrics,
  subscribeToLogs,
  subscribeToRunStarted,
  subscribeToRunFinished,
} from "./lib/ipc";
import { EngineInfo, NormalizedMetric, Project, RunLog, RunRecord, RuntimeId, RuntimeProgress, RuntimeStatus, TestConfig, TestSuite } from "./types";
import { configForSuite, projectConfigForSelection } from "./lib/projectState";

function replaceRuntimeStatus(statuses: RuntimeStatus[], runtime: RuntimeId, state: RuntimeStatus): RuntimeStatus[] {
  const next = [...statuses];
  next[runtime === "locust" ? 0 : runtime === "goose" ? 1 : 2] = state;
  return next;
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const { pushToast } = useToast();
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [runtimeStatuses, setRuntimeStatuses] = useState<RuntimeStatus[]>([]);
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeProgress | null>(null);
  const [runtimeInstalling, setRuntimeInstalling] = useState(false);
  const [editorRunBlock, setEditorRunBlock] = useState<string | null>(null);
  const pendingRuntimeResults = useRef(0);
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
  const [isNewSuiteOpen, setIsNewSuiteOpen] = useState<boolean>(false);
  const [detailsRun, setDetailsRun] = useState<RunRecord | null>(null);

  const openWorkspaceTab = (tab: string) => {
    const destination = tab === "flowchart" ? "editor" : tab;
    setOpenTabs((current) => current.includes(destination) ? current : [...current, destination]);
    setActiveTab(destination);
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

  // Professional Onboarding Wizard state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem("loom_onboarding_completed");
    } catch {
      return false;
    }
  });
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(1);

  // Default test configuration
  const [config, setConfig] = useState<TestConfig>(() => projectConfigForSelection(projects, activeProjectId));
  const [selectedEngineId, setSelectedEngineId] = useState<string>(() => config.engine);

  // Load engines on mount
  useEffect(() => {
    loadEngineList();
    void getRuntimeStatus().then(setRuntimeStatuses).catch((error) => console.error("Failed to load managed runtime status:", error));
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
    let unlistenRuntimeProgress: (() => void) | null = null;
    let unlistenRuntimeReady: (() => void) | null = null;
    let unlistenRuntimeError: (() => void) | null = null;

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
      unlistenRuntimeProgress = await subscribeToRuntimeProgress(setRuntimeProgress);
      const refreshRuntimeStatus = () => {
        pendingRuntimeResults.current = Math.max(0, pendingRuntimeResults.current - 1);
        if (pendingRuntimeResults.current === 0) {
          setRuntimeInstalling(false);
          setRuntimeProgress(null);
        }
      };
      unlistenRuntimeReady = await subscribeToRuntimeReady(({ runtime, state }) => {
        void getRuntimeStatus().then(setRuntimeStatuses).catch((error) => console.error("Failed to refresh managed runtime status:", error));
        void loadEngineList();
        refreshRuntimeStatus();
        setRuntimeStatuses((current) => replaceRuntimeStatus(current, runtime, state));
      });
      unlistenRuntimeError = await subscribeToRuntimeError(({ runtime, message }) => {
        refreshRuntimeStatus();
        setRuntimeStatuses((current) => replaceRuntimeStatus(current, runtime, { status: "failed", stage: "install", message: message ?? "Installation failed" }));
      });
    };

    setup();

    return () => {
      if (unlistenMetrics) unlistenMetrics();
      if (unlistenLogs) unlistenLogs();
      if (unlistenStarted) unlistenStarted();
      if (unlistenFinished) unlistenFinished();
      if (unlistenRuntimeProgress) unlistenRuntimeProgress();
      if (unlistenRuntimeReady) unlistenRuntimeReady();
      if (unlistenRuntimeError) unlistenRuntimeError();
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
    setActiveSuiteId(null);
    const nextConfig = projectConfigForSelection(updated, newProj.id);
    setSelectedEngineId(nextConfig.engine);
    setConfig(nextConfig);
    setIsNewProjectOpen(false);
    pushToast(`Project "${newProj.name}" created`, "success");
  };

  const handleCreateSuite = (suite: TestSuite) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProjectId ? { ...project, suites: [...project.suites, suite] } : project,
      ),
    );
    setActiveSuiteId(suite.id);
    setSelectedEngineId(suite.engine);
    setConfig(configForSuite(suite));
    openWorkspaceTab("editor");
    setIsNewSuiteOpen(false);
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

  const handleOpenSuite = async (suite: TestSuite) => {
    const targetProjectId = suite.projectId ?? activeProjectId;
    if (targetProjectId !== activeProjectId && projects.some((project) => project.id === targetProjectId)) {
      // Cross-project open: switch first via the existing project handler, then
      // open the suite directly — projects/activeProjectId state is stale until
      // the switch re-renders, so handleSelectScript's active-project lookup
      // cannot be reused here.
      await handleSelectProject(targetProjectId);
      setActiveSuiteId(suite.id);
      setSelectedEngineId(suite.engine);
      setConfig(configForSuite(suite));
      return;
    }
    handleSelectScript(suite.scriptPath, suite.engine);
  };

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const canRun = Boolean(
    activeProject && config.engine === selectedEngineId && config.script_path.trim() && config.target.host.trim() &&
    engines.some((engine) => engine.id === selectedEngineId && "Ready" in engine.availability),
  );

  const handleRunTest = async (engineOverride?: string, configOverride?: TestConfig) => {
    if (engineOverride === undefined && configOverride === undefined && editorRunBlock) {
      pushToast(editorRunBlock, "error");
      return;
    }
    const runEngine = engineOverride ?? selectedEngineId;
    const runConfig = configOverride ?? config;
    const runnable = engineOverride !== undefined || configOverride !== undefined
      ? Boolean(
        activeProject && runConfig.engine === runEngine && runConfig.script_path.trim() && runConfig.target.host.trim() &&
        engines.some((engine) => engine.id === runEngine && "Ready" in engine.availability),
      )
      : canRun;
    if (isRunning || !runnable) return;

    // Reset telemetry & navigate to Locust/Goose-grade runner dashboard
    openWorkspaceTab("runner");
    setMetrics([]);
    setLogs([]);
    setIsRunning(true);

    try {
      const runId = await startRun(runEngine, runConfig);
      setActiveRunId(runId);
    } catch (err: any) {
      pushToast(`Launch error: ${err.message || err}`, "error");
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

  const handleRunSuite = (scriptPath: string, engine: string) => {
    const suite = projects
      .flatMap((project) => project.suites)
      .find((entry) => entry.scriptPath === scriptPath && entry.engine === engine);
    const runConfig = suite ? configForSuite(suite) : { ...config, engine, script_path: scriptPath };
    setSelectedEngineId(engine);
    setConfig(runConfig);
    if (suite) setActiveSuiteId(suite.id);
    void handleRunTest(engine, runConfig);
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

  const handleCompleteOnboarding = () => {
    try {
      localStorage.setItem("loom_onboarding_completed", "true");
    } catch {}
    setShowOnboarding(false);
    openWorkspaceTab("dashboard");
  };

  const handleInstallRuntimes = async (selection: RuntimeSelection, consent?: K6Consent) => {
    const count = Number(selection.locust) + Number(selection.goose) + Number(selection.k6);
    pendingRuntimeResults.current = count;
    setRuntimeInstalling(true);
    try {
      await installRuntimes(selection, consent);
    } catch (error) {
      pendingRuntimeResults.current = 0;
      setRuntimeInstalling(false);
      pushToast(`Runtime installation could not start: ${String(error)}`, "error");
    }
  };

  const handleCancelRuntimeInstall = async () => {
    try {
      await cancelRuntimeInstallation();
    } catch (error) {
      pushToast(`Could not cancel installation: ${String(error)}`, "error");
    }
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
        canRun={canRun && editorRunBlock === null}
        onRunTest={() => { void handleRunTest(); }}
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
          onOpenNewSuite={() => { setNavigationOpen(false); setIsNewSuiteOpen(true); }}
          onRunSuite={handleRunSuite}
        />
      </div>
      {navigationOpen && <button type="button" className="loom-sidebar-backdrop" tabIndex={-1}
        aria-hidden="true" onClick={() => setNavigationOpen(false)} />}

      <div className="loom-workspace" inert={navigationOpen && isNarrowWindow}>
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
                projects={projects}
                onOpenNewProject={() => setIsNewProjectOpen(true)}
                onSelectProject={handleSelectProject}
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
                onRunTest={() => { void handleRunTest(); }}
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
              <EditorView
                suiteId={activeSuiteId}
                scriptPath={config.script_path}
                engine={selectedEngineId}
                targetHost={config.target.host}
                config={config}
                onRunTest={() => {
                  openWorkspaceTab("runner");
                  handleRunTest();
                }}
                onSuiteSaved={(suite) => {
                  setProjects((prev) =>
                    prev.map((project) => ({
                      ...project,
                      suites: project.suites.map((entry) =>
                        entry.id === suite.id ? { ...entry, ...suite } : entry,
                      ),
                    })),
                  );
                  setConfig(configForSuite(suite));
                  pushToast(`Suite "${suite.name}" saved`, "success");
                }}
                onRunBlockedChange={setEditorRunBlock}
              />
            </div>
          )}

          {openTabs.includes("history") && (
            <div id="workspace-panel-history" role="tabpanel" aria-labelledby="workspace-tab-history"
              className="loom-workspace__panel" hidden={activeTab !== "history"}>
              <HistoryView onRerun={handleRerun} refreshRevision={runHistoryRevision} onOpenRun={setDetailsRun} />
            </div>
          )}

          {openTabs.includes("engines") && (
            <div id="workspace-panel-engines" role="tabpanel" aria-labelledby="workspace-tab-engines"
              className="loom-workspace__panel" hidden={activeTab !== "engines"}>
              <EnginesView engines={engines} onManageRuntimes={() => { setOnboardingInitialStep(2); setShowOnboarding(true); }} />
            </div>
          )}
        </div>
      </div>

      {/* 3. Command Palette Modal (Ctrl+K) */}
      <LogDock logs={logs} isRunning={isRunning} onClearLogs={() => setLogs([])} />
      <RunDetailsDrawer run={detailsRun} onClose={() => setDetailsRun(null)} onRerun={handleRerun} />
      <CommandPaletteModal
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        onRunTest={() => { void handleRunTest(); }}
        onStopTest={handleStopTest}
        isRunning={isRunning}
        onSelectTab={openWorkspaceTab}
        onSelectEngine={handleSelectEngine}
        onSelectScript={handleSelectScript}
        projects={projects}
        onSelectProject={handleSelectProject}
        onOpenNewSuite={() => setIsNewSuiteOpen(true)}
        onOpenSuite={handleOpenSuite}
      />

      {/* 4. Professional Setup / Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          runtimeStatuses={runtimeStatuses}
          runtimeProgress={runtimeProgress}
          runtimeInstalling={runtimeInstalling}
          onInstallRuntimes={(selection, consent) => void handleInstallRuntimes(selection, consent)}
          onCancelRuntimeInstall={() => void handleCancelRuntimeInstall()}
          initialStep={onboardingInitialStep}
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

      {/* 6. New Suite Modal */}
      <NewSuiteModal
        isOpen={isNewSuiteOpen}
        projectId={activeProjectId}
        projectName={activeProject?.name ?? ""}
        defaultEngine={activeProject?.defaultEngine ?? selectedEngineId}
        targetHost={activeProject?.targetHost ?? config.target.host}
        onClose={() => setIsNewSuiteOpen(false)}
        onCreate={handleCreateSuite}
      />
    </div>
  );
}
