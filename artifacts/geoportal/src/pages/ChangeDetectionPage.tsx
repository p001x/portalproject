import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2, Play, Activity, FileText, Layers, Crosshair, MapPin, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { ChangeDetectionResult, ChangeDetectionPointResult, AOIConfig } from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const CLASS_COLORS = ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"];

export function ChangeDetectionPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  
  // Default values: 2023 vs 2024 (Jan to Jun)
  const [beforeStart, setBeforeStart] = useState("2023-01-01");
  const [beforeEnd, setBeforeEnd] = useState("2023-06-30");
  const [afterStart, setAfterStart] = useState("2024-01-01");
  const [afterEnd, setAfterEnd] = useState("2024-06-30");

  const [indexType, setIndexType] = useState("NDVI");
  const [maskWater, setMaskWater] = useState(true);
  const [method, setMethod] = useState("threshold");
  const [nClasses, setNClasses] = useState(5);
  
  const [inspectingPoint, setInspectingPoint] = useState<ChangeDetectionPointResult | null>(null);
  const [activeLayer, setActiveLayer] = useState<"change" | "before" | "after">("change");

  const { mutate, data, isPending, error } = useMutation<ChangeDetectionResult, Error>({
    mutationFn: () =>
      api.changeDetection({
        aoi,
        before_start: beforeStart,
        before_end: beforeEnd,
        after_start: afterStart,
        after_end: afterEnd,
        index_type: indexType,
        mask_water: maskWater,
        method: method,
        n_classes: nClasses,
      }),
  });

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Activity className="w-5 h-5" />
          Change Detection
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Compare vegetation health (NDVI) between two time periods to identify deforestation or regeneration.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-3 p-3 border rounded bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">Before Period</h3>
          <div className="space-y-1">
            <Label htmlFor="before-start" className="text-xs">Start Date</Label>
            <input
              id="before-start"
              type="date"
              value={beforeStart}
              onChange={(e) => setBeforeStart(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="before-end" className="text-xs">End Date</Label>
            <input
              id="before-end"
              type="date"
              value={beforeEnd}
              onChange={(e) => setBeforeEnd(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-3 p-3 border rounded bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">After Period</h3>
          <div className="space-y-1">
            <Label htmlFor="after-start" className="text-xs">Start Date</Label>
            <input
              id="after-start"
              type="date"
              value={afterStart}
              onChange={(e) => setAfterStart(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="after-end" className="text-xs">End Date</Label>
            <input
              id="after-end"
              type="date"
              value={afterEnd}
              onChange={(e) => setAfterEnd(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-3 p-3 border rounded bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">Analysis Type</h3>
          <div className="space-y-1">
            <Label className="text-xs">Change Index</Label>
            <Select value={indexType} onValueChange={setIndexType}>
              <SelectTrigger className="w-full text-xs h-8">
                <SelectValue placeholder="Select Index" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NDVI">NDVI (Vegetation/Forestry)</SelectItem>
                <SelectItem value="NDBI">NDBI (Urban/Built-up)</SelectItem>
                <SelectItem value="NDWI">NDWI (Water Bodies)</SelectItem>
                <SelectItem value="BSI">BSI (Bare Soil/Erosion)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 mt-2">
            <Label className="text-xs">Classification Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full text-xs h-8">
                <SelectValue placeholder="Select Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="threshold">Manual Thresholding (Standard)</SelectItem>
                <SelectItem value="equal_interval">Equal Interval</SelectItem>
                <SelectItem value="quantiles">Quantiles</SelectItem>
                <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method !== "threshold" && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Number of Classes</Label>
                <span className="text-xs font-mono bg-muted px-1.5 rounded">{nClasses}</span>
              </div>
              <Slider
                value={[nClasses]}
                onValueChange={([v]) => setNClasses(v)}
                min={2}
                max={9}
                step={1}
                className="py-1"
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <Label htmlFor="maskWater" className="text-xs cursor-pointer">Mask Water Bodies</Label>
            <Switch id="maskWater" checked={maskWater} onCheckedChange={setMaskWater} />
          </div>
        </div>

        <Button
          className="w-full gap-2 mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md transition-all"
          onClick={() => mutate()}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isPending ? "Computing Change…" : "Calculate Change"}
        </Button>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
            {error.message}
          </p>
        )}
      </aside>

      {/* ── Results ──────────────────────────────────────────────── */}
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={75}>
        <main id="report-container" className="h-full flex flex-col flex-1 overflow-y-auto p-6 bg-background">
        {!data && !isPending && (
          <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
            <DistrictMap aoi={aoi} customGeojson={aoi.type === "custom" && aoi.geojson ? JSON.parse(aoi.geojson) : undefined} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                <h3 className="text-xl font-bold mb-2 text-foreground">Analysis Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Select a study area and parameters from the sidebar, then click run to visualize the results here.
                </p>
              </div>
            </div>
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Computing {indexType} differences for {aoi.name || 'Custom'}…</p>
            <p className="text-xs text-center">This process computes two median composites across your time periods<br/>and subtracts them. It usually takes 30–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Change Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="static-map">Export Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px] flex flex-col">
              <div className="flex justify-center mb-4">
                <div className="inline-flex rounded-md shadow-sm" role="group">
                  <button type="button" onClick={() => setActiveLayer("before")} className={`px-4 py-2 text-sm font-medium border border-r-0 border-input rounded-l-lg ${activeLayer === 'before' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted text-foreground'}`}>Before Period</button>
                  <button type="button" onClick={() => setActiveLayer("change")} className={`px-4 py-2 text-sm font-medium border-t border-b border-input ${activeLayer === 'change' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted text-foreground'}`}>Classified Change</button>
                  <button type="button" onClick={() => setActiveLayer("after")} className={`px-4 py-2 text-sm font-medium border border-l-0 border-input rounded-r-lg ${activeLayer === 'after' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted text-foreground'}`}>After Period</button>
                </div>
              </div>
              <div className="h-[560px] rounded-lg overflow-hidden border shadow-sm">
                <DistrictMap 
                  center={data.center} 
                  bbox={data.bbox} 
                  customGeojson={aoi.type === "custom" && aoi.geojson ? JSON.parse(aoi.geojson) : undefined} 
                  tileUrl={activeLayer === "change" ? data.tile_url : activeLayer === "before" ? data.before_tile_url : data.after_tile_url} 
                />
              </div>
              {activeLayer === "change" && (
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium justify-center p-3 bg-muted/50 rounded-lg border">
                {Object.keys(data.class_areas_km2).map((label, index) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded shadow-sm border border-black/10 inline-block"
                      style={{ background: data.class_colors?.[index] || "#ccc" }}
                    />
                    {label}
                  </span>
                ))}
              </div>
              )}
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Change Statistics — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Comparing {data.before_start} to {data.before_end} <strong>vs</strong> {data.after_start} to {data.after_end}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(data.stats).map(([label, val]) => (
                  <div key={label} className="bg-card border rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">{label}</p>
                    <p className={`text-2xl font-bold ${typeof val === 'number' && val < 0 ? 'text-red-500' : typeof val === 'number' && val > 0 ? 'text-green-600' : 'text-primary'}`}>{val}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border rounded-lg p-6 shadow-sm">
                <h3 className="font-medium mb-4 text-center">Area Changed (km²)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: data.class_colors?.[i] || '#ccc',
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} interval={0} />
                    <YAxis unit=" km²" tick={{ fontSize: 11, fill: 'currentColor' }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} contentStyle={{ borderRadius: '8px' }} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={data.class_colors?.[i] || '#ccc'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <table className="w-full text-sm mt-6 border rounded-lg overflow-hidden">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Change Class</th>
                      <th className="text-right px-4 py-2 font-medium">Area (km²)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(data.class_areas_km2).map(([cls, km2], i) => (
                      <tr key={cls} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 flex items-center gap-2 font-medium">
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 inline-block shrink-0 shadow-sm"
                            style={{ background: data.class_colors?.[i] || '#ccc' }}
                          />
                          {cls}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{km2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps and raw data downloads.</p>
              </div>
              {data.download_url && (
                <div className="bg-card border rounded-lg p-5 shadow-sm space-y-3">
                  <h3 className="font-medium">Raw Data Download</h3>
                  <p className="text-sm text-muted-foreground">Download the exact Change Detection difference map as a Georeferenced TIF file for use in desktop GIS software like QGIS or ArcGIS.</p>
                  <a href={data.download_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="default" className="w-full sm:w-auto mt-2 gap-2">
                      <Download className="w-4 h-4" /> Download GeoTIFF
                    </Button>
                  </a>
                </div>
              )}

              <div className="bg-card border rounded-lg p-4 shadow-sm mt-4">
                <MapExportControls
                  tileUrl={data.tile_url}
                  thumbUrl={data.thumb_url}
                  downloadUrl={data.download_url}
                  district={aoi.name || "Custom"}
                  title={`${indexType} Change Detection`}
                  classAreas={data.class_areas_km2}
                  overridePalette={data.class_colors}
                />
              </div>
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report analyzing the changes.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4 shadow-sm">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · Change statistics (Mean, Max Gain/Loss) ·
                  Change area table · Visual difference map · Interpretation notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName={`Change Detection (${indexType})`}
                  district={aoi.name || "Custom"}
                  dateRange={`Comparison: ${data.before_start} - ${data.before_end} vs ${data.after_start} - ${data.after_end}`}
                  stats={data.stats as Record<string, number>}
                  classAreas={data.class_areas_km2}
                  extraNotes={`This report highlights ${indexType} changes between the 'before' period (${data.before_start} to ${data.before_end}) and the 'after' period (${data.after_start} to ${data.after_end}).`}
                  maps={[["Change Map", data.thumb_url]]}
                  filename={`ChangeDetection_${data.district}_${data.before_start}_vs_${data.after_start}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}


