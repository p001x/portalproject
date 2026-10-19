import React from "react";

export function SampleDigitizerEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* ================= 1. CIRCUIT BRANCHES & NODES ================= */}
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
        
        {/* Top Center Branch */}
        <line x1="50" y1="22" x2="50" y2="10" />
        <circle cx="50" cy="7" r="3.2" />

        {/* Top Left Branch (Upper) */}
        <path d="M 40 24 L 40 10 L 23 10" />
        <circle cx="20" cy="10" r="3.2" />

        {/* Top Left Branch (Middle Sub-branch) */}
        <path d="M 34 30 L 25 30" />
        <circle cx="25" cy="22" r="3.2" />
        <line x1="25" y1="30" x2="25" y2="25" />

        {/* Far Left Branch */}
        <line x1="34" y1="38" x2="22" y2="38" />
        <circle cx="19" cy="38" r="3.2" />

        {/* Bottom Left Branch */}
        <path d="M 37 48 L 21 48 L 21 66" />
        <circle cx="21" cy="69" r="3.2" />

        {/* Top Right Branch (Upper Corner) */}
        <path d="M 58 24 L 58 13 L 66 13 L 66 9" />
        <circle cx="66" cy="6" r="3.2" />

        {/* Far Top Right Branch */}
        <path d="M 64 30 L 79 30 L 79 11" />
        <circle cx="79" cy="8" r="3.2" />

        {/* Far Right Branch */}
        <line x1="66" y1="38" x2="80" y2="38" />
        <circle cx="83" cy="38" r="3.2" />

        {/* Bottom Right Branch */}
        <path d="M 64 48 L 75 48 L 75 53" />
        <circle cx="75" cy="56" r="3.2" />

        {/* ================= 2. CONCENTRIC TARGET RINGS ================= */}
        {/* Outer Ring */}
        <circle cx="50" cy="38" r="16" />

        {/* Inner Ring */}
        <circle cx="50" cy="38" r="8.5" />
      </g>

      {/* ================= 3. THE TOUCH / POINTING HAND GESTURE ================= */}
      {/* Filled with background/card color to occlude lines behind the hand, with bold black outline */}
      <path
        d="
          M 46 64
          L 46 34
          A 4 4 0 0 1 54 34
          L 54 62
          C 54.5 61 56 60.5 57.5 61
          C 59 61.5 60.5 63 61 64.5
          C 62 63.5 63.5 63 65 63.5
          C 66.5 64 67.5 65.5 68 67
          C 69 66 71 65.5 73 66.5
          C 75.5 67.5 77 70.5 76.5 74
          C 76 79 72 87 66 92
          C 60 97 48 97 42 93
          C 36 89 31 82 31 75
          C 31 71.5 33 69 36 68.5
          C 39 68 43 71.5 44 73
          L 46 64
          Z
        "
        fill="white"
        className="fill-card"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
