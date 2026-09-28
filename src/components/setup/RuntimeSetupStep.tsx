import { useState } from "react";
import { CheckCircle2, Download, LoaderCircle, ShieldAlert, XCircle } from "lucide-react";
import type { RuntimeId, RuntimeProgress, RuntimeStatus } from "../../types";
import type { K6Consent, RuntimeSelection } from "../../lib/runtime-ipc";
import { LoomButton } from "../ui/LoomButton";

interface RuntimeSetupStepProps {
  statuses: RuntimeStatus[];
  progress: RuntimeProgress | null;
  isInstalling?: boolean;
  onInstall: (selection: RuntimeSelection, consent?: K6Consent) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onContinue: () => void;
}

const engines: { id: RuntimeId; name: string; description: string }[] = [
  { id: "locust", name: "Locust", description: "Python scenarios for distributed load testing." },
  { id: "goose", name: "Goose", description: "Rust-based load tests, compiled on your machine." },
  { id: "k6", name: "k6", description: "JavaScript scenarios. Optional; requires separate AGPL acceptance." },
];

export function RuntimeSetupStep({ statuses, progress, isInstalling = false, onInstall, onCancel, onContinue }: RuntimeSetupStepProps) {
  const [selection, setSelection] = useState<RuntimeSelection>({ locust: true, goose: true, k6: false });
  const [k6Accepted, setK6Accepted] = useState(false);
  const [licenseError, setLicenseError] = useState(false);
  const statusByEngine = new Map<RuntimeId, RuntimeStatus>([["locust", statuses[0] ?? { status: "missing" }], ["goose", statuses[1] ?? { status: "missing" }], ["k6", statuses[2] ?? { status: "missing" }]]);
  const total = progress?.totalBytes;

  const startInstall = () => {
    if (selection.k6 && !k6Accepted) {
      setLicenseError(true);
      return;
    }
    setLicenseError(false);
    const consent = selection.k6 ? { acceptedAt: new Date().toISOString(), license: "AGPL-3.0-only" as const } : undefined;
    void onInstall(selection, consent);
  };

  return (
    <section className="loom-runtime-setup" aria-labelledby="runtime-setup-title">
      <div className="loom-runtime-setup__intro">
        <div className="loom-onboarding__section-title"><Download aria-hidden="true" size={19} /> Install load-testing engines</div>
        <p id="runtime-setup-title">Loom installs selected tools in your user account. No administrator access or system PATH changes are needed.</p>
      </div>

      <div className="loom-runtime-setup__engines">
        {engines.map((engine) => {
          const status = statusByEngine.get(engine.id)!;
          const ready = status.status === "ready";
          return (
            <label className="loom-runtime-setup__engine" key={engine.id} data-ready={ready}>
              <input
                type="checkbox"
                aria-label={`Install ${engine.name}`}
                checked={selection[engine.id]}
                disabled={isInstalling || ready}
                onChange={(event) => setSelection((current) => ({ ...current, [engine.id]: event.target.checked }))}
              />
              <span className="loom-runtime-setup__engine-copy">
                <strong>{engine.name}</strong>
                <small>{ready ? `Ready · ${status.version}` : engine.description}</small>
              </span>
              <span className="loom-runtime-setup__state" aria-label={ready ? "Ready" : status.status}>
                {ready ? <CheckCircle2 size={17} aria-hidden="true" /> : status.status === "failed" ? <XCircle size={17} aria-hidden="true" /> : status.status === "installing" ? <LoaderCircle size={17} aria-hidden="true" /> : null}
                {ready ? "Ready" : status.status === "failed" ? "Needs attention" : status.status === "installing" ? "Installing" : "Optional"}
              </span>
            </label>
          );
        })}
      </div>

      {selection.k6 && (
        <label className="loom-runtime-setup__license">
          <input type="checkbox" aria-label="I accept k6's AGPL-3.0 license" checked={k6Accepted} disabled={isInstalling} onChange={(event) => setK6Accepted(event.target.checked)} />
          <span>I accept k6’s AGPL-3.0 license for the separately installed k6 executable.</span>
        </label>
      )}
      {licenseError && <p className="loom-runtime-setup__error" role="alert"><ShieldAlert size={16} aria-hidden="true" /> Please accept the AGPL-3.0 license separately before installing k6.</p>}

      {progress && (
        <div className="loom-runtime-setup__progress" role="status" aria-live="polite">
          <div><LoaderCircle size={16} aria-hidden="true" /><strong>{engines.find((engine) => engine.id === progress.runtime)?.name}</strong><span>{progress.message}</span></div>
          <progress aria-label={`${progress.runtime} installation progress`} max={total ?? 1} value={total ? Math.min(progress.bytesReceived, total) : undefined} aria-valuetext={total ? `${Math.round((progress.bytesReceived / total) * 100)}%` : "Progress is being determined"} />
        </div>
      )}

      {statuses.some((status) => status.status === "failed") && <p className="loom-runtime-setup__error" role="status">One or more tools could not be installed. You can retry later from Engine settings; Loom is still ready to open.</p>}
      <footer className="loom-runtime-setup__actions">
        {isInstalling ? <LoomButton variant="secondary" onClick={() => void onCancel()}>Cancel installation</LoomButton> : <LoomButton onClick={startInstall} disabled={!selection.locust && !selection.goose && !selection.k6}>Install selected runtimes</LoomButton>}
        <LoomButton variant="ghost" onClick={onContinue}>Continue to Loom</LoomButton>
      </footer>
    </section>
  );
}
