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

const DEFAULT_PROJECTS: Project[] = [
  {
    id: "proj-ecommerce",
    name: "E-Commerce Benchmark",
    description: "Multi-endpoint store journey load & stress test",
    targetHost: "http://localhost:8080",
    defaultEngine: "locust",
    createdAt: new Date().toISOString(),
    suites: [
      {
        id: "suite-locust-main",
        name: "Full User Journey",
        engine: "locust",
        scriptPath: "examples/locust/basic_test.py",
        config: {
          project_name: "E-Commerce Benchmark",
          engine: "locust",
          script_path: "examples/locust/basic_test.py",
          load_profile: { users: 20, spawn_rate: 5, duration: "60s" },
          target: { host: "http://localhost:8080" },
        },
      },
      {
        id: "suite-goose-burst",
        name: "Checkout Peak Concurrency",
        engine: "goose",
        scriptPath: "examples/goose/loadtest.rs",
        config: {
          project_name: "E-Commerce Benchmark",
          engine: "goose",
          script_path: "examples/goose/loadtest.rs",
          load_profile: { users: 50, spawn_rate: 10, duration: "30s" },
          target: { host: "http://localhost:8080" },
        },
      },
      {
        id: "suite-k6-stress",
        name: "Cart API Stress",
        engine: "k6",
        scriptPath: "examples/k6/basic_test.js",
        config: {
          project_name: "E-Commerce Benchmark",
          engine: "k6",
          script_path: "examples/k6/basic_test.js",
          load_profile: { users: 30, spawn_rate: 5, duration: "45s" },
          target: { host: "http://localhost:8080" },
        },
      },
    ],
  },
  {
    id: "proj-gateway",
    name: "API Gateway & Auth Stress",
    description: "High-frequency token authentication test suite",
    targetHost: "https://httpbin.org",
    defaultEngine: "goose",
    createdAt: new Date().toISOString(),
    suites: [
      {
        id: "suite-auth-burst",
        name: "High-Throughput Native Goose",
        engine: "goose",
        scriptPath: "examples/goose/loadtest.rs",
        config: {
          project_name: "API Gateway & Auth Stress",
          engine: "goose",
          script_path: "examples/goose/loadtest.rs",
          load_profile: { users: 100, spawn_rate: 20, duration: "60s" },
          target: { host: "https://httpbin.org" },
        },
      },
    ],
  },
];

export default function App() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string>("locust");
  // Default to Dashboard directly as requested
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<NormalizedMetric[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [isCmdkOpen, setIsCmdkOpen] = useState<boolean>(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState<boolean>(false);

  // Projects state
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem("loom_projects");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PROJECTS;
  });
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("loom_active_project_id");
      if (saved) return saved;
    } catch {}
    return DEFAULT_PROJECTS[0]?.id || "proj-ecommerce";
  });

  // Professional Onboarding Wizard state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem("loom_onboarding_completed");
    } catch {
      return false;
    }
  });

  // Default test configuration
  const [config, setConfig] = useState<TestConfig>(() => {
    const activeProj =
      projects.find((p) => p.id === activeProjectId) || projects[0];
    const firstSuite = activeProj?.suites[0];
    if (firstSuite) return firstSuite.config;

    return {
      project_name: "Loom Demo Project",
      engine: "locust",
      script_path: "examples/locust/basic_test.py",
      load_profile: {
        users: 10,
        spawn_rate: 2,
        duration: "30s",
      },
      target: {
        host: "http://localhost:8080",
      },
    };
  });

  // Load engines on mount
  useEffect(() => {
    loadEngineList();
  }, []);

  const loadEngineList = async () => {
    try {
      const list = await listEngines();
      setEngines(list);
      if (list.length > 0 && !list.find((e) => e.id === selectedEngineId)) {
        setSelectedEngineId(list[0].id);
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
    setActiveProjectId(projectId);
    try {
      localStorage.setItem("loom_active_project_id", projectId);
    } catch {}
    const proj = projects.find((p) => p.id === projectId);
    if (proj && proj.suites.length > 0) {
      const suite = proj.suites[0];
      setSelectedEngineId(suite.engine);
      setConfig(suite.config);
    }
  };

  const handleCreateProject = (newProj: Project) => {
    const updated = [newProj, ...projects];
    setProjects(updated);
    setActiveProjectId(newProj.id);
    try {
      localStorage.setItem("loom_projects", JSON.stringify(updated));
      localStorage.setItem("loom_active_project_id", newProj.id);
    } catch {}
    if (newProj.suites.length > 0) {
      const suite = newProj.suites[0];
      setSelectedEngineId(suite.engine);
      setConfig(suite.config);
    }
    setIsNewProjectOpen(false);
  };

  const handleSelectEngine = (engineId: string) => {
    setSelectedEngineId(engineId);
    let script = config.script_path;
    if (engineId === "locust") {
      script = "examples/locust/basic_test.py";
    } else if (engineId === "k6") {
      script = "examples/k6/basic_test.js";
    } else if (engineId === "goose") {
      script = "examples/goose/loadtest.rs";
    }

    setConfig((prev) => ({
      ...prev,
      engine: engineId,
      script_path: script,
    }));
  };

  const handleSelectScript = (path: string, engine: string) => {
    setSelectedEngineId(engine);
    setConfig((prev) => ({
      ...prev,
      engine,
      script_path: path,
    }));
  };

  const handleRunTest = async () => {
    if (isRunning) return;

    // Reset telemetry & navigate to Locust/Goose-grade runner dashboard
    setActiveTab("runner");
    setMetrics([]);
    setLogs([]);
    setIsRunning(true);

    try {
      const fullConfig = {
        ...config,
        engine: selectedEngineId,
      };
      const runId = await startRun(selectedEngineId, fullConfig);
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
    }

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
    <div className="flex h-full w-full bg-[#0A0A0B] text-[#E8E9EB] font-sans antialiased overflow-hidden select-none">
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
        <div className="flex-1 flex overflow-hidden">
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
