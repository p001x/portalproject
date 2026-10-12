import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Rectangle, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { DatasetRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Maximize2, Layers } from "lucide-react";

const FILE_TYPE_COLORS: Record<string, { stroke: string; fill: string }> = {
  tiff: { stroke: "#ef4444", fill: "#ef4444" },
  shapefile: { stroke: "#3b82f6", fill: "#3b82f6" },
  csv: { stroke: "#10b981", fill: "#10b981" },
  geojson: { stroke: "#06b6d4", fill: "#06b6d4" },
  other: { stroke: "#a855f7", fill: "#a855f7" },
};

function MapBoundsController({
  records,
  selectedId,
}: {
  records: DatasetRecord[];
  selectedId?: string | null;
}) {
  const map = useMap();
  const prevSelectedId = useRef<string | null | undefined>(undefined);
  const initialFitDone = useRef(false);

  useEffect(() => {
    // If a specific dataset is selected and changed, zoom directly to it
    if (selectedId && selectedId !== prevSelectedId.current) {
      prevSelectedId.current = selectedId;
      const selected = records.find((r) => r.id === selectedId);
      if (selected?.bbox && selected.bbox.length === 4) {
        const [minx, miny, maxx, maxy] = selected.bbox;
        map.fitBounds(
          [
            [miny, minx],
            [maxy, maxx],
          ],
          { padding: [30, 30], maxZoom: 14, animate: true }
        );
        return;
      }
    }
    prevSelectedId.current = selectedId;

    // Only auto-fit all spatial records on the initial mount or when first populated
    if (!initialFitDone.current && records.length > 0) {
      initialFitDone.current = true;
      const spatial = records.filter((r) => r.bbox && r.bbox.length === 4);
      if (spatial.length > 0) {
        let minLat = 90,
          maxLat = -90,
          minLng = 180,
          maxLng = -180;
        spatial.forEach((r) => {
          const [minx, miny, maxx, maxy] = r.bbox!;
          if (miny < minLat) minLat = miny;
          if (maxy > maxLat) maxLat = maxy;
          if (minx < minLng) minLng = minx;
          if (maxx > maxLng) maxLng = maxx;
        });

        if (minLat < maxLat && minLng < maxLng) {
          map.fitBounds(
            [
              [minLat, minLng],
              [maxLat, maxLng],
            ],
            { padding: [25, 25], maxZoom: 12, animate: true }
          );
          return;
        }
      }

      // Default to Rwanda extent
      map.setView([-1.94, 29.87], 9);
    }
  }, [records, selectedId, map]);

  return null;
}

export interface DatasetSpatialMapProps {
  records: DatasetRecord[];
  selectedId?: string | null;
  onSelect?: (record: DatasetRecord) => void;
  height?: string;
}

export function DatasetSpatialMap({
  records,
  selectedId,
  onSelect,
  height = "320px",
}: DatasetSpatialMapProps) {
  const spatialRecords = useMemo(
    () => records.filter((r) => r.bbox && r.bbox.length === 4),
    [records]
  );

  return (
    <div
      className="relative rounded-xl border border-border/80 overflow-hidden shadow-xs bg-muted/20"
      style={{ height }}
    >
      <MapContainer
        center={[-1.94, 29.87]}
        zoom={9}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        <MapBoundsController records={records} selectedId={selectedId} />

        {spatialRecords.map((r) => {
          const [minx, miny, maxx, maxy] = r.bbox!;
          const bounds: [[number, number], [number, number]] = [
            [miny, minx],
            [maxy, maxx],
          ];
          const colors = FILE_TYPE_COLORS[r.file_type] ?? FILE_TYPE_COLORS.other;
          const isSelected = r.id === selectedId;

          return (
            <Rectangle
              key={r.id}
              bounds={bounds}
              pathOptions={{
                color: isSelected ? "#f59e0b" : colors.stroke,
                weight: isSelected ? 3 : 2,
                fillColor: colors.fill,
                fillOpacity: isSelected ? 0.35 : 0.15,
                dashArray: isSelected ? "4 4" : undefined,
              }}
              eventHandlers={{
                click: () => {
                  if (onSelect) onSelect(r);
                },
              }}
            >
              <Tooltip direction="top" opacity={0.95} sticky>
                <div className="text-xs p-1">
                  <div className="font-semibold text-foreground">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="uppercase font-medium">{r.file_type}</span>
                    <span>•</span>
                    <span>{r.file_size_mb ? `${r.file_size_mb.toFixed(1)} MB` : "—"}</span>
                  </div>
                  {r.contributor && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      By: {r.contributor}
                    </div>
                  )}
                </div>
              </Tooltip>
            </Rectangle>
          );
        })}
      </MapContainer>

      {/* Floating Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border/80 shadow-md flex items-center gap-3 text-xs">
        <span className="text-[11px] font-semibold text-muted-foreground">Extents:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#ef4444]" />
          <span className="text-[11px] text-muted-foreground">TIFF</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#3b82f6]" />
          <span className="text-[11px] text-muted-foreground">Shapefile</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981]" />
          <span className="text-[11px] text-muted-foreground">CSV</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#06b6d4]" />
          <span className="text-[11px] text-muted-foreground">GeoJSON</span>
        </div>
      </div>

      {/* Extent Counter Badge */}
      <div className="absolute top-3 right-3 z-[1000] bg-background/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-border/80 shadow-xs text-xs font-medium text-foreground">
        {spatialRecords.length} spatial extents shown
      </div>
    </div>
  );
}
