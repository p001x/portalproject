import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Loader2, AlertTriangle, FileText , Tag, RotateCcw } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { LandslideMapResult, LandslideStatsResult, LandslideClassifyResult, LandslideExportResult, AOIConfig } from "@/lib/api";
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

const YEARS = Array.from({ length: 2024 - 1981 + 1 }, (_, i) => 1981 + i);

const SUSCEPTIBILITY_COLORS = ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"];
const SUSCEPTIBILITY_LABELS = ["Very Low", "Low", "Moderate", "High", "Very High"];

const PALETTES: Record<string, string[]> = {
  "default": ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"],
  "blues": ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"],
  "viridis": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  "inferno": ["#000004", "#57106e", "#bc3754", "#f98e09", "#fcffa4"],
  "grays": ["#ffffff", "#f0f0f0", "#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525", "#000000"]
};

const FACTOR_LAYERS = [
  { key: "slope", label: "Slope" },
  { key: "rainfall", label: "Rainfall" },
  { key: "lithology", label: "Lithology" },
  { key: "soiltype", label: "Soil Type" },
  { key: "landcover", label: "Land Cover" },
  { key: "ndvi", label: "NDVI (Vegetation)" },
  { key: "twi", label: "TWI" },
  { key: "dist_roads", label: "Dist. to Roads" },
  { key: "dist_rivers", label: "Dist. to Rivers" }
];


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

