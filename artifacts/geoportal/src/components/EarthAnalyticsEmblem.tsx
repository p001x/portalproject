import React from "react";

export function EarthAnalyticsEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Globe Main Deep Blue Gradient */}
        <radialGradient id="eaGlobeGrad" cx="42%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="35%" stopColor="#1d4ed8" />
          <stop offset="75%" stopColor="#0f2b6b" />
          <stop offset="100%" stopColor="#06163a" />
        </radialGradient>

        {/* Globe Specular Top Crescent */}
        <linearGradient id="eaGlobeGloss" x1="30%" y1="0%" x2="60%" y2="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#0f2b6b" stopOpacity="0" />
        </linearGradient>

        {/* 3D Bars Gradients */}
        <linearGradient id="eaBar1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        <linearGradient id="eaBar2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="40%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        <linearGradient id="eaBar3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>

        {/* Metallic Orbit Swoosh Gradient */}
        <linearGradient id="eaSwooshGrad" x1="0%" y1="50%" x2="100%" y2="20%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="25%" stopColor="#94a3b8" />
          <stop offset="50%" stopColor="#e2e8f0" />
          <stop offset="75%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>

        {/* Swoosh Inner Shadow */}
        <linearGradient id="eaSwooshGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#64748b" stopOpacity="0.2" />
        </linearGradient>

        {/* Bar 3D Bevel Dark */}
        <linearGradient id="eaBarBevel" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      {/* 1. BACK OF SWOOSH / ORBITAL ARC (Passes behind bars) */}
      <path
        d="M 28 66 C 18 64 12 59 18 53 C 24 47 42 42 66 43 C 82 44 95 49 98 56 C 99 59 95 62 88 64"
        stroke="#94a3b8"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* 2. THE 3 VERTICAL ANALYTICAL BARS */}
      {/* Bar 1 (Short - Left) */}
      <g>
        <path d="M 38 72 L 38 52 L 46 48 L 46 70 Z" fill="url(#eaBar1)" />
        <polygon points="38,52 42,49 46,48 42,50" fill="#93c5fd" opacity="0.9" />
        <path d="M 44 49 L 46 48 L 46 70 L 44 71 Z" fill="url(#eaBarBevel)" opacity="0.4" />
      </g>

      {/* Bar 2 (Medium - Center Left) */}
      <g>
        <path d="M 50 70 L 50 26 L 58 22 L 58 68 Z" fill="url(#eaBar2)" />
        <polygon points="50,26 54,23 58,22 54,24" fill="#dbeafe" />
        <path d="M 56 23 L 58 22 L 58 68 L 56 69 Z" fill="url(#eaBarBevel)" opacity="0.5" />
      </g>

      {/* Bar 3 (Tallest - Center Right) */}
      <g>
        <path d="M 62 68 L 62 18 L 70 14 L 70 66 Z" fill="url(#eaBar3)" />
        <polygon points="62,18 66,15 70,14 66,16" fill="#eff6ff" />
        <path d="M 68 15 L 70 14 L 70 66 L 68 67 Z" fill="url(#eaBarBevel)" opacity="0.6" />
      </g>

      {/* 3. THE 3D EARTH GLOBE (Bottom Hemisphere / Sphere) */}
      <g>
        {/* Globe Base Sphere */}
        <circle cx="56" cy="74" r="24" fill="url(#eaGlobeGrad)" />

        {/* Latitude / Contour Arc 1 on Globe */}
        <path
          d="M 36 78 Q 54 86 76 74"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Latitude / Contour Arc 2 on Globe */}
        <path
          d="M 40 70 Q 56 78 78 66"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Specular Top-Edge Reflection on Globe */}
        <ellipse cx="52" cy="62" rx="16" ry="7" fill="url(#eaGlobeGloss)" />
      </g>

      {/* 4. FRONT DYNAMIC SILVER ORBIT SWOOSH (Wrapping around the Globe & Bars) */}
      {/* Outer Metallic Crescent */}
      <path
        d="M 18 64 C 15 62 20 54 36 49 C 54 44 76 43 92 48 C 100 51 106 58 98 67 C 90 76 74 85 52 87 C 32 89 20 83 20 77 C 20 73 26 71 35 70 C 52 68 70 64 78 58 C 84 53 82 48 70 48 C 54 48 38 52 26 58 C 20 61 17 64 18 64 Z"
        fill="url(#eaSwooshGrad)"
      />

      {/* Swoosh Specular Edge Light (Silver Chrome Rim) */}
      <path
        d="M 22 62 C 34 54 54 48 76 48 C 88 48 97 52 94 60 C 91 66 78 74 60 78 C 42 82 28 81 24 76"
        stroke="url(#eaSwooshGlow)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Top Dynamic Crescent Tail at Top Right */}
      <path
        d="M 88 38 C 96 46 102 56 94 66 C 98 56 94 44 88 38 Z"
        fill="#cbd5e1"
        opacity="0.8"
      />
    </svg>
  );
}
