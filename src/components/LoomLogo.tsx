import type { CSSProperties } from "react";

interface LoomLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export function LoomLogo({ size = 28, className = "", showText = false }: LoomLogoProps) {
  const markStyle = { width: size, height: size } satisfies CSSProperties;

  return (
    <div className={["loom-logo", className].filter(Boolean).join(" ")}>
      <img
        src="/logo-icon.png"
        alt="Loom"
        width={size}
        height={size}
        className="loom-logo__mark shrink-0"
        style={markStyle}
      />
      {showText ? (
        <span className="loom-logo__lockup">
          <span className="loom-logo__wordmark">Loom</span>
          <span className="loom-logo__descriptor">Load testing</span>
        </span>
      ) : null}
    </div>
  );
}
