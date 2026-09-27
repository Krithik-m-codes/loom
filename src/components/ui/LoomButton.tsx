import type { ButtonHTMLAttributes } from "react";

export type LoomButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface LoomButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LoomButtonVariant;
}

export function LoomButton({
  className,
  type = "button",
  variant = "primary",
  ...props
}: LoomButtonProps) {
  return <button {...props} type={type} className={["loom-button", "loom-button--" + variant, className].filter(Boolean).join(" ")} />;
}
