import React from "react";

export function DataVaultEmblem({ className = "w-16 h-16", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 225 225"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Modern Vibrant Gradient for Vault Dial */}
        <linearGradient id="dvDialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <linearGradient id="dvInnerDial" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      {/* Main Safe Outer Shell with Feet */}
      <rect
        x="12"
        y="25"
        width="201"
        height="165"
        rx="22"
        className="fill-foreground"
      />

      {/* Left Foot */}
      <rect
        x="32"
        y="190"
        width="22"
        height="7"
        rx="2"
        className="fill-foreground"
      />

      {/* Right Foot */}
      <rect
        x="171"
        y="190"
        width="22"
        height="7"
        rx="2"
        className="fill-foreground"
      />

      {/* Inner Recessed Door Border */}
      <rect
        x="32"
        y="46"
        width="161"
        height="123"
        rx="10"
        strokeWidth="8"
        className="stroke-background fill-foreground"
      />

      {/* Left Door Hinge Notch */}
      <polygon
        points="38,107 48,99 48,115"
        className="fill-background"
      />

      {/* Rotational Safe Dial (Gear) */}
      <g transform="translate(112.5, 107.5)">
        {/* Main Dial Outer Cog Body */}
        <circle r="42" fill="url(#dvDialGrad)" />

        {/* 8 Gear Teeth Notches Cut Into the Perimeter */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <circle
            key={i}
            cx={Math.cos((angle * Math.PI) / 180) * 42}
            cy={Math.sin((angle * Math.PI) / 180) * 42}
            r="5.5"
            className="fill-foreground"
          />
        ))}

        {/* Inner Dial Recess (Dark Ring) */}
        <circle r="22" className="fill-foreground" />

        {/* Center Combination Knob */}
        <circle r="13" fill="url(#dvInnerDial)" />
      </g>
    </svg>
  );
}
