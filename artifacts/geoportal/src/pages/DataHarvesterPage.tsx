import React from "react";
import { DatasetHarvester } from "@/components/DatasetHarvester";
import { Globe2 } from "lucide-react";

export function DataHarvesterPage() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      <div className="flex items-center gap-2 text-primary font-semibold text-xl p-6 pb-2 shrink-0">
        <Globe2 className="w-5 h-5" />
        Universal Spatial Data Harvester
      </div>
      <p className="text-sm text-muted-foreground px-6 mb-4 shrink-0">
        Deep scan any web page, STAC catalog, GitHub folder, or cloud link. Extract and acquire all spatial datasets with server-to-server speed.
      </p>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="max-w-7xl mx-auto">
          <DatasetHarvester />
        </div>
      </div>
    </div>
  );
}
