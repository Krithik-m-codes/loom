import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import type { RunRecord } from "../types";

interface RunDetailsDrawerProps {
  run: RunRecord | null;
  onClose: () => void;
  onRerun: (engine: string, config: string) => void;
}

type DrawerTab = "summary" | "config";

const formatConfig = (config: string): string => {
  if (!config.trim()) return "No config recorded";
  try {
    return JSON.stringify(JSON.parse(config), null, 2);
  } catch {
    return config;
  }
};

export const RunDetailsDrawer = ({ run, onClose, onRerun }: RunDetailsDrawerProps) => {
  const [tab, setTab] = useState<DrawerTab>("summary");

  useEffect(() => {
    setTab("summary");
  }, [run?.id]);

  useEffect(() => {
    if (!run) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [run, onClose]);

  if (!run) return null;

  return (
    <div className="loom-drawer-backdrop" onClick={onClose}>
      <aside
        className="loom-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Run details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="loom-drawer__header">
          <h2 className="loom-heading loom-heading--section">Run {run.id.substring(0, 8)}</h2>
          <button type="button" className="loom-drawer__close" onClick={onClose}>
            <X aria-hidden="true" size={15} />
            <span>Close</span>
          </button>
        </header>

        <div className="loom-drawer__tabs" role="tablist" aria-label="Run detail views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "summary"}
            className={tab === "summary" ? "loom-drawer__tab loom-drawer__tab--active" : "loom-drawer__tab"}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "config"}
            className={tab === "config" ? "loom-drawer__tab loom-drawer__tab--active" : "loom-drawer__tab"}
            onClick={() => setTab("config")}
          >
            Config
          </button>
        </div>

        {tab === "summary" ? (
          <dl className="loom-drawer__summary">
            <div><dt>Status</dt><dd>{run.status}</dd></div>
            <div><dt>Engine</dt><dd>{run.engine}</dd></div>
            <div><dt>Project</dt><dd>{run.project}</dd></div>
            <div><dt>Started</dt><dd>{new Date(run.started_at).toLocaleString()}</dd></div>
            <div><dt>Finished</dt><dd>{run.finished_at ? new Date(run.finished_at).toLocaleString() : "-"}</dd></div>
          </dl>
        ) : (
          <pre className="loom-drawer__config">{formatConfig(run.config)}</pre>
        )}

        <footer className="loom-drawer__footer">
          <button type="button" className="loom-button loom-button--primary" onClick={() => onRerun(run.engine, run.config)}>
            <Play aria-hidden="true" size={14} />
            <span>Re-run</span>
          </button>
        </footer>
      </aside>
    </div>
  );
};
