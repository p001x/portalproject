import React from "react";

export function ExpertConsultationEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* ================= 1. CONSULTANT HEADSET HEADBAND ================= */}
      <path
        d="M 31 43 C 31 29 39 20 50 20 C 61 20 69 29 69 43"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        className="text-foreground"
      />

      {/* Left Ear Cushion */}
      <rect
        x="28"
        y="37"
        width="6.5"
        height="13"
        rx="3"
        fill="currentColor"
        className="text-foreground"
      />

      {/* Right Ear Cushion */}
      <rect
        x="65.5"
        y="37"
        width="6.5"
        height="13"
        rx="3"
        fill="currentColor"
        className="text-foreground"
      />

      {/* Microphone Boom Arm curving to mouth */}
      <path
        d="M 31 46 Q 34 58 45 58"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-foreground"
      />
      <circle cx="48" cy="58" r="3" fill="currentColor" className="text-foreground" />

      {/* ================= 2. CONSULTANT HEAD & BODY ================= */}
      {/* Head */}
      <circle
        cx="50"
        cy="42"
        r="14"
        stroke="currentColor"
        strokeWidth="3.4"
        fill="white"
        className="text-foreground fill-card"
      />

      {/* Friendly Tie / Collar V-neck detail */}
      <path
        d="M 45 68 L 50 75 L 55 68"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-foreground"
      />

      {/* Shoulders / Torso */}
      <path
        d="
          M 25 88
          C 25 74 36 67 50 67
          C 64 67 75 74 75 88
        "
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="text-foreground"
      />

      {/* ================= 3. 1-ON-1 CONVERSATION / BOOKING BUBBLE ================= */}
      {/* Floating Chat / Consultation speech bubble in top right */}
      <g className="text-purple-600 dark:text-purple-400">
        <path
          d="
            M 69 25
            C 69 18 75 13 83 13
            C 91 13 97 18 97 25
            C 97 32 91 37 83 37
            L 78 42
            L 79 36.5
            C 72.5 35.5 69 31 69 25
            Z
          "
          fill="currentColor"
          opacity="0.15"
        />
        <path
          d="
            M 69 25
            C 69 18 75 13 83 13
            C 91 13 97 18 97 25
            C 97 32 91 37 83 37
            L 78 42
            L 79 36.5
            C 72.5 35.5 69 31 69 25
            Z
          "
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 3 Activity Speech Dots */}
        <circle cx="77" cy="25" r="1.8" fill="currentColor" />
        <circle cx="83" cy="25" r="1.8" fill="currentColor" />
        <circle cx="89" cy="25" r="1.8" fill="currentColor" />
      </g>
    </svg>
  );
}
