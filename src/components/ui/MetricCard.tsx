import type { ReactNode } from "react";

export interface MetricDelta {
  label: string;
  tone: "positive" | "negative" | "neutral";
}

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  delta?: MetricDelta;
  footer?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function MetricCard({ label, value, delta, footer, icon, className }: MetricCardProps) {
  return (
    <article className={["loom-metric-card", className].filter(Boolean).join(" ")}>
      <div className="loom-metric-card__label">
        {icon}
        <span className="loom-truncate">{label}</span>
      </div>
      <strong className="loom-metric-card__value">{value}</strong>
      {(delta || footer) && (
        <footer className="loom-metric-card__footer">
          {delta ? <span className={"loom-delta loom-delta--" + delta.tone}>{delta.label}</span> : <span />}
          {footer}
        </footer>
      )}
    </article>
  );
}
