import type { CSSProperties } from "react";

interface LoomLogoProps {
  size?: number;
  className?: string;
  variant?: "icon" | "horizontal" | "stacked";
}

export function LoomLogo({ size = 28, className = "", variant = "icon" }: LoomLogoProps) {
  const markStyle = { width: size, height: size } satisfies CSSProperties;
  const hasWordmark = variant !== "icon";

  return (
    <div className={["loom-logo", `loom-logo--${variant}`, className].filter(Boolean).join(" ")}>
      <img
        src="/loom-logo-mark.png"
        alt={hasWordmark ? "" : "Loom"}
        width={size}
        height={size}
        className="loom-logo__mark shrink-0"
        style={markStyle}
      />
      {hasWordmark ? (
        <span className="loom-logo__lockup">
          <span className="loom-logo__wordmark">Loom</span>
        </span>
      ) : null}
    </div>
  );
}
