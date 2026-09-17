import React from "react";

interface LoomLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const LoomLogo: React.FC<LoomLogoProps> = ({
  size = 28,
  className = "",
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:scale-105"
      >
        <defs>
          <linearGradient
            id="loom-logo-grad1"
            x1="8"
            y1="8"
            x2="40"
            y2="40"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#B4F04A" />
            <stop offset="100%" stopColor="#84CC16" />
          </linearGradient>
          <linearGradient
            id="loom-logo-grad2"
            x1="40"
            y1="8"
            x2="8"
            y2="40"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#A3E635" />
            <stop offset="100%" stopColor="#4D7C0F" />
          </linearGradient>
          <filter id="loom-logo-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Container */}
        <rect
          width="48"
          height="48"
          rx="10"
          fill="#141518"
          stroke="#26282D"
          strokeWidth="1.5"
        />

        {/* Loom Warp Threads */}
        <line x1="16" y1="12" x2="16" y2="36" stroke="#26282D" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="11" x2="24" y2="37" stroke="#3A3D44" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="12" x2="32" y2="36" stroke="#26282D" strokeWidth="2" strokeLinecap="round" />

        {/* Primary Warp Wave */}
        <path
          d="M12 28 C16 28, 17 18, 24 18 C31 18, 32 28, 36 28"
          stroke="url(#loom-logo-grad1)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#loom-logo-glow)"
        />

        {/* Counter Weft Wave */}
        <path
          d="M12 20 C16 20, 17 30, 24 30 C31 30, 32 20, 36 20"
          stroke="url(#loom-logo-grad2)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dynamic Nodes */}
        <circle cx="24" cy="18" r="2.5" fill="#B4F04A" />
        <circle cx="24" cy="30" r="2.5" fill="#A3E635" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-sans font-bold text-base tracking-tight text-[#E8E9EB]">
              LOOM
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-[#1C1E22] text-[#A3E635] border border-[#26282D]">
              v0.1.0
            </span>
          </div>
          <span className="text-[11px] font-medium text-[#9CA0A8] tracking-tight mt-0.5">
            Multi-Engine Load Tester
          </span>
        </div>
      )}
    </div>
  );
};
