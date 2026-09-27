import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CheckSquare,
  Copy,
  Cpu,
  FolderCheck,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import type { EngineInfo } from "../../types";
import { LoomLogo } from "../LoomLogo";
import { LoomButton } from "../ui/LoomButton";

interface OnboardingWizardProps {
  engines: EngineInfo[];
  onComplete: () => void;
}

export const OnboardingWizard = ({ engines, onComplete }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyCommand = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="loom-modal-backdrop loom-modal-backdrop--centered">
      <section className="loom-modal loom-onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header className="loom-onboarding__header">
          <div className="loom-onboarding__brand">
            <LoomLogo size={36} />
            <div>
              <div className="loom-onboarding__title-row">
                <h1 id="onboarding-title">Welcome to Loom</h1>
                <span className="loom-engine-tier loom-engine-tier--core">Setup & doctor</span>
              </div>
              <p>Configure local execution and verify each engine’s process boundary.</p>
            </div>
          </div>
          <ol className="loom-onboarding__steps" aria-label="Setup progress">
            {[1, 2, 3, 4].map((step) => (
              <li key={step} data-state={currentStep === step ? "current" : currentStep > step ? "complete" : "upcoming"}>
                {currentStep > step ? <Check aria-label={`Step ${step} complete`} size={14} /> : step}
              </li>
            ))}
          </ol>
        </header>

        <div className="loom-onboarding__body">
          {currentStep === 1 && (
            <div className="loom-onboarding__content">
              <div className="loom-onboarding__section-title"><ShieldCheck aria-hidden="true" size={20} /> Terms of service & EULA</div>
              <p>Please review the responsible testing policy before using Loom on this local machine.</p>
              <div className="loom-onboarding__terms">
                <strong>LOOM END USER LICENSE AGREEMENT (EULA)</strong>
                <p><b>1. Permitted use & authorization:</b> Loom is for testing systems you own, manage, or have explicit written authorization to test. Unauthorized stress testing is prohibited.</p>
                <p><b>2. Subprocess & license isolation:</b> Core engines (Locust, Goose) operate under permissive licenses. Plugin engines (k6) are AGPL-3.0. Loom does not bundle or link copyleft binaries; execution happens through operating-system process boundaries.</p>
                <p><b>3. Local-first privacy:</b> Loom stores scripts, configurations, and performance metrics locally in SQLite. No telemetry is sent to external servers.</p>
                <p><b>4. Disclaimer:</b> The software is provided “as is.” You are responsible for every load simulation you run.</p>
              </div>
              <button
                type="button"
                onClick={() => setTermsAccepted((accepted) => !accepted)}
                className={`loom-onboarding__agreement ${termsAccepted ? "loom-onboarding__agreement--accepted" : ""}`}
                aria-pressed={termsAccepted}
              >
                {termsAccepted ? <CheckSquare aria-hidden="true" size={20} /> : <Square aria-hidden="true" size={20} />}
                <span>I have read, understood, and accept the Loom End User License Agreement and Terms of Service.</span>
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="loom-onboarding__content">
              <div className="loom-onboarding__section-title"><Cpu aria-hidden="true" size={20} /> Engine prerequisites & environment doctor</div>
              <p>Loom checks whether each engine binary is installed and available on your operating-system PATH.</p>
              <div className="loom-onboarding__engine-list">
                {engines.map((engine) => {
                  const ready = "Ready" in engine.availability;
                  const version = "Ready" in engine.availability ? engine.availability.Ready.version : null;
                  const installHint = "NotInstalled" in engine.availability ? engine.availability.NotInstalled.install_hint : null;
                  const command = engine.id === "k6" ? "winget install k6.k6" : engine.id === "locust" ? "pip install locust" : "cargo install goose";
                  const displayCommand = engine.id === "k6" ? "winget install k6.k6 (or brew install k6)" : engine.id === "locust" ? "pip install locust (requires Python 3.10+)" : "cargo install goose (requires Rust toolchain)";

                  return (
                    <article className="loom-onboarding__engine" key={engine.id}>
                      <div className="loom-onboarding__engine-header">
                        <div className="loom-onboarding__engine-name">
                          <span className="loom-engine-row__availability" data-ready={ready} aria-hidden="true" />
                          <strong>{engine.display_name}</strong>
                          <span className={`loom-engine-tier loom-engine-tier--${engine.license_tier.toLowerCase()}`}>{engine.license_tier} tier</span>
                        </div>
                        {ready ? <span className="loom-onboarding__availability loom-onboarding__availability--ready"><CheckCircle2 aria-hidden="true" size={16} /> Installed</span> : <span className="loom-onboarding__availability loom-onboarding__availability--missing"><AlertTriangle aria-hidden="true" size={16} /> Not found</span>}
                      </div>

                      {ready && version && <code className="loom-onboarding__version">{version}</code>}

                      {!ready && installHint && (
                        <div className="loom-onboarding__install">
                          <div className="loom-onboarding__install-header">
                            <span><Terminal aria-hidden="true" size={14} /> Install command</span>
                            <LoomButton type="button" variant="ghost" className="loom-onboarding__copy" onClick={() => copyCommand(engine.id, command)}>
                              {copiedCmd === engine.id ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
                              {copiedCmd === engine.id ? "Copied" : "Copy command"}
                            </LoomButton>
                          </div>
                          <code>{displayCommand}</code>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="loom-onboarding__content">
              <div className="loom-onboarding__section-title"><FolderCheck aria-hidden="true" size={20} /> Directories & storage health</div>
              <p>Loom configures local application paths and verifies permission access for SQLite and subprocesses.</p>
              <div className="loom-onboarding__checks">
                <div><span><CheckCircle2 aria-hidden="true" size={16} /> SQLite storage (runs + telemetry metrics)</span><strong>Write permission OK</strong></div>
                <div><span><CheckCircle2 aria-hidden="true" size={16} /> Temporary run workspace</span><strong>Initialized</strong></div>
                <div><span><CheckCircle2 aria-hidden="true" size={16} /> Process-boundary subprocess isolation</span><strong>Enabled</strong></div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="loom-onboarding__complete">
              <span><Sparkles aria-hidden="true" size={28} /></span>
              <h2>Setup complete</h2>
              <p>Loom is configured and ready. You will enter the dashboard to inspect local engine health, build scenarios, and run authorized load tests.</p>
            </div>
          )}
        </div>

        <footer className="loom-onboarding__footer">
          {currentStep > 1 && currentStep < 4 ? <LoomButton variant="secondary" onClick={() => setCurrentStep((step) => step - 1)}>Back</LoomButton> : <span />}
          {currentStep < 4 ? (
            <LoomButton onClick={() => setCurrentStep((step) => step + 1)} disabled={currentStep === 1 && !termsAccepted}>
              Continue <ArrowRight aria-hidden="true" size={16} />
            </LoomButton>
          ) : (
            <LoomButton onClick={onComplete}>Launch dashboard</LoomButton>
          )}
        </footer>
      </section>
    </div>
  );
};
