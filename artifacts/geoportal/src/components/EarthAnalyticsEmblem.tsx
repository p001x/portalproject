import React from "react";

export function EarthAnalyticsEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Modern Vibrant Gradient for Analytics Charts & Magnifier */}
        <linearGradient id="eaLensGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <linearGradient id="eaChartGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a5f3fc" />
        </linearGradient>

        <linearGradient id="eaTrendLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>

      {/* Outer Magnifying Glass Ring */}
      <circle
        cx="200"
        cy="200"
        r="165"
        stroke="currentColor"
        strokeWidth="26"
        className="text-foreground/90"
      />

      {/* Inner Lens Subtle Glass Tint */}
      <circle
        cx="200"
        cy="200"
        r="150"
        className="fill-sky-500/10 dark:fill-sky-400/10"
      />

      {/* Inner Lens Specular Top Rim */}
      <path
        d="M 105 130 A 130 130 0 0 1 295 130"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        className="text-foreground/40"
      />

      {/* Line Chart / Trend Line inside Lens */}
      <path
        d="M 95 190 L 145 155 L 180 195 L 230 160 L 275 115"
        stroke="url(#eaTrendLine)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bar 1 (Leftmost) */}
      <rect
        x="88"
        y="238"
        width="28"
        height="72"
        rx="14"
        fill="currentColor"
        className="text-foreground/80"
      />

      {/* Bar 2 (Mid-Left) */}
      <rect
        x="136"
        y="218"
        width="34"
        height="115"
        rx="17"
        fill="url(#eaChartGrad)"
      />

      {/* Bar 3 (Mid-Right) */}
      <rect
        x="196"
        y="235"
        width="34"
        height="98"
        rx="17"
        fill="url(#eaChartGrad)"
      />

      {/* Bar 4 (Rightmost Tall Bar) */}
      <rect
        x="256"
        y="175"
        width="38"
        height="158"
        rx="19"
        fill="currentColor"
        className="text-foreground/80"
      />

      {/* Magnifier Neck */}
      <path
        d="M 295 295 L 340 340"
        stroke="currentColor"
        strokeWidth="38"
        strokeLinecap="round"
        className="text-foreground/90"
      />

      {/* Magnifier Handle */}
      <path
        d="M 330 330 L 440 440"
        stroke="url(#eaLensGlow)"
        strokeWidth="48"
        strokeLinecap="round"
      />

      {/* Handle End Rounded Cap */}
      <circle
        cx="440"
        cy="440"
        r="24"
        fill="currentColor"
        className="text-foreground/90"
      />
    </svg>
  );
}
