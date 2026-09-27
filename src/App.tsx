import { useState, useEffect } from "react";
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
  startRun,
  stopRun,
  saveScript,
  subscribeToMetrics,
  subscribeToLogs,
  subscribeToRunStarted,
  subscribeToRunFinished,
} from "./lib/ipc";
import { EngineInfo, NormalizedMetric, Project, RunLog, TestConfig } from "./types";
import { configForSuite, loadProjectState, projectConfigForSelection } from "./lib/projectState";

export default function App() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  // Default to Dashboard directly as requested
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<NormalizedMetric[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [isCmdkOpen, setIsCmdkOpen] = useState<boolean>(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState<boolean>(false);
  const [flowExportError, setFlowExportError] = useState<string>("");

  // Projects state
  const [initialProjectState] = useState(() => {
    try {
      return loadProjectState(localStorage.getItem("loom_projects"), localStorage.getItem("loom_active_project_id"));
    } catch {
      return loadProjectState(null, null);
    }
  });
  const [projects, setProjects] = useState<Project[]>(initialProjectState.projects);
  const [persistedProjects, setPersistedProjects] = useState<unknown[]>(initialProjectState.persistedProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialProjectState.activeProjectId);

  useEffect(() => {
    if (!initialProjectState.shouldPersist) return;
    try {
      localStorage.setItem("loom_projects", JSON.stringify(initialProjectState.persistedProjects));
      localStorage.setItem("loom_active_project_id", initialProjectState.activeProjectId);
    } catch {}
  }, [initialProjectState]);

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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setActiveProjectId(projectId);
    try {
      localStorage.setItem("loom_active_project_id", projectId);
    } catch {}
    const nextConfig = projectConfigForSelection(projects, projectId);
    setSelectedEngineId(nextConfig.engine);
    setConfig(nextConfig);
  };

  const handleCreateProject = (newProj: Project) => {
    const updated = [newProj, ...projects];
    const updatedStored = [newProj, ...persistedProjects];
    setProjects(updated);
    setPersistedProjects(updatedStored);
    setActiveProjectId(newProj.id);
    try {
      localStorage.setItem("loom_projects", JSON.stringify(updatedStored));
      localStorage.setItem("loom_active_project_id", newProj.id);
    } catch {}
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
    setActiveTab("runner");
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
      setActiveTab("runner");
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
    setActiveTab("runner");
  };

  const handleCompleteOnboarding = () => {
    try {
      localStorage.setItem("loom_onboarding_completed", "true");
    } catch {}
    setShowOnboarding(false);
    setActiveTab("dashboard");
  };

  const selectedEngineObj = engines.find((e) => e.id === selectedEngineId);
  const selectedEngineName = selectedEngineObj?.display_name || selectedEngineId;

  return (
    <div className="loom-app-shell select-none">
      <a className="loom-skip-link" href="#main-content">Skip to workspace content</a>
      {/* 1. Bruno + Kubus Sidebar */}
      <Sidebar
        engines={engines}
        selectedEngineId={selectedEngineId}
        onSelectEngine={handleSelectEngine}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCmdk={() => setIsCmdkOpen(true)}
        isRunning={isRunning}
        selectedScript={config.script_path}
        onSelectScript={handleSelectScript}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
      />

      {/* 2. Main Work Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Horizontal Tab Navigation */}
        <TopNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isRunning={isRunning}
          canRun={canRun}
          onRunTest={handleRunTest}
          onStopTest={handleStopTest}
          selectedEngineName={selectedEngineName}
          targetHost={config.target.host}
          onChangeTargetHost={(host) =>
            setConfig((prev) => ({
              ...prev,
              target: { ...prev.target, host },
            }))
          }
          activeTestName={config.script_path.split("/").pop() || "Test"}
        />

        {/* Tab Views */}
        {flowExportError && <p className="loom-action-error" role="alert">{flowExportError}</p>}
        <div id="main-content" className="flex-1 flex overflow-hidden" tabIndex={-1}>
          {activeTab === "dashboard" && (
            <DashboardView
              engines={engines}
              onNavigate={setActiveTab}
              onSelectEngine={handleSelectEngine}
              targetHost={config.target.host}
              onRerun={handleRerun}
            />
          )}

          {activeTab === "flowchart" && (
            <FlowchartBuilderView
              onExportToRunner={handleExportFlowchartScript}
              targetHost={config.target.host}
            />
          )}

          {activeTab === "runner" && (
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
          )}

          {activeTab === "editor" && (
            <ScriptEditorView
              scriptPath={config.script_path}
              onSelectScript={handleSelectScript}
              onRunTest={() => {
                setActiveTab("runner");
                handleRunTest();
              }}
            />
          )}

          {activeTab === "history" && <HistoryView onRerun={handleRerun} />}

          {activeTab === "engines" && <EnginesView engines={engines} />}
        </div>
      </div>

      {/* 3. Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        onRunTest={handleRunTest}
        onStopTest={handleStopTest}
        isRunning={isRunning}
        onSelectTab={setActiveTab}
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
