import { useState } from "react";
import { FolderPlus, Globe, X, Zap } from "lucide-react";
import type { EngineInfo, Project, TestSuite } from "../../types";
import { LoomButton } from "../ui/LoomButton";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  engines: EngineInfo[];
  onCreateProject: (project: Project) => void;
}

export const NewProjectModal = ({ isOpen, onClose, engines, onCreateProject }: NewProjectModalProps) => {
  const [name, setName] = useState("");
  const [targetHost, setTargetHost] = useState("http://localhost:8080");
  const [selectedEngine, setSelectedEngine] = useState("locust");
  const [users, setUsers] = useState(20);
  const [spawnRate, setSpawnRate] = useState(5);
  const [duration, setDuration] = useState("1m");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
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
        load_profile: { users, spawn_rate: spawnRate, duration },
        target: { host: targetHost },
      },
    };

    onCreateProject({
      id: projectId,
      name: name.trim(),
      description: description.trim() || "Load testing suite",
      targetHost: targetHost.trim() || "http://localhost:8080",
      defaultEngine: selectedEngine,
      createdAt: new Date().toISOString(),
      suites: [defaultSuite],
    });
    onClose();
  };

  return (
    <div className="loom-modal-backdrop loom-modal-backdrop--centered">
      <div className="loom-modal loom-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <header className="loom-project-modal__header">
          <div className="loom-project-modal__heading">
            <span className="loom-project-modal__icon"><FolderPlus aria-hidden="true" size={20} /></span>
            <div>
              <h2 id="new-project-title">Create load testing project</h2>
              <p>Set a target, initial concurrency, and a default engine-ready suite.</p>
            </div>
          </div>
          <LoomButton type="button" variant="ghost" className="loom-icon-button" onClick={onClose} aria-label="Close project creation dialog">
            <X aria-hidden="true" size={18} />
          </LoomButton>
        </header>

        <form onSubmit={handleSubmit} className="loom-project-form">
          <div className="loom-form-field">
            <label htmlFor="project-name">Project name <span aria-hidden="true">*</span></label>
            <input
              id="project-name"
              aria-label="Project name"
              className="loom-input"
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Checkout Service Stress"
              autoFocus
            />
          </div>

          <div className="loom-form-field">
            <label htmlFor="project-description">Description <span className="loom-form-field__optional">optional</span></label>
            <input
              id="project-description"
              className="loom-input"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Multi-endpoint user journey load test"
            />
          </div>

          <div className="loom-form-field">
            <label htmlFor="project-target"><Globe aria-hidden="true" size={14} /> Base target host URL <span aria-hidden="true">*</span></label>
            <input
              id="project-target"
              className="loom-input loom-mono"
              type="text"
              required
              value={targetHost}
              onChange={(event) => setTargetHost(event.target.value)}
              placeholder="https://api.staging.example.com"
            />
          </div>

          <fieldset className="loom-form-field">
            <legend><Zap aria-hidden="true" size={14} /> Default load testing engine</legend>
            <div className="loom-engine-choice-grid">
              {engines.map((engine) => {
                const selected = selectedEngine === engine.id;
                return (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => setSelectedEngine(engine.id)}
                    className={`loom-engine-choice ${selected ? "loom-engine-choice--active" : ""}`}
                    aria-pressed={selected}
                  >
                    <span className="loom-engine-choice__header">
                      <strong>{engine.display_name}</strong>
                      <span className={`loom-engine-tier loom-engine-tier--${engine.license_tier.toLowerCase()}`}>{engine.license_tier}</span>
                    </span>
                    <span>{engine.engine_language}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="loom-project-form__load-profile">
            <legend>Initial load profile</legend>
            <div className="loom-project-form__load-grid">
              <div className="loom-form-field">
                <label htmlFor="project-users">Initial users</label>
                <input id="project-users" className="loom-input loom-mono" type="number" min="1" max="5000" value={users} onChange={(event) => setUsers(parseInt(event.target.value) || 10)} />
              </div>
              <div className="loom-form-field">
                <label htmlFor="project-spawn-rate">Spawn rate / sec</label>
                <input id="project-spawn-rate" className="loom-input loom-mono" type="number" min="1" max="100" value={spawnRate} onChange={(event) => setSpawnRate(parseInt(event.target.value) || 1)} />
              </div>
              <div className="loom-form-field">
                <label htmlFor="project-duration">Duration</label>
                <input id="project-duration" className="loom-input loom-mono" type="text" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="e.g. 1m, 5m, 30s" />
              </div>
            </div>
          </fieldset>

          <footer className="loom-project-form__actions">
            <LoomButton type="button" variant="secondary" onClick={onClose}>Cancel</LoomButton>
            <LoomButton type="submit" disabled={!name.trim()}>Create Project</LoomButton>
          </footer>
        </form>
      </div>
    </div>
  );
};
