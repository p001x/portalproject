import React from "react";
import { DatasetHarvester } from "@/components/DatasetHarvester";
import { DataHarvesterEmblem } from "@/components/DataHarvesterEmblem";

export function DataHarvesterPage() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* ── Minimalist Commercial Header ────────────────────────────── */}
      <header className="shrink-0 border-b border-border/50 bg-card/40 backdrop-blur-md px-6 py-3.5">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <DataHarvesterEmblem className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-foreground">
                Spatial Data Harvester
              </h1>
              <p className="text-xs text-muted-foreground">
                Scan, inspect, and import geospatial assets from cloud storage, STAC catalogs, and web portals.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Workstation Content ─────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-6 py-5 relative z-10">
        <div className="max-w-[1500px] mx-auto">
          <DatasetHarvester />
        </div>
      </main>
    </div>
  );
}