export function LandslidePage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  const [startYear, setStartYear] = useState(2015);
  const [endYear, setEndYear] = useState(2024);
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));

  useEffect(() => {
    setCustomClassNames((prev) => {
      if (prev.length === nClasses) return prev;
      const next = getDefaultLabels(nClasses);
      for (let i = 0; i < Math.min(prev.length, nClasses); i++) {
        if (!DEFAULT_PRESETS[prev.length]?.includes(prev[i])) {
          next[i] = prev[i];
        }
      }
      return next;
    });
  }, [nClasses]);
  const [activeLayer, setActiveLayer] = useState<string>("continuous");

  // Factor reversal states
  const [reverseSlope, setReverseSlope] = useState(false);
  const [reverseRainfall, setReverseRainfall] = useState(false);
  const [reverseLitho, setReverseLitho] = useState(false);
  const [reverseSoiltype, setReverseSoiltype] = useState(false);
  const [reverseLandcover, setReverseLandcover] = useState(false);
  const [reverseTwi, setReverseTwi] = useState(false);
  const [reverseDist, setReverseDist] = useState(false);

  // Custom Palettes state
  const [customPalettes, setCustomPalettes] = useState<Record<string, string>>({});

  const handlePaletteChange = (factor: string, paletteName: string) => {
    setCustomPalettes((prev) => ({ ...prev, [factor]: paletteName }));
  };

  const getReq = () => {
    const palettes: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(customPalettes)) {
      if (v && v !== "default" && PALETTES[v]) palettes[k] = PALETTES[v];
    }
    return {
      aoi, start_year: startYear, end_year: endYear, n_classes: nClasses,
      reverse_slope: reverseSlope, reverse_rainfall: reverseRainfall,
      reverse_litho: reverseLitho, reverse_soiltype: reverseSoiltype,
      reverse_landcover: reverseLandcover, reverse_twi: reverseTwi,
      reverse_dist: reverseDist, custom_palettes: palettes
    };
  };

  const mapMutation = useMutation<LandslideMapResult, Error>({
    mutationFn: () => api.landslide.map(getReq()),
  });
  const statsMutation = useMutation<LandslideStatsResult, Error>({
    mutationFn: () => api.landslide.stats(getReq()),
  });
  const classifyMutation = useMutation<LandslideClassifyResult, Error>({
    mutationFn: () => api.landslide.classify(getReq()),
  });
  const exportMutation = useMutation<LandslideExportResult, Error>({
    mutationFn: () => api.landslide.export(getReq()),
  });

  const handleAnalyze = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending;
  const anyData = mapMutation.data || statsMutation.data || classifyMutation.data || exportMutation.data;
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const classifyData = classifyMutation.data;
  const exportData = exportMutation.data;
  const error = mapMutation.error || statsMutation.error || classifyMutation.error || exportMutation.error;

  const currentTileUrl = (() => {
    if (!mapData) return undefined;
    if (activeLayer === "continuous") return mapData.lsi_tile_url;
    if (activeLayer === "classified") return mapData.lsi_class_tile_url;
    return mapData.factor_maps?.[activeLayer]?.tile_url;
  })();

  const activeAreas = useMemo(() => {
    const rawAreas = classifyData?.panels?.[0]?.class_areas || statsData?.class_areas_km2;
    if (!rawAreas) return undefined;
    const mapped: Record<string, number> = {};
    const keys = Object.keys(rawAreas);
    keys.forEach((oldKey, i) => {
      const newKey = customClassNames[i] || oldKey;
      mapped[newKey] = rawAreas[oldKey];
    });
    return mapped;
  }, [classifyData, statsData, customClassNames]);



  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <AlertTriangle className="w-5 h-5" />
          Landslide Susceptibility
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Landslide Susceptibility Index (LSI) computed from slope, rainfall,
          land use, soil, and proximity factors over the selected period.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label>Start year</Label>
          <Select value={String(startYear)} onValueChange={(v) => setStartYear(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>End year</Label>
          <Select value={String(endYear)} onValueChange={(v) => setEndYear(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Classification Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
              <SelectItem value="equal_interval">Discrete (Equal Interval)</SelectItem>
              <SelectItem value="quantiles">Discrete (Quantiles / Equal Area)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Classes: {nClasses}</Label>
            <span className="text-[11px] text-muted-foreground">{nClasses} intervals</span>
          </div>
          <Slider
            min={2}
            max={10}
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

          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {Array.from({ length: nClasses }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-xs shrink-0 border border-black/15 shadow-2xs"
                  style={{ background: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length] }}
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


        {/* Factor Reversal Section */}
        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reverse Factors
          </Label>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span>Slope Factor</span>
              <Switch checked={reverseSlope} onCheckedChange={setReverseSlope} />
            </div>
            <div className="flex items-center justify-between">
              <span>Rainfall Factor</span>
              <Switch checked={reverseRainfall} onCheckedChange={setReverseRainfall} />
            </div>
            <div className="flex items-center justify-between">
              <span>Lithology Factor</span>
              <Switch checked={reverseLitho} onCheckedChange={setReverseLitho} />
            </div>
            <div className="flex items-center justify-between">
              <span>Soil Type Factor</span>
              <Switch checked={reverseSoiltype} onCheckedChange={setReverseSoiltype} />
            </div>
            <div className="flex items-center justify-between">
              <span>Land Cover Factor</span>
              <Switch checked={reverseLandcover} onCheckedChange={setReverseLandcover} />
            </div>
            <div className="flex items-center justify-between">
              <span>TWI Hydro Factor</span>
              <Switch checked={reverseTwi} onCheckedChange={setReverseTwi} />
            </div>
            <div className="flex items-center justify-between">
              <span>Road Distance Factor</span>
              <Switch checked={reverseDist} onCheckedChange={setReverseDist} />
            </div>
          </div>
        </div>

        {/* Color Palettes Section */}
        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Color Palettes
          </Label>
          <div className="space-y-2 text-xs">
            {FACTOR_LAYERS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span>{label}</span>
                <Select
                  value={customPalettes[key] || "default"}
                  onValueChange={(v) => handlePaletteChange(key, v)}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="blues">Blues</SelectItem>
                    <SelectItem value="viridis">Viridis</SelectItem>
                    <SelectItem value="inferno">Inferno</SelectItem>
                    <SelectItem value="grays">Grays</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleAnalyze}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Analyze Susceptibility"}
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
        <main className="h-full overflow-y-auto p-6">
        {!anyData && !isPending && (
          <div className="h-full rounded-lg overflow-hidden border relative">
            <DistrictMap 
              center={[-1.94, 29.87]} 
              zoom={8} 
              tileUrl="" 
              basemap="satellite" 
            />
            
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-background/10 backdrop-blur-[1px] z-[1000]">
              <div className="bg-card/90 backdrop-blur-md p-6 rounded-2xl border shadow-2xl max-w-sm text-center pointer-events-none transition-transform hover:scale-105 duration-300">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center border shadow-inner">
                  <AlertTriangle className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-extrabold mb-2 text-foreground tracking-tight">Landslide Susceptibility</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Configure parameters in the sidebar and click <strong>Run Analysis</strong> to process the satellite data.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* If no data at all but loading, show a big spinner */}
        {!anyData && isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Analyzing landslide susceptibility for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {anyData && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="classify">Classification</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px]">
              {mapMutation.isPending && !mapData ? (
                <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : mapData ? (
                <>
                  <div className="flex gap-2 mb-3">
                    <Button
                      size="sm"
                      variant={activeLayer === "continuous" ? "default" : "outline"}
                      onClick={() => setActiveLayer("continuous")}
                    >
                      LSI Continuous
                    </Button>
                    <Button
                      size="sm"
                      variant={activeLayer === "classified" ? "default" : "outline"}
                      onClick={() => setActiveLayer("classified")}
                    >
                      LSI Classified
                    </Button>
                    {FACTOR_LAYERS.map(({ key, label }) => (
                      <Button
                        key={key}
                        size="sm"
                        variant={activeLayer === key ? "default" : "outline"}
                        onClick={() => setActiveLayer(key)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="h-[520px] rounded-lg overflow-hidden border">
                    <DistrictMap center={mapData.center} tileUrl={currentTileUrl || ""} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {(() => {
                      let labels = SUSCEPTIBILITY_LABELS;
                      let colors = SUSCEPTIBILITY_COLORS;
                      if (activeLayer !== "continuous" && activeLayer !== "classified") {
                        labels = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
                        const paletteKey = customPalettes[activeLayer] || "default";
                        colors = PALETTES[paletteKey] || SUSCEPTIBILITY_COLORS;
                      }
                      return labels.map((label, i) => (
                        <span key={label} className="flex items-center gap-1.5">
                          <span
                            className="w-3 h-3 rounded-sm inline-block"
                            style={{ background: colors[i] }}
                          />
                          {label}
                        </span>
                      ));
                    })()}
                  </div>
                </>
              ) : null}
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              {statsMutation.isPending && !statsData ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : statsData ? (
                <>
                  <div>
                    <h2 className="font-semibold text-lg mb-1">
                      Statistics — {mapData?.district || aoi.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Landslide Susceptibility Index distribution across the district.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {Object.entries(statsData.stats).map(([label, val]) => (
                      <div key={label} className="bg-card border rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className="text-2xl font-bold text-primary">{val}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Susceptibility Class Areas</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={Object.entries(statsData.class_areas_km2).map(([k, v], i) => ({
                          name: k,
                          area: v,
                          fill: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                        <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                          {Object.keys(statsData.class_areas_km2).map((_, i) => (
                            <Cell key={i} fill={SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <table className="w-full text-sm mt-4 border rounded-lg overflow-hidden">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Class</th>
                          <th className="text-right px-3 py-2 font-medium">Area (km²)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(statsData.class_areas_km2).map(([cls, km2], i) => (
                          <tr key={cls} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                            <td className="px-3 py-1.5 flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                                style={{ background: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length] }}
                              />
                              {cls}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{km2}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </TabsContent>

            {/* Classification */}
            <TabsContent value="classify" className="space-y-6">
              {classifyMutation.isPending && !classifyData ? (
                 <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : classifyData ? (
                <>
                  <div>
                    <h2 className="font-semibold text-lg mb-1">
                      Quantile Classification — {mapData?.district || aoi.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Breakpoints computed from the actual pixel distribution within the district.
                    </p>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {SUSCEPTIBILITY_LABELS.slice(0, classifyData.classify.n_classes).map((label, i) => (
                      <span key={label} className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded-sm"
                          style={{ background: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length] }}
                        />
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {classifyData.classify.panels.map((panel) => (
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
                            data={Object.entries(panel.areas).map(([k, v], i) => ({
                              name: k.split(" (")[0],
                              area: v,
                              fill: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length],
                            }))}
                          >
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis unit=" km²" tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                            <Bar dataKey="area" radius={[3, 3, 0, 0]}>
                              {Object.keys(panel.areas).map((_, i) => (
                                <Cell key={i} fill={SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              
              {/* Map Layer Switcher Header */}
              <div className="flex flex-col gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">Map Symbology:</span>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    <button
                      onClick={() => setActiveLayer("classified")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        activeLayer === "classified"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      LSI Classified
                    </button>
                    <button
                      onClick={() => setActiveLayer("continuous")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        activeLayer === "continuous"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      LSI Continuous
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">Factor Maps:</span>
                  <div className="inline-flex flex-wrap items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    {FACTOR_LAYERS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setActiveLayer(key)}
                        className={`px-3 py-1 rounded font-medium transition-all ${
                          activeLayer === key
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {exportMutation.isPending && !exportData ? (
                 <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : exportData && mapData ? (
                <div className="bg-card border rounded-lg p-4">
                  <MapExportControls
                    tileUrl={currentTileUrl!}
                    thumbUrl={activeLayer === "continuous" ? exportData.lsi_thumb_url : activeLayer === "classified" ? exportData.lsi_class_thumb_url : exportData.factor_maps?.[activeLayer]?.thumb_url}
                    downloadUrl={activeLayer === "continuous" ? exportData.lsi_download_url : exportData.factor_maps?.[activeLayer]?.download_url}
                    district={mapData.district || aoi.name || "Custom"}
                    title={activeLayer === "continuous" ? "LSI Continuous Map" : activeLayer === "classified" ? "LSI Classes Map" : `${FACTOR_LAYERS.find(l => l.key === activeLayer)?.label} Factor Map`}
                    classAreas={activeLayer === "classified" ? statsData?.class_areas_km2 : undefined}
                  />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Waiting for map data to load...</div>
              )}
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {mapData?.district || aoi.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including LSI statistics, susceptibility area analysis, and classification maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · LSI statistics (min, max, mean, std) ·
                  Susceptibility class area table · Quantile classification panels · Methodology notes.
                </p>
                
                {(mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending) ? (
                   <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/> Gathering report data...</div>
                ) : (mapData && statsData && classifyData && exportData) ? (
                  <ReportDownloadButton aoi={aoi}
                    moduleName="Landslide Susceptibility"
                    district={mapData.district || aoi.name || "Custom"}
                    dateRange={`${mapData.start_year} to ${mapData.end_year}`}
                    stats={statsData.stats as Record<string, number>}
                    classAreas={statsData.class_areas_km2}
                    extraNotes={`Landslide Susceptibility Index (LSI) is derived using CHIRPS precipitation, SRTM slope, and ESA WorldCover land cover data. Analysis covers ${mapData.district} district from ${mapData.start_year} to ${mapData.end_year}.`}
                    maps={classifyData.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? []}
                    filename={`Landslide_${mapData.district}_${mapData.start_year}.pdf`}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Report data is unavailable. Please try analyzing again.</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

