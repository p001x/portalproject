import { useState, useEffect, useMemo, useCallback } from "react";
import { ClassificationControls } from "@/components/ClassificationControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
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
import { Loader2, Droplet, FileText, Tag, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";

const YEARS = Array.from({ length: 2024 - 1980 + 1 }, (_, i) => 1980 + i);

const SEASONS = [
  { value: "season_a", label: "Season A (Sep-Feb)" },
  { value: "season_b", label: "Season B (Mar-Jun)" },
  { value: "season_c", label: "Season C (Jul-Sep)" },
  { value: "annual", label: "Annual (Jan-Dec)" },
  { value: "custom", label: "Custom Range" }
];

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" }, { value: 3, label: "March" },
  { value: 4, label: "April" }, { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" }, { value: 9, label: "September" },
  { value: 10, label: "October" }, { value: 11, label: "November" }, { value: 12, label: "December" }
];

// VHI uses Red for Extreme Drought (Low VHI) to Green for No Drought (High VHI)
const VIBRANT_DROUGHT_STOPS = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"];

const palette = (n: number) => {
  const stops = VIBRANT_DROUGHT_STOPS;
  if (n <= 1) return [stops[Math.floor(stops.length / 2)]];
  if (n === stops.length) return stops;
  
  const hexToRgb = (h: string) => {
    const clean = h.replace("#", "");
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  };
  
  const rgbToHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

  const rgbStops = stops.map(hexToRgb);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (rgbStops.length - 1);
    const idx = Math.floor(t);
    const frac = t - idx;
    if (idx >= rgbStops.length - 1) return stops[stops.length - 1];
    const c1 = rgbStops[idx];
    const c2 = rgbStops[idx + 1];
    return rgbToHex(
      c1[0] + (c2[0] - c1[0]) * frac,
      c1[1] + (c2[1] - c1[1]) * frac,
      c1[2] + (c2[2] - c1[2]) * frac
    );
  });
};

const DEFAULT_PRESETS: Record<number, string[]> = {
  2: ["Drought", "No Drought"],
  3: ["Severe Drought", "Moderate Drought", "No Drought"],
  4: ["Extreme", "Severe", "Moderate", "None"],
  5: ["Extreme Drought", "Severe Drought", "Moderate Drought", "Mild Drought", "No Drought"],
};

function getDefaultLabels(n: number): string[] {
  if (DEFAULT_PRESETS[n]) return [...DEFAULT_PRESETS[n]];
  return Array.from({ length: n }, (_, i) => `Class ${i + 1}`);
}

