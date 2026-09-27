import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { RunLog } from "../../types";

interface LogDockProps {
  logs: RunLog[];
  isRunning: boolean;
  onClearLogs: () => void;
}

export const LogDock = ({ logs, isRunning, onClearLogs }: LogDockProps) => {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(220);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousLogCount = useRef(logs.length);

  useEffect(() => {
    if (isRunning && previousLogCount.current === 0 && logs.length > 0) setOpen(true);
    previousLogCount.current = logs.length;
  }, [logs.length, isRunning]);

  useEffect(() => {
    const body = bodyRef.current;
    if (open && body && typeof body.scrollTo === "function") body.scrollTo({ top: body.scrollHeight });
  }, [logs.length, open]);

  const startHeightDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const onMove = (moveEvent: MouseEvent) => {
      const maxHeight = window.innerHeight * 0.6;
      const next = Math.min(Math.max(startHeight + (startY - moveEvent.clientY), 120), maxHeight);
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <section className="loom-dock" aria-label="Run log dock" style={open ? { height } : undefined}>
      <div className="loom-dock__bar">
        <button
          type="button"
          className="loom-dock__toggle"
          aria-label={open ? "Collapse log dock" : "Expand log dock"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronUp aria-hidden="true" size={15} />}
          <span>Logs</span>
          <span className="loom-dock__count">{logs.length}</span>
          {isRunning && <span className="loom-dock__live">Running</span>}
        </button>
        {open && (
          <button type="button" className="loom-dock__clear" onClick={onClearLogs}>
            <Trash2 aria-hidden="true" size={14} />
            <span>Clear</span>
          </button>
        )}
      </div>
      {open && (
        <>
          <div
            className="loom-dock__grip"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize log dock"
            onMouseDown={startHeightDrag}
          />
          <div className="loom-dock__body" ref={bodyRef}>
            {logs.length === 0 ? (
              <p className="loom-dock__empty">No log output yet. Step 4: Run a test to stream engine output here.</p>
            ) : (
              logs.map((log, index) => (
                <p key={`${log.timestamp}-${index}`} data-stream={log.stream}>
                  <span>{log.stream}</span> {log.message}
                </p>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
};
