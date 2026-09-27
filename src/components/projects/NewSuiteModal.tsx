import { useState } from "react";
import { FilePlus2, X, Zap } from "lucide-react";
import { createSuite } from "../../lib/ipc";
import type { StarterTemplate } from "../../templates";
import type { TestConfig, TestSuite } from "../../types";
import { LoomButton } from "../ui/LoomButton";
import { TemplatePickerModal } from "./TemplatePickerModal";

interface NewSuiteModalProps {
  isOpen: boolean;
  projectId: string;
  defaultEngine?: string;
  targetHost?: string;
  projectName?: string;
  onClose: () => void;
  onCreate: (suite: TestSuite) => void;
}

const ENGINE_OPTIONS = ["locust", "k6", "goose"] as const;

const DEFAULT_LOAD_PROFILE = { users: 10, spawn_rate: 2, duration: "30s" };

export const NewSuiteModal = ({
  isOpen,
  projectId,
  defaultEngine,
  targetHost,
  projectName = "",
  onClose,
  onCreate,
}: NewSuiteModalProps) => {
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<string>(defaultEngine ?? "locust");
  const [scriptContent, setScriptContent] = useState("");
  const [template, setTemplate] = useState<StarterTemplate | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const loadProfile = template ? template.config : DEFAULT_LOAD_PROFILE;

  const handleSelectEngine = (engineId: string) => {
    setEngine(engineId);
    setTemplate(null);
    setScriptContent("");
  };

  const handlePickTemplate = (picked: StarterTemplate) => {
    setTemplate(picked);
    setScriptContent(picked.script);
    setIsPickerOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Suite name is required.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const config: TestConfig = {
        project_name: projectName,
        engine,
        script_path: "",
        load_profile: { ...loadProfile },
        target: { host: targetHost ?? "" },
      };
      const suite = await createSuite({
        projectId,
        name: name.trim(),
        engine,
        scriptContent,
        config,
      });
      onCreate(suite);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="loom-modal-backdrop loom-modal-backdrop--centered">
      <div className="loom-modal loom-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-suite-title">
        <header className="loom-project-modal__header">
          <div className="loom-project-modal__heading">
            <span className="loom-project-modal__icon"><FilePlus2 aria-hidden="true" size={20} /></span>
            <div>
              <h2 id="new-suite-title">Create test suite</h2>
              <p>Pick an engine, optionally start from a template, then edit the script.</p>
            </div>
          </div>
          <LoomButton type="button" variant="ghost" className="loom-icon-button" onClick={onClose} aria-label="Close suite creation dialog">
            <X aria-hidden="true" size={18} />
          </LoomButton>
        </header>

        <form onSubmit={handleSubmit} className="loom-project-form">
          <div className="loom-form-field">
            <label htmlFor="suite-name">Suite name <span aria-hidden="true">*</span></label>
            <input
              id="suite-name"
              aria-label="Suite name"
              className="loom-input"
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Checkout smoke test"
              autoFocus
            />
          </div>

          <fieldset className="loom-form-field">
            <legend><Zap aria-hidden="true" size={14} /> Engine</legend>
            <div className="loom-engine-choice-grid">
              {ENGINE_OPTIONS.map((engineId) => {
                const selected = engine === engineId;
                return (
                  <button
                    key={engineId}
                    type="button"
                    onClick={() => handleSelectEngine(engineId)}
                    className={`loom-engine-choice ${selected ? "loom-engine-choice--active" : ""}`}
                    aria-pressed={selected}
                  >
                    <strong>{engineId}</strong>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="loom-form-field">
            <LoomButton type="button" variant="secondary" onClick={() => setIsPickerOpen(true)}>
              Start from template
            </LoomButton>
            {template ? (
              <p className="loom-form-field__hint">
                Template: {template.name} — {loadProfile.users} users, {loadProfile.spawn_rate}/s spawn rate, {loadProfile.duration} duration.
              </p>
            ) : (
              <p className="loom-form-field__hint">
                Default load profile: {loadProfile.users} users, {loadProfile.spawn_rate}/s spawn rate, {loadProfile.duration} duration.
              </p>
            )}
          </div>

          {error && <p className="loom-action-error" role="alert">{error}</p>}

          <footer className="loom-project-form__actions">
            <LoomButton type="button" variant="secondary" onClick={onClose}>Cancel</LoomButton>
            <LoomButton type="submit" disabled={!name.trim() || isSubmitting}>Create Suite</LoomButton>
          </footer>
        </form>
      </div>

      <TemplatePickerModal
        isOpen={isPickerOpen}
        engine={engine}
        onClose={() => setIsPickerOpen(false)}
        onPick={handlePickTemplate}
      />
    </div>
  );
};
