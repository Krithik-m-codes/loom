import { useState } from "react";
import { FolderPlus, Globe, X, Zap } from "lucide-react";
import type { EngineInfo, Project } from "../../types";
import { createProject } from "../../lib/ipc";
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
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setError("");
    setIsSubmitting(true);
    try {
      const created = await createProject(name.trim(), targetHost.trim(), selectedEngine);
      const now = new Date().toISOString();
      onCreateProject({
        ...created,
        suites: [],
        createdAt: created.createdAt ?? now,
        updatedAt: created.updatedAt ?? now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="loom-modal-backdrop loom-modal-backdrop--centered">
      <div className="loom-modal loom-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <header className="loom-project-modal__header">
          <div className="loom-project-modal__heading">
            <span className="loom-project-modal__icon"><FolderPlus aria-hidden="true" size={20} /></span>
            <div>
              <h2 id="new-project-title">Create load testing project</h2>
              <p>Set a target and a default engine, then create suites from templates.</p>
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

          {error && <p className="loom-action-error" role="alert">{error}</p>}

          <footer className="loom-project-form__actions">
            <LoomButton type="button" variant="secondary" onClick={onClose}>Cancel</LoomButton>
            <LoomButton type="submit" disabled={!name.trim() || isSubmitting}>Create Project</LoomButton>
          </footer>
        </form>
      </div>
    </div>
  );
};