export function DroughtPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda", start_year: 1980, end_year: 2024 });
  const [year, setYear] = useState(2024);
  const [season, setSeason] = useState("season_b");
  const [startMonth, setStartMonth] = useState(3);
  const [endMonth, setEndMonth] = useState(6);
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));

  const [activeLayer, setActiveLayer] = useState<"continuous" | "classified">("continuous");

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

  const baseReq = {
    aoi, start_year: year, end_year: year,
    season, start_month: season === "custom" ? startMonth : undefined, end_month: season === "custom" ? endMonth : undefined,
  };

  const mapMutation = useMutation({ mutationFn: () => api.drought.map(baseReq) });
  const statsMutation = useMutation({ mutationFn: () => api.drought.stats(baseReq) });
  const classifyMutation = useMutation({
    mutationFn: () => api.drought.classify({ ...baseReq, n_classes: nClasses, method, custom_labels: customClassNames })
  });

  const handleAnalyze = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending;
  const error = mapMutation.error || statsMutation.error || classifyMutation.error;

  const isContinuous = activeLayer === "continuous";
  const activeNClasses = classifyMutation.data?.n_classes || nClasses;
  const activeColors = !isContinuous ? palette(activeNClasses) : palette(5);

  const currentTileUrl = isContinuous
    ? mapMutation.data?.tile_url
    : classifyMutation.data?.panels?.[0]?.class_tile_url;

  const activeAreas = useMemo(() => {
    const rawAreas = classifyMutation.data?.panels?.[0]?.class_areas;
    if (!rawAreas) return undefined;
    const mapped: Record<string, number> = {};
    const keys = Object.keys(rawAreas);
    keys.forEach((oldKey, i) => {
      const newKey = customClassNames[i] || oldKey;
      mapped[newKey] = rawAreas[oldKey];
    });
    return mapped;
  }, [classifyMutation.data, customClassNames]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-lg">
            <Droplet className="w-5 h-5" />
            Agricultural Drought
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Vegetation Health Index (VHI) computed over seasonal periods
            combining Vegetation (VCI) and Temperature (TCI).
          </p>

          <StudyAreaSelector value={aoi} onChange={setAoi} />

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
              <Label>Season</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {season === "custom" && (
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label>Start Month</Label>
                  <Select value={String(startMonth)} onValueChange={(v) => setStartMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label>End Month</Label>
                  <Select value={String(endMonth)} onValueChange={(v) => setEndMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <ClassificationControls
            method={method}
            setMethod={setMethod}
            nClasses={nClasses}
            setNClasses={setNClasses}
            minClasses={2}
            maxClasses={10}
          />

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
                    style={{ background: palette(nClasses)[i] }}
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

          <Button
            className="w-full gap-2 mt-4"
            onClick={handleAnalyze}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Droplet className="w-4 h-4" />
            )}
            {isPending ? "Computing VHI…" : "Analyze Drought"}
          </Button>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
              {error.message}
            </p>
          )}
        </aside>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={75}>
        <main className="h-full overflow-y-auto p-6">
          {!mapMutation.data && !isPending && (
            <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
              <DistrictMap aoi={aoi} basemap="satellite" />
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
              <p>Analyzing Agricultural Drought for {aoi.name}…</p>
              <p className="text-xs">GEE analysis typically takes 5–15 seconds.</p>
            </div>
          )}

          {mapMutation.data && (
            <Tabs defaultValue="map" className="h-full flex flex-col">
              <TabsList className="mb-4 self-start">
                <TabsTrigger value="map">Map</TabsTrigger>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
                <TabsTrigger value="classify">Classification Components</TabsTrigger>
              </TabsList>

              <TabsContent value="map" className="flex-1 min-h-[500px]">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant={activeLayer === "continuous" ? "default" : "outline"}
                    onClick={() => setActiveLayer("continuous")}
                  >
                    VHI Continuous
                  </Button>
                  <Button
                    size="sm"
                    variant={activeLayer === "classified" ? "default" : "outline"}
                    onClick={() => setActiveLayer("classified")}
                    disabled={!classifyMutation.data}
                  >
                    VHI Classified
                  </Button>
                </div>
                <div className="h-[520px] rounded-lg overflow-hidden border">
                  {currentTileUrl ? (
                    <DistrictMap tileUrl={currentTileUrl} aoi={aoi} />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-muted/20">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {(!isContinuous ? customClassNames : DEFAULT_PRESETS[5]).map((label, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm inline-block"
                        style={{ background: activeColors[i] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="stats" className="space-y-6">
                <div>
                  <h2 className="font-semibold text-lg mb-1">
                    Statistics — {aoi.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Vegetation Health Index (VHI) distribution across the district.
                  </p>
                </div>

                {statsMutation.data ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Object.entries(statsMutation.data).map(([label, val]) => (
                      <div key={label} className="bg-card border rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className="text-2xl font-bold text-primary">{val}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                )}

                {activeAreas && classifyMutation.data && (
                  <div>
                    <h3 className="font-medium mb-3">Drought Vulnerability Area ({mapMutation.data.season_label} {year})</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={Object.entries(activeAreas).map(([k, v], i) => ({
                          name: k,
                          area: v,
                          fill: activeColors[i],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                        <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                          {Object.keys(activeAreas).map((_, i) => (
                            <Cell key={i} fill={activeColors[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="classify">
                {classifyMutation.data ? (
                   <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {classifyMutation.data.panels.map((p, i) => (
                           <div key={i} className="border rounded-lg p-3 space-y-2">
                              <h4 className="font-medium text-sm">{p.title}</h4>
                              <div className="h-48 rounded bg-muted overflow-hidden relative">
                                <img src={p.thumb_url} className="w-full h-full object-cover" alt={p.name} />
                              </div>
                           </div>
                        ))}
                      </div>
                   </div>
                ) : (
                   <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
