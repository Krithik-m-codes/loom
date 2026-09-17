import { useState } from "react";
import { FolderPlus, Globe, X, Zap } from "lucide-react";
import { EngineInfo, Project, TestSuite } from "../../types";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  engines: EngineInfo[];
  onCreateProject: (project: Project) => void;
}

export const NewProjectModal = ({
  isOpen,
  onClose,
  engines,
  onCreateProject,
}: NewProjectModalProps) => {
  const [name, setName] = useState("");
  const [targetHost, setTargetHost] = useState("http://localhost:8080");
  const [selectedEngine, setSelectedEngine] = useState("locust");
  const [users, setUsers] = useState(20);
  const [spawnRate, setSpawnRate] = useState(5);
  const [duration, setDuration] = useState("1m");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const projectId = `proj-${Date.now()}`;
    let scriptPath = "examples/locust/basic_test.py";
    if (selectedEngine === "k6") scriptPath = "examples/k6/basic_test.js";
    if (selectedEngine === "goose") scriptPath = "examples/goose/loadtest.rs";

    const defaultSuite: TestSuite = {
      id: `suite-${Date.now()}`,
      name: "Default Load Scenario",
      engine: selectedEngine,
      scriptPath,
      config: {
        project_name: name,
        engine: selectedEngine,
        script_path: scriptPath,
        load_profile: {
          users,
          spawn_rate: spawnRate,
          duration,
        },
        target: {
          host: targetHost,
        },
      },
    };

    const newProject: Project = {
      id: projectId,
      name: name.trim(),
      description: description.trim() || "Load testing suite",
      targetHost: targetHost.trim() || "http://localhost:8080",
      defaultEngine: selectedEngine,
      createdAt: new Date().toISOString(),
      suites: [defaultSuite],
    };

    onCreateProject(newProject);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-[560px] max-w-[95vw] bg-[#141518] border border-[#26282D] rounded-[10px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#26282D] flex items-center justify-between bg-[#1C1E22]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[6px] bg-[#A3E635]/15 border border-[#A3E635]/30 flex items-center justify-center text-[#A3E635]">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#E8E9EB]">Create Load Testing Project</h3>
              <p className="text-[12px] text-[#9CA0A8] mt-0.5">
                Set up a new target system, concurrency parameters, and test suites
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-[4px] text-[#5C6068] hover:text-[#E8E9EB] hover:bg-[#26282D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[480px] overflow-y-auto">
          {/* Project Name */}
          <div>
            <label className="text-[12px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold">
              Project Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checkout Service Stress, Auth API Concurrency"
              className="w-full h-[38px] px-3.5 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] text-[13.5px] outline-none focus:border-[#A3E635] focus:ring-1 focus:ring-[#A3E635]/30"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[12px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Multi-endpoint user journey load test"
              className="w-full h-[38px] px-3.5 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] text-[13px] outline-none focus:border-[#A3E635] focus:ring-1 focus:ring-[#A3E635]/30"
            />
          </div>

          {/* Target Host */}
          <div>
            <label className="text-[12px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#A3E635]" />
              <span>Base Target Host URL *</span>
            </label>
            <input
              type="text"
              required
              value={targetHost}
              onChange={(e) => setTargetHost(e.target.value)}
              placeholder="http://localhost:8080 or https://api.staging.example.com"
              className="w-full h-[38px] px-3.5 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] font-mono text-[13px] outline-none focus:border-[#A3E635] focus:ring-1 focus:ring-[#A3E635]/30"
            />
          </div>

          {/* Engine Selection */}
          <div>
            <label className="text-[12px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#A3E635]" />
              <span>Default Load Testing Engine</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {engines.map((eng) => {
                const isSelected = selectedEngine === eng.id;
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setSelectedEngine(eng.id)}
                    className={`p-3 rounded-[6px] border text-left flex flex-col justify-between transition-all ${
                      isSelected
                        ? "bg-[#1C1E22] border-[#A3E635] ring-1 ring-[#A3E635]/40 shadow-sm"
                        : "bg-[#1C1E22]/60 border-[#26282D] hover:border-[#3A3D44]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[13px] text-[#E8E9EB]">{eng.display_name}</span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                          eng.license_tier === "Plugin"
                            ? "bg-[#F5A623]/15 text-[#F5A623]"
                            : "bg-[#A3E635]/15 text-[#A3E635]"
                        }`}
                      >
                        {eng.license_tier}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#5C6068] font-mono">{eng.engine_language}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Initial Load Profile */}
          <div className="grid grid-cols-3 gap-3.5 pt-2 border-t border-[#26282D]">
            <div>
              <label className="text-[11px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold">
                Initial Users (VUs)
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={users}
                onChange={(e) => setUsers(parseInt(e.target.value) || 10)}
                className="w-full h-[36px] px-3 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] font-mono text-[13px] outline-none focus:border-[#A3E635]"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold">
                Spawn Rate (/s)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={spawnRate}
                onChange={(e) => setSpawnRate(parseInt(e.target.value) || 1)}
                className="w-full h-[36px] px-3 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] font-mono text-[13px] outline-none focus:border-[#A3E635]"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#9CA0A8] mb-1.5 block font-semibold">
                Duration
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 1m, 5m, 30s"
                className="w-full h-[36px] px-3 rounded-[6px] bg-[#1C1E22] border border-[#26282D] text-[#E8E9EB] font-mono text-[13px] outline-none focus:border-[#A3E635]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#26282D] flex items-center justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-[13px] px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn-primary text-[13px] px-5 font-bold tracking-wide shadow-lg shadow-[#A3E635]/20"
            >
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
