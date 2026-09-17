import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Terminal,
} from "lucide-react";
import { EngineInfo } from "../types";

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
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-y-auto p-8">
      {/* Header Banner */}
      <div className="max-w-4xl mx-auto w-full mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="w-5 h-5 text-[#A3E635]" />
          <h2 className="text-xl font-bold text-[#E8E9EB] tracking-tight">
            Engine Adapters & License Architecture
          </h2>
        </div>
        <p className="text-[13.5px] text-[#9CA0A8] leading-relaxed">
          Loom orchestrates load-testing engines via a consistent adapter trait. Engines are{" "}
          <strong className="text-[#E8E9EB]">ALWAYS invoked as independent subprocesses</strong>. No engine
          is ever linked, embedded, or compiled into Loom’s desktop binary.
        </p>
      </div>

      {/* Engines Grid */}
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-4">
        {engines.map((eng) => {
          const isReady = "Ready" in eng.availability;
          const isPlugin = eng.license_tier === "Plugin";
          const version = "Ready" in eng.availability ? eng.availability.Ready.version : null;
          const installHint = "NotInstalled" in eng.availability ? eng.availability.NotInstalled.install_hint : null;

          return (
            <div
              key={eng.id}
              className="p-6 rounded-[8px] bg-[#141518] border border-[#26282D] flex flex-col gap-3.5 transition-colors hover:border-[#3A3D44] shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      isReady ? "bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-[#F5A623]"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-[#E8E9EB]">
                        {eng.display_name}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                          isPlugin
                            ? "bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30"
                            : "bg-[#A3E635]/10 text-[#A3E635] border border-[#A3E635]/30"
                        }`}
                      >
                        {eng.license_tier} Tier
                      </span>
                      <span className="text-[11px] font-mono text-[#9CA0A8] bg-[#1C1E22] px-2 py-0.5 rounded border border-[#26282D]">
                        SPDX: {eng.license}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#5C6068] mt-1 font-mono">
                      Engine Runtime: {eng.engine_language} | Scripting:{" "}
                      {eng.supported_script_languages.join(", ")}
                    </div>
                  </div>
                </div>

                {isReady ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-[#4ADE80]/10 border border-[#4ADE80]/25 text-[#4ADE80] text-[12px] font-mono font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ready</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-[#F5A623]/10 border border-[#F5A623]/25 text-[#F5A623] text-[12px] font-mono font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Not Installed</span>
                  </div>
                )}
              </div>

              {/* Version or Installation Guidance */}
              {isReady && version && (
                <div className="bg-[#0A0A0B] p-3 rounded-[6px] border border-[#26282D] text-[12px] font-mono text-[#9CA0A8] flex items-center justify-between">
                  <span>Detected version: <b className="text-[#E8E9EB]">{version}</b></span>
                  <span className="text-[#4ADE80]">Ready for headless subprocess execution</span>
                </div>
              )}

              {!isReady && installHint && (
                <div className="bg-[#1C1E22] p-4 rounded-[6px] border border-[#F5A623]/30 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#F5A623] font-medium flex items-center gap-1.5">
                      <Terminal className="w-4 h-4" />
                      <span>Installation Required (BYO Binary)</span>
                    </span>
                    <button
                      onClick={() =>
                        copyCommand(eng.id, eng.id === "k6" ? "winget install k6.k6" : "cargo install goose")
                      }
                      className="btn-ghost text-[11px] gap-1.5 px-2.5 py-1 text-[#A3E635] hover:bg-[#A3E635]/10 font-mono font-semibold"
                    >
                      {copiedId === eng.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === eng.id ? "Copied" : "Copy command"}</span>
                    </button>
                  </div>
                  <pre className="text-[12px] font-mono text-[#E8E9EB] whitespace-pre-wrap select-all bg-[#0A0A0B] p-3 rounded border border-[#26282D]">
                    {installHint}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Architectural Guarantee Box */}
      <div className="max-w-4xl mx-auto w-full mt-6 p-5 rounded-[8px] bg-[#141518] border border-[#26282D] flex items-start gap-3.5 shadow-sm">
        <Shield className="w-5 h-5 text-[#A3E635] shrink-0 mt-0.5" />
        <div className="text-[13px] text-[#9CA0A8] leading-relaxed">
          <strong className="text-[#E8E9EB]">Subprocess-only Architecture Guarantee:</strong>{" "}
          Per Loom’s license compliance policy, even permissive engines (like Locust or Goose) are never
          compiled or linked into the Loom binary. Copyleft engines (like k6 under AGPL-3.0) run strictly
          as user-installed external binaries via standard process isolation and JSON/CSV streaming.
        </div>
      </div>
    </div>
  );
};
