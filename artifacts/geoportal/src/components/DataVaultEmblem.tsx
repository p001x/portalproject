import React from "react";

export function DataVaultEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Cylinder Top Cap Gradient */}
        <linearGradient id="dvCapGrad" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>

        {/* Cylinder Body Metallic Gradient */}
        <linearGradient id="dvBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="25%" stopColor="#e2e8f0" />
          <stop offset="65%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>

        {/* Dark Blue Recess Grooves */}
        <linearGradient id="dvGrooveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* 3D Orange Arrow Front Face */}
        <linearGradient id="dvArrowFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="40%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>

        {/* 3D Orange Arrow Top Bevel */}
        <linearGradient id="dvArrowTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>

        {/* 3D Orange Arrow Side Extrusion (Shadow side) */}
        <linearGradient id="dvArrowSide" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>

        {/* Arrow Drop Shadow Filter */}
        <filter id="dvArrowShadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* ================= 1. DATABASE CYLINDER (3 TIERS) ================= */}
      
      {/* --- TIER 3 (BOTTOM DISK) --- */}
      {/* Bottom Disk Body */}
      <path
        d="M 28 66 C 28 66 28 80 28 80 C 28 92 41 97 58 97 C 75 97 88 92 88 80 C 88 80 88 66 88 66 Z"
        fill="url(#dvBodyGrad)"
      />
      {/* Bottom Disk Lip Curve */}
      <ellipse cx="58" cy="80" rx="30" ry="11" fill="url(#dvBodyGrad)" />

      {/* --- GROOVE 2 (LOWER DARK RECESS) --- */}
      <ellipse cx="58" cy="67" rx="29" ry="10" fill="url(#dvGrooveGrad)" />

      {/* --- TIER 2 (MIDDLE DISK) --- */}
      {/* Middle Disk Body */}
      <path
        d="M 28 48 L 28 66 C 28 77 41 81 58 81 C 75 81 88 77 88 66 L 88 48 Z"
        fill="url(#dvBodyGrad)"
      />
      {/* Middle Disk Bottom Rim */}
      <ellipse cx="58" cy="65" rx="30" ry="10.5" fill="url(#dvBodyGrad)" />

      {/* LED Dot Tier 2 */}
      <circle cx="81" cy="57" r="2.2" fill="#1d4ed8" opacity="0.85" />
      <circle cx="81" cy="57" r="1.3" fill="#60a5fa" />

      {/* --- GROOVE 1 (UPPER DARK RECESS) --- */}
      <ellipse cx="58" cy="49" rx="29" ry="10" fill="url(#dvGrooveGrad)" />

      {/* --- TIER 1 (TOP DISK) --- */}
      {/* Top Disk Body */}
      <path
        d="M 28 30 L 28 48 C 28 59 41 63 58 63 C 75 63 88 59 88 48 L 88 30 Z"
        fill="url(#dvBodyGrad)"
      />
      {/* Top Disk Bottom Rim */}
      <ellipse cx="58" cy="47" rx="30" ry="10.5" fill="url(#dvBodyGrad)" />

      {/* LED Dot Tier 1 */}
      <circle cx="81" cy="39" r="2.2" fill="#1d4ed8" opacity="0.85" />
      <circle cx="81" cy="39" r="1.3" fill="#60a5fa" />

      {/* Top Cap Ellipse */}
      <ellipse cx="58" cy="30" rx="30" ry="11" fill="url(#dvCapGrad)" stroke="#f8fafc" strokeWidth="0.8" />
      <ellipse cx="57" cy="29" rx="27" ry="9.5" fill="#f1f5f9" opacity="0.45" />

      {/* ================= 2. 3D ORANGE ARROW (OVERLAPPING FRONT) ================= */}
      <g filter="url(#dvArrowShadow)">
        {/* 3D Arrow Left Side Extrusion (Perspective thickness) */}
        <polygon
          points="55,50 49,52 49,75 39,78 39,83 67,107 70,103 45,80 55,77"
          fill="url(#dvArrowSide)"
        />

        {/* 3D Arrow Top Rounded Bevel Cap */}
        <polygon
          points="55,50 71,50 75,54 59,54"
          fill="url(#dvArrowTop)"
        />

        {/* 3D Arrow Right Side Extrusion */}
        <polygon
          points="71,50 75,54 75,76 86,76 86,81 70,103 67,107 83,83 72,83 72,54"
          fill="url(#dvArrowSide)"
        />

        {/* 3D Arrow Main Front Face */}
        <path
          d="
            M 59 54
            L 73 54
            L 73 78
            L 83 78
            C 84 78 85 79 84.5 80
            L 70 102
            C 69.5 102.8 68.5 102.8 68 102
            L 47 80
            C 46.5 79 47.5 78 48.5 78
            L 59 78
            Z
          "
          fill="url(#dvArrowFront)"
        />

        {/* Top-Edge Highlight Rim on Arrow */}
        <path
          d="M 59 54 L 73 54"
          stroke="#fed7aa"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Arrow Center Ridge / Specular Reflection */}
        <path
          d="M 66 56 L 66 79 L 69 98"
          stroke="#fed7aa"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.45"
        />
      </g>
    </svg>
  );
}
