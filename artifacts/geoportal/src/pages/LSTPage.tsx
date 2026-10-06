import { useState, useEffect, useMemo } from "react";
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
import { Loader2, Play, Thermometer, FileText, Tag, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { LSTResult, AOIConfig } from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const DISTRICTS = [
  "Bugesera","Burera","Gakenke","Gasabo","Gatsibo","Gicumbi","Gisagara",
  "Huye","Kamonyi","Karongi","Kayonza","Kicukiro","Kirehe","Muhanga",
  "Musanze","Ngoma","Ngororero","Nyabihu","Nyagatare","Nyamagabe",
  "Nyamasheke","Nyanza","Nyarugenge","Nyaruguru","Rubavu","Ruhango",
  "Rulindo","Rusizi","Rutsiro","Rwamagana",
  "Custom Study Area",
];

const TEMP_COLORS = ["#4575b4", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"];

const DEFAULT_PRESETS: Record<number, string[]> = {
  1: ["Uniform / Full Area"],
  2: ["Low", "High"],
  3: ["Low", "Moderate", "High"],
  4: ["Low", "Moderate", "High", "Very High"],
  5: ["Very Low", "Low", "Moderate", "High", "Very High"],
  6: ["Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  7: ["Extremely Low", "Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  8: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderately High", "High", "Very High", "Extreme"],
  9: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extreme"],
  10: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extremely High", "Extreme"],
};

function getDefaultLabels(n: number): string[] {
  if (DEFAULT_PRESETS[n]) return [...DEFAULT_PRESETS[n]];
  return Array.from({ length: n }, (_, i) => `Class ${i + 1}`);
}

const VEG_HEALTH_PRESETS: Record<number, string[]> = {
  3: ["Sparse / Stressed", "Moderate Canopy", "Dense Healthy"],
  4: ["Water / Bare", "Sparse Veg", "Moderate Canopy", "Dense Forest"],
  5: ["Water / Bare Soil", "Sparse / Stressed", "Moderate Vegetation", "Dense Canopy", "Lush Forest"],
  6: ["Water / Non-Veg", "Bare / Soil", "Sparse Grassland", "Open Canopy", "Dense Canopy", "Lush Forest"],
  10: ["Water / Shadow", "Barren Land", "Urban / Built-up", "Degraded / Stressed", "Sparse Grassland", "Moderate Shrubland", "Open Canopy / Crops", "Dense Canopy", "Vigorous Veg", "Dense Healthy Forest"],
};

const LAND_COVER_PRESETS: Record<number, string[]> = {
  3: ["Water / Bare", "Agriculture", "Forest"],
  4: ["Water", "Bare / Built", "Agriculture", "Forest"],
  5: ["Water", "Built-up", "Grassland", "Cropland", "Forest"],
  6: ["Water", "Bare Soil", "Built-up", "Grassland", "Cropland", "Dense Forest"],
  10: ["Deep Water", "Shallow Water", "Bare Soil", "Urban / Built-up", "Sparse Grassland", "Pasture", "Rainfed Cropland", "Irrigated Crops", "Secondary Forest", "Primary Dense Forest"],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function sixMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function LSTPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  const [startDate, setStartDate] = useState(sixMonthsAgo());
  const [endDate, setEndDate] = useState(today());
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [layerMode, setLayerMode] = useState<"classified" | "continuous">("classified");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));

  // Sync custom labels length when nClasses changes
  useEffect(() => {
    setCustomClassNames(prev => {
      const def = getDefaultLabels(nClasses);
      return Array.from({ length: nClasses }, (_, i) => prev[i] || def[i]);
    });
  }, [nClasses]);

  const { mutate, data, isPending, error } = useMutation<LSTResult, Error>({
    mutationFn: () =>
      api.lst.analyze({ 
        aoi,
        start_date: startDate, 
        end_date: endDate, 
        n_classes: nClasses, 
        method,
        custom_labels: customClassNames,
      }),
    onSuccess: (res) => {
      if (method === "continuous") {
        setLayerMode("continuous");
      } else {
        setLayerMode("classified");
      }
    }
  });

  const palette = (n: number) => {
    const full = ["#313695","#4575b4","#74add1","#abd9e9","#e0f3f8",
                  "#fee090","#fdae61","#f46d43","#d73027","#a50026"];
    if (n === 1) return [full[4]];
    const step = (full.length - 1) / (n - 1);
    return Array.from({ length: n }, (_, i) => full[Math.round(i * step)]);
  };
    

    const [clickedPoint, setClickedPoint] = useState<{lat: number, lng: number, lst: number | null, isLoading: boolean} | null>(null);
  const handleMapClick = async (lat: number, lng: number) => {
    setClickedPoint({ lat, lng, lst: null, isLoading: true });
    try {
      const res = await api.lst.point({ aoi, start_date: startDate, end_date: endDate, lat, lng });
      setClickedPoint({ lat, lng, lst: res.lst, isLoading: false });
    } catch (e) {
      setClickedPoint({ lat, lng, lst: null, isLoading: false });
    }
  };
  const isContinuous = method === "continuous";
  const rawAreas = (!isContinuous && data?.classify?.panels?.[0]?.areas)
    ? data.classify.panels[0].areas
    : (data?.class_areas_km2 || {});

  const activeAreas = useMemo(() => {
    const entries = Object.entries(rawAreas);
    if (entries.length === 0 || isContinuous) return rawAreas;
    
    const mapped: Record<string, number> = {};
    entries.forEach(([origKey, val], idx) => {
      const match = origKey.match(/(\s*[\(\[].*?[\)\]])/);
      const suffix = match ? match[1] : "";
      const customName = customClassNames[idx] || origKey.replace(/ *\([^)]*\)/, '');
      mapped[`${customName}${suffix}`] = val;
    });
    return mapped;
  }, [rawAreas, customClassNames, isContinuous]);
    
  const activeNClasses = data?.classify?.n_classes || nClasses;
  const activeColors = !isContinuous
    ? palette(activeNClasses)
    : TEMP_COLORS;

  const classifiedTileUrl = data?.classify?.panels?.[0]?.tile_url || data?.tile_url;
  const continuousTileUrl = data?.tile_url;
  const activeTileUrl = (layerMode === "classified" && !isContinuous) ? classifiedTileUrl : continuousTileUrl;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full w-full md:border-b md:border-b-0 md:border-r bg-card flex flex-col gap-5 p-5 md:overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Thermometer className="w-5 h-5" />
          LST Analysis
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Land Surface Temperature derived from Landsat 8/9 thermal infrared imagery.
          Cloud-masked median composite over the selected period.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label htmlFor="start-date">Start date</Label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="end-date">End date</Label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <Label>Classification Method</Label>
          <Select 
            value={method} 
            onValueChange={(val) => {
              setMethod(val);
              if (val === "continuous") {
                setLayerMode("continuous");
              } else {
                setLayerMode("classified");
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
              <SelectItem value="equal_interval">Discrete (Equal Interval)</SelectItem>
              <SelectItem value="quantiles">Discrete (Quantiles / Equal Area)</SelectItem>
              <SelectItem value="continuous">Continuous (Smooth Gradient)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!isContinuous && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
              <Label>Classes: {nClasses}</Label>
              <span className="text-[11px] text-muted-foreground">{nClasses} intervals</span>
            </div>
            <Slider
              min={1}
              max={15}
              step={1}
              value={[nClasses]}
              onValueChange={([v]) => setNClasses(v)}
            />
          </div>

          <div className="space-y-3 bg-muted/40 border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Tag className="w-3.5 h-3.5 text-primary" />
                Rename Classes ({nClasses})
              </Label>
              <button
                type="button"
                onClick={() => setCustomClassNames(getDefaultLabels(nClasses))}
                className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                title="Reset to default names"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCustomClassNames(getDefaultLabels(nClasses))}
                className="text-[10px] px-2 py-0.5 rounded border bg-card hover:bg-muted transition-colors font-medium"
              >
                Descriptive
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = VEG_HEALTH_PRESETS[nClasses] || Array.from({ length: nClasses }, (_, i) => `Vegetation ${i+1}`);
                  setCustomClassNames(Array.from({ length: nClasses }, (_, i) => preset[i] || `Level ${i+1}`));
                }}
                className="text-[10px] px-2 py-0.5 rounded border bg-card hover:bg-muted transition-colors font-medium"
              >
                Veg Health
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = LAND_COVER_PRESETS[nClasses] || Array.from({ length: nClasses }, (_, i) => `Land Cover ${i+1}`);
                  setCustomClassNames(Array.from({ length: nClasses }, (_, i) => preset[i] || `Zone ${i+1}`));
                }}
                className="text-[10px] px-2 py-0.5 rounded border bg-card hover:bg-muted transition-colors font-medium"
              >
                Land Cover
              </button>
              <button
                type="button"
                onClick={() => setCustomClassNames(Array.from({ length: nClasses }, (_, i) => `Class ${i + 1}`))}
                className="text-[10px] px-2 py-0.5 rounded border bg-card hover:bg-muted transition-colors font-medium"
              >
                Numeric
              </button>
            </div>

            {/* Editable Class Names List */}
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {Array.from({ length: nClasses }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-xs shrink-0 border border-black/15 shadow-2xs"
                    style={{ background: activeColors[i % activeColors.length] }}
                  />
                  <input
                    type="text"
                    value={customClassNames[i] || ""}
                    placeholder={`Class ${i + 1}`}
                    onChange={(e) => {
                      const next = [...customClassNames];
                      next[i] = e.target.value;
                      setCustomClassNames(next);
                    }}
                    className="flex-1 h-7 text-xs rounded border border-input bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
          </>
        )}

        <Button
          className="w-full gap-2"
          onClick={() => mutate()}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Calculate LST"}
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
        <main id="report-container" className="h-full flex flex-col flex-1 md:overflow-y-auto p-4 md:p-6 bg-background">
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
            <p>Computing LST for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="classify">Classification</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px] flex flex-col">
              {/* Map Layer Switcher Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Map Symbology:</span>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setLayerMode("classified")}
                      disabled={isContinuous}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        layerMode === "classified" && !isContinuous
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                      }`}
                    >
                      Classified ({activeNClasses} Classes)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayerMode("continuous")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        layerMode === "continuous" || isContinuous
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Continuous Gradient
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Method:</span>
                  <span className="font-semibold text-foreground bg-background px-2 py-0.5 rounded border capitalize">
                    {method.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              <div className="h-[520px] rounded-lg overflow-hidden border relative">
                <DistrictMap center={data.center} tileUrl={activeTileUrl} />
              </div>

              {/* Dynamic Legend */}
              {layerMode === "classified" && !isContinuous ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {Object.entries(activeAreas).map(([label, km2], i) => (
                    <span 
                      key={label} 
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-card/80 shadow-2xs hover:bg-card transition-colors"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-xs inline-block shrink-0 border border-black/15 shadow-2xs"
                        style={{ background: activeColors[i % activeColors.length] }}
                      />
                      <span className="font-medium text-foreground">{label}</span>
                      <span className="text-muted-foreground font-mono text-[11px]">({km2} km²)</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 p-3.5 rounded-lg border bg-card/70 space-y-2 max-w-lg">
                  <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                    <span>Cool</span>
                    <span>Moderate</span>
                    <span>Hot</span>
                  </div>
                  <div 
                    className="w-full h-3.5 rounded border shadow-inner"
                    style={{
                      background: "linear-gradient(to right, #313695, #4575b4, #74add1, #abd9e9, #e0f3f8, #fee090, #fdae61, #f46d43, #d73027, #a50026)"
                    }}
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                    <span>Min: {data.stats["Min LST (°C)"]}</span>
                    <span>Mean: {data.stats["Mean LST (°C)"]}</span>
                    <span>Max: {data.stats["Max LST (°C)"]}</span>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Statistics — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Period: {data.start_date} → {data.end_date}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(data.stats).map(([label, val]) => (
                  <div key={label} className="bg-card border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-2xl font-bold text-primary">{val}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Temperature Class Areas</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded border capitalize">
                    {isContinuous ? "Standard Reference (Continuous)" : `${method.replace(/_/g, " ")} (${activeNClasses} Classes)`}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(activeAreas).map(([k, v], i) => ({
                      name: k.split(" (")[0],
                      fullName: k,
                      area: v,
                      fill: activeColors[i % activeColors.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, _, item: any) => [`${v} km²`, item.payload.fullName]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(activeAreas).map((_, i) => (
                        <Cell key={i} fill={activeColors[i % activeColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <table className="w-full text-sm mt-4 border rounded-lg overflow-hidden">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Class / Range</th>
                      <th className="text-right px-3 py-2 font-medium">Area (km²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(activeAreas).map(([cls, km2], i) => (
                      <tr key={cls} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-1.5 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                            style={{ background: activeColors[i % activeColors.length] }}
                          />
                          <span className="font-medium">{cls}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{km2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Classification */}
            <TabsContent value="classify" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Quantile Classification — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Breakpoints computed from the actual pixel distribution within the district.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                {palette(activeNClasses).map((color, i) => {
                  const lbl = customClassNames[i] || getDefaultLabels(activeNClasses)[i] || `Class ${i + 1}`;
                  return (
                    <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-card shadow-2xs">
                      <span className="w-3 h-3 rounded-xs border border-black/15 shadow-2xs" style={{ background: color }} />
                      <span className="font-medium">{lbl}</span>
                    </span>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {data.classify?.panels?.map((panel) => (
                  <div key={panel.letter} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground font-bold px-2 py-0.5 rounded text-sm">
                        {panel.letter}
                      </span>
                      <span className="font-medium">{panel.title}</span>
                    </div>
                    {panel.breakpoints.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Breakpoints: {panel.breakpoints.map((b) => b.toFixed(4)).join(" | ")}
                      </p>
                    )}
                    <img
                      src={panel.thumb_url}
                      alt={`${panel.title} classified thumbnail`}
                      className="w-full rounded object-cover border"
                    />
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={Object.entries(activeAreas).map(([k, v], i) => ({
                          name: k.split(" (")[0],
                          area: v,
                          fill: palette(activeNClasses)[i],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis unit=" km²" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[3, 3, 0, 0]}>
                          {Object.keys(panel.areas).map((_, i) => (
                            <Cell key={i} fill={palette(activeNClasses)[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Report ── */}
            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              {/* Map Layer Switcher Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Map Symbology:</span>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setLayerMode("classified")}
                      disabled={isContinuous}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        layerMode === "classified" && !isContinuous
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                      }`}
                    >
                      Classified ({activeNClasses} Classes)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayerMode("continuous")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        layerMode === "continuous" || isContinuous
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Continuous Gradient
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-card border rounded-lg p-4">
              <MapExportControls
                tileUrl={layerMode === "continuous" || isContinuous ? data.tile_url : (data.classify?.panels?.[0]?.tile_url || data.tile_url)}
                thumbUrl={layerMode === "continuous" || isContinuous ? (data.thumb_url || data.classify?.panels?.[0]?.clean_thumb_url || data.classify?.panels?.[0]?.thumb_url) : (data.classify?.panels?.[0]?.clean_thumb_url || data.classify?.panels?.[0]?.thumb_url || data.thumb_url)}
                downloadUrl={(data as any).download_url}
                district={aoi.name || "Custom"}
                title="Land Surface Temperature"
                classAreas={layerMode === "continuous" || isContinuous ? undefined : activeAreas}
                bbox={data.bbox}
              /></div>
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including statistics, class areas, and classification maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · LST statistics (min, max, mean, std) ·
                  Vegetation class area table · Quantile classification panels · Interpretation notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Land Surface Temperature"
                  district={aoi.name || "Custom"}
                  dateRange={`${data.start_date} to ${data.end_date}`}
                  stats={data.stats as Record<string, number>}
                  classAreas={activeAreas}
                  extraNotes={`LST Analysis covers ${data.district} district from ${data.start_date} to ${data.end_date} using Landsat 8/9 thermal infrared median composite at 30 m resolution (Reclassification: ${method.replace(/_/g, " ")} with ${activeNClasses} classes).`}
                  maps={data.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? []}
                  filename={`LST_${data.district}_${data.start_date}.pdf`}
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

