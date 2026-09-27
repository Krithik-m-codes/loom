import { useState } from "react";
import { Activity, Check, Copy, Shield, Terminal } from "lucide-react";
import type { EngineInfo } from "../types";
import { LoomButton } from "./ui/LoomButton";
import { Panel, SectionHeader } from "./ui/Panel";
import { StatusBadge } from "./ui/StatusBadge";

interface EnginesViewProps {
  engines: EngineInfo[];
}

export const EnginesView: React.FC<EnginesViewProps> = ({ engines }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCommand = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <main className="loom-page loom-engines">
      <header className="loom-engines__header">
        <SectionHeader
          title={<span className="loom-engines__title"><Activity aria-hidden="true" size={19} /> Engine adapters & license architecture</span>}
          description="Loom invokes every load-testing engine as an independent subprocess; it never links, embeds, or compiles an engine binary."
        />
      </header>

      <div className="loom-engines__body">
        {engines.length === 0 ? (
          <Panel>
            <div className="loom-empty-state">
              <p className="loom-empty-state__title">No engines detected</p>
              <p className="loom-empty-state__description">Configured engines will appear here after Loom checks the binaries available on your local PATH.</p>
            </div>
          </Panel>
        ) : (
          <div className="loom-engines__list">
            {engines.map((engine) => {
              const ready = "Ready" in engine.availability;
              const version = "Ready" in engine.availability ? engine.availability.Ready.version : null;
              const installHint = "NotInstalled" in engine.availability ? engine.availability.NotInstalled.install_hint : null;
              const command = engine.id === "k6" ? "winget install k6.k6" : engine.id === "locust" ? "pip install locust" : "rustup update";

              return (
                <Panel key={engine.id} className="loom-engine-card">
                  <div className="loom-engine-card__header">
                    <div>
                      <div className="loom-engine-card__name"><h2>{engine.display_name}</h2><span className={`loom-engine-tier loom-engine-tier--${engine.license_tier.toLowerCase()}`}>{engine.license_tier} tier</span></div>
                      <p>SPDX: {engine.license} · Runtime: {engine.engine_language} · Scripts: {engine.supported_script_languages.join(", ")}</p>
                    </div>
                    <StatusBadge status={ready ? "ready" : "stopped"} label={ready ? "Ready" : "Not installed"} />
                  </div>

                  {ready && version && <code className="loom-engine-card__version">Detected version: {version}<span>Ready for subprocess execution</span></code>}

                  {!ready && installHint && (
                    <div className="loom-engine-card__install">
                      <div><span><Terminal aria-hidden="true" size={15} /> Installation required — bring your own binary</span><LoomButton type="button" variant="ghost" className="loom-engine-card__copy" onClick={() => copyCommand(engine.id, command)}>{copiedId === engine.id ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}{copiedId === engine.id ? "Copied" : "Copy command"}</LoomButton></div>
                      <pre>{installHint}</pre>
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}

        <Panel className="loom-engines__guarantee">
          <div><Shield aria-hidden="true" size={21} /><p><strong>Subprocess-only architecture guarantee.</strong> Permissive engines such as Locust and Goose are never compiled or linked into Loom. Copyleft engines such as k6 remain user-installed external binaries accessed through standard process isolation and JSON/CSV streaming.</p></div>
        </Panel>
      </div>
    </main>
  );
};
