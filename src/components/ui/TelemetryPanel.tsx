import type { HTMLAttributes, ReactNode } from "react";

export interface TelemetryPanelProps extends HTMLAttributes<HTMLElement> {
  title: string;
  action?: ReactNode;
}

export function TelemetryPanel({ title, action, children, className, ...props }: TelemetryPanelProps) {
  return (
    <section {...props} aria-label={title} className={["loom-telemetry-panel", className].filter(Boolean).join(" ")} role="region">
      <header className="loom-telemetry-panel__header">
        <h2 className="loom-telemetry-panel__title">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
