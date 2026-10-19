import React from "react";
import { Globe2, TrendingUp } from "lucide-react";

export function EarthAnalyticsIcon({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-12 h-12 shrink-0 select-none ${className}`}>
      {/* Background Tile: Soft emerald tile with Earth Globe */}
      <div className="absolute top-0 left-0 w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/90 border border-emerald-300/70 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-translate-x-0.5">
        <Globe2 className="w-4 h-4 stroke-[2.2]" />
      </div>

      {/* Foreground Tile: Solid vibrant emerald tile with White Analytics Trendline */}
      <div className="absolute bottom-0 right-0 w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md ring-2 ring-card transition-transform duration-300 group-hover:scale-110">
        <TrendingUp className="w-4 h-4 stroke-[2.8]" />
      </div>
    </div>
  );
}
