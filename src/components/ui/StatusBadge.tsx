import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleAlert, CircleStop, LoaderCircle, Radio } from "lucide-react";

export type LoomStatus = "ready" | "starting" | "running" | "finished" | "stopped" | "failed";

export interface StatusBadgeProps {
  status: LoomStatus;
  label?: string;
  className?: string;
}

const statusMeta = {
  ready: { label: "Ready", Icon: CheckCircle2 },
  starting: { label: "Starting", Icon: LoaderCircle },
  running: { label: "Running", Icon: Radio },
  finished: { label: "Completed", Icon: CheckCircle2 },
  stopped: { label: "Stopped", Icon: CircleStop },
  failed: { label: "Failed", Icon: CircleAlert },
} satisfies Record<LoomStatus, { label: string; Icon: LucideIcon }>;

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { Icon, label: defaultLabel } = statusMeta[status];
  const resolvedLabel = label ?? defaultLabel;

  return (
    <span
      aria-label={"Run status: " + resolvedLabel}
      className={["loom-status-badge", className].filter(Boolean).join(" ")}
      data-status={status}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.25} />
      <span>{resolvedLabel}</span>
    </span>
  );
}
