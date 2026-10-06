import { useState, useEffect, useMemo } from "react";
import { ClassificationControls } from "@/components/ClassificationControls";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Loader2, Mountain, FileText , Play, Tag, RotateCcw, Activity, Droplets } from "lucide-react";
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
import type { SlopeResult, AOIConfig } from "@/lib/api";
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

const SLOPE_COLORS = ["#2166ac","#92c5de","#fee08b","#f4a582","#d6604d"];

const LAYER_OPTIONS = [
  { key: "slope", label: "Slope" },
  { key: "hillshade", label: "Hillshade" },
  { key: "aspect", label: "Aspect" },
  { key: "tpi", label: "TPI (Position)" },
  { key: "tri", label: "TRI (Ruggedness)" },
  { key: "upa", label: "Flow Accumulation" },
  { key: "dir", label: "Flow Direction" },
  { key: "contours", label: "Contours (50m)" },
  { key: "lsi", label: "Landslide Risk" },
  { key: "solar", label: "Solar Insolation" },
];

const palette = (n: number) => {
  const full = ["#2166ac","#4393c3","#92c5de","#d1e5f0","#f7f7f7",
                "#fddbc7","#f4a582","#d6604d","#b2182b","#67001f"];
  if (n === 1) return [full[4]];
  const step = (full.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => full[Math.round(i * step)]);
};


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

export function SlopePage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [customBreaksStr, setCustomBreaksStr] = useState("");
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
  
  const [activeLayer, setActiveLayer] = useState("slope");
  const [inspectedData, setInspectedData] = useState<any>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectPos, setInspectPos] = useState<{lat: number, lon: number} | null>(null);

  const [isDrawMode, setIsDrawMode] = useState(false);
  const [profilePoints, setProfilePoints] = useState<{lat: number, lon: number}[]>([]);
  const [profileData, setProfileData] = useState<any[] | null>(null);
  const [isProfiling, setIsProfiling] = useState(false);

  const [isWatershedMode, setIsWatershedMode] = useState(false);
  const [watershedLevel, setWatershedLevel] = useState<number>(12);
  const [isDelineating, setIsDelineating] = useState(false);
  const [watershedData, setWatershedData] = useState<{ geojson: any, download_url: string, area_km2: number, river_geojson?: any, river_download_url?: string } | null>(null);


  const handleMapClick = async (lat: number, lon: number) => {
    if (isDrawMode) {
      const newPoints = [...profilePoints, {lat, lon}];
      if (newPoints.length === 1) {
        setProfilePoints(newPoints);
      } else if (newPoints.length === 2) {
        setProfilePoints(newPoints);
        setIsProfiling(true);
        try {
          const data = await api.slope.profile({ line: [[newPoints[0].lon, newPoints[0].lat], [newPoints[1].lon, newPoints[1].lat]], aoi });
          setProfileData(data);
        } catch (err) {
          console.error("Profile error:", err);
          setProfileData(null);
        } finally {
          setIsProfiling(false);
          setIsDrawMode(false);
        }
      }
      return;
    }

    if (isWatershedMode) {
      setIsDelineating(true);
      setWatershedData(null);
      try {
        const data = await api.slope.watershed({ lat, lon, level: watershedLevel });
        setWatershedData(data);
      } catch (err) {
        console.error("Watershed error:", err);
      } finally {
        setIsDelineating(false);
        setIsWatershedMode(false);
      }
      return;
    }


    setIsInspecting(true);
    setInspectPos({ lat, lon });
    try {
      const data = await api.slope.inspect({ lat, lon, aoi });
      setInspectedData(data);
    } catch (err) {
      console.error("Inspect error:", err);
      setInspectedData(null);
    } finally {
      setIsInspecting(false);
    }
  };


  const getCustomBreaks = () => {
    if (method !== "custom_breaks" || !customBreaksStr.trim()) return undefined;
    const vals = customBreaksStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    return vals.length > 0 ? vals : undefined;
  };

  const mapMutation = useMutation({
    mutationFn: () => api.slope.map({ aoi, n_classes: nClasses, method, custom_labels: customClassNames, custom_breaks: getCustomBreaks() }),
  });
  const statsMutation = useMutation({
    mutationFn: () => api.slope.stats({ aoi, n_classes: nClasses, method, custom_labels: customClassNames, custom_breaks: getCustomBreaks() }),
  });
  const classifyMutation = useMutation({
    mutationFn: () => api.slope.classify({ aoi, n_classes: nClasses, method, custom_labels: customClassNames, custom_breaks: getCustomBreaks() }),
  });
  const exportMutation = useMutation({
    mutationFn: () => api.slope.export({ aoi, n_classes: nClasses, method, custom_labels: customClassNames, custom_breaks: getCustomBreaks() }),
  });

  const handleAnalyze = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending;

  const [loadingMessage, setLoadingMessage] = useState("Connecting to Earth Engine...");

  useEffect(() => {
    if (!isPending) return;
    const messages = [
      "Connecting to Earth Engine...",
      "Processing Digital Elevation Model...",
      "Computing Hydrology and Flow...",
      "Calculating Classification Statistics...",
      "Rendering Maps...",
    ];
    let step = 0;
    setLoadingMessage(messages[step]);
    
    const interval = setInterval(() => {
      step = (step + 1) % messages.length;
      setLoadingMessage(messages[step]);
      if (step === messages.length - 1) {
        clearInterval(interval);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, [isPending]);
  const error = mapMutation.error || statsMutation.error || classifyMutation.error || exportMutation.error;
  
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const classifyData = classifyMutation.data;
  const exportData = exportMutation.data;

  const data = (mapData && statsData && classifyData && exportData) ? {
    ...mapData,
    ...statsData,
    ...classifyData,
    ...exportData
  } : null;


  const getActiveTileUrl = () => {
    if (!data) return "";
    if (activeLayer === "hillshade") return data.hillshade_tile_url;
    if (activeLayer === "aspect") return data.aspect_tile_url;
    if (activeLayer === "tpi") return data.tpi_tile_url;
    if (activeLayer === "tri") return data.tri_tile_url;
    if (activeLayer === "upa") return data.upa_tile_url;
    if (activeLayer === "dir") return data.dir_tile_url;
    if (activeLayer === "contours") return data.contours_tile_url;
    return data.slope_tile_url;
  };

  const activeAreas = useMemo(() => {
    const rawAreas = data?.classify?.panels?.[0]?.class_areas || data?.class_areas_km2;
    if (!rawAreas) return undefined;
    const mapped: Record<string, number> = {};
    const keys = Object.keys(rawAreas);
    keys.forEach((oldKey, i) => {
      const newKey = customClassNames[i] || oldKey;
      mapped[newKey] = rawAreas[oldKey];
    });
    return mapped;
  }, [data, customClassNames]);



  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Mountain className="w-5 h-5" />
          Terrain Analysis
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Slope, hillshade and aspect derived from SRTM 30 m DEM.
          Slope in degrees, hillshade at 315° azimuth, aspect in degrees from north.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        
        <ClassificationControls
          method={method}
          setMethod={setMethod}
          nClasses={nClasses}
          setNClasses={setNClasses}
          minClasses={2}
          maxClasses={10}
        />

        {method === "custom_breaks" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500">Custom Breakpoints (comma separated)</Label>
            <input
              type="text"
              value={customBreaksStr}
              onChange={(e) => setCustomBreaksStr(e.target.value)}
              placeholder="e.g. 5, 10, 15, 20"
              className="w-full h-8 text-xs rounded border border-input bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">Enter {nClasses - 1} numeric breakpoints.</p>
          </div>
        )}

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
                  style={{ background: palette(nClasses)[i % nClasses] }}
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
          className="w-full gap-2"
          onClick={handleAnalyze}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mountain className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Analyze Terrain"}
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
        {!data && !isPending && (
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
            <p className="text-lg font-medium text-foreground">{loadingMessage}</p>
            <p className="text-xs">Analyzing terrain for {aoi.name || 'Custom'} (typically takes 15–60 seconds).</p>
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
            <TabsContent value="map" className="flex-1 min-h-[500px] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {LAYER_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveLayer(key)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 items-center">
                    {isWatershedMode && (
                      <select 
                        value={watershedLevel} 
                        onChange={(e) => setWatershedLevel(Number(e.target.value))}
                        className="bg-card border-input border rounded px-2 py-1 text-xs h-8"
                      >
                        <option value={12}>Level 12 (Local)</option>
                        <option value={10}>Level 10 (Sub-basin)</option>
                        <option value={8}>Level 8 (Basin)</option>
                        <option value={6}>Level 6 (Region)</option>
                      </select>
                    )}
                    <Button 
                      variant={isWatershedMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setIsWatershedMode(!isWatershedMode);
                        setIsDrawMode(false);
                        setWatershedData(null);
                      }}
                      className="gap-2 text-xs"
                    >
                      <Droplets className="w-4 h-4" />
                      {isWatershedMode ? "Click pour point..." : "Watershed"}
                    </Button>
                  </div>
                  <Button 
                    variant={isDrawMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsDrawMode(!isDrawMode);
                      setIsWatershedMode(false);
                      setProfilePoints([]);
                      setProfileData(null);
                    }}
                    className="gap-2 text-xs"
                  >
                    <Activity className="w-4 h-4" />
                    {isDrawMode ? (profilePoints.length === 1 ? "Click end point..." : "Click start point...") : "Profile"}
                  </Button>
                </div>
              </div>
              <div className="h-[520px] rounded-lg overflow-hidden border relative">
                <DistrictMap 
                  center={data.center} 
                  tileUrl={getActiveTileUrl()} 
                  onMapClick={handleMapClick} 
                  proposedFacilities={
                    profilePoints.length > 0 ? profilePoints.map(p => [p.lon, p.lat] as [number, number]) : undefined
                  }
                  customGeojson={watershedData?.geojson}
                  customGeojsonStyle={{ color: "#3b82f6", weight: 3, fillOpacity: 0.3 }}
                  riverGeojson={watershedData?.river_geojson}
                />
                
                {/* Floating Inspector Panel */}
                {(isInspecting || inspectedData) && (
                  <div className="absolute top-4 right-4 z-[1000] bg-background/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-primary/20 text-sm max-w-[250px]">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-foreground">Terrain Inspector</h4>
                      <button onClick={() => { setInspectedData(null); setInspectPos(null); setIsInspecting(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    {inspectPos && (
                      <p className="text-xs text-muted-foreground mb-3">{inspectPos.lat.toFixed(5)}, {inspectPos.lon.toFixed(5)}</p>
                    )}
                    {isInspecting ? (
                      <div className="flex items-center gap-2 text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Inspecting point...</span>
                      </div>
                    ) : inspectedData ? (
                      <div className="space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Elevation:</span> <span className="font-medium">{inspectedData.elevation?.toFixed(1) ?? 'N/A'} m</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Slope:</span> <span className="font-medium">{inspectedData.slope?.toFixed(1) ?? 'N/A'} °</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Aspect:</span> <span className="font-medium">{inspectedData.aspect?.toFixed(1) ?? 'N/A'} °</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">TPI:</span> <span className="font-medium">{inspectedData.tpi?.toFixed(2) ?? 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">TRI:</span> <span className="font-medium">{inspectedData.tri?.toFixed(2) ?? 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Flow Acc.:</span> <span className="font-medium">{inspectedData.upa?.toFixed(2) ?? 'N/A'} km²</span></div>
                      </div>
                    ) : (
                      <p className="text-destructive">Failed to inspect point</p>
                    )}
                  </div>
                )}
                
                {/* Elevation Profile Panel */}
                {(isProfiling || profileData) && (
                  <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-background/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-primary/20">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-foreground">Elevation Profile</h4>
                      <button onClick={() => { setProfileData(null); setProfilePoints([]); setIsProfiling(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    {isProfiling ? (
                      <div className="flex items-center justify-center gap-2 text-primary h-40">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Generating profile...</span>
                      </div>
                    ) : profileData ? (
                      <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={profileData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                            <XAxis 
                              dataKey="distance" 
                              tickFormatter={(val) => `${(val / 1000).toFixed(1)}km`}
                              stroke="currentColor" 
                              fontSize={10} 
                            />
                            <YAxis 
                              domain={['auto', 'auto']}
                              tickFormatter={(val) => `${val}m`}
                              stroke="currentColor" 
                              fontSize={10} 
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                              labelFormatter={(val) => `Distance: ${(Number(val) / 1000).toFixed(2)} km`}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="elevation" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={2} 
                              dot={false}
                              name="Elevation (m)" 
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-destructive text-center p-4">Failed to load profile.</p>
                    )}
                  </div>
                )}

                {/* Watershed Panel */}
                {(isDelineating || watershedData) && (
                  <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-primary/20 min-w-[200px]">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-foreground flex items-center gap-2"><Droplets className="w-4 h-4 text-primary" /> Watershed</h4>
                      <button onClick={() => { setWatershedData(null); setIsDelineating(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    {isDelineating ? (
                      <div className="flex items-center gap-2 text-primary text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Delineating basin...</span>
                      </div>
                    ) : watershedData ? (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Catchment Area:</span> 
                          <span className="font-medium">{watershedData.area_km2.toLocaleString()} km²</span>
                        </div>
                        <Button 
                          className="w-full text-xs gap-2" 
                          size="sm"
                          onClick={() => window.open(watershedData.download_url, '_blank')}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Download Basin SHP
                        </Button>
                        {watershedData.river_download_url && (
                          <Button 
                            className="w-full text-xs gap-2" 
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(watershedData.river_download_url, '_blank')}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Download Rivers SHP
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-destructive text-sm text-center py-2">Failed to delineate.</p>
                    )}
                  </div>
                )}

              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">Slope:</strong> blue (flat) → red (steep)
                </span>
                <span>
                  <strong className="text-foreground">Hillshade:</strong> black (shadow) → white (lit)
                </span>
                <span>
                  <strong className="text-foreground">Aspect:</strong> circular color wheel (N/E/S/W)
                </span>
                <span>
                  <strong className="text-foreground">TPI:</strong> blue (valleys) → red (ridges)
                </span>
                <span>
                  <strong className="text-foreground">TRI:</strong> light (flat) → dark blue (rugged)
                </span>
                <span>
                  <strong className="text-foreground">Flow Accumulation:</strong> light blue → dark blue (high flow)
                </span>
                <span>
                  <strong className="text-foreground">Flow Direction:</strong> categorical colors (8 directions)
                </span>
                <span>
                  <strong className="text-foreground">Contours:</strong> 50m intervals
                </span>
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">

              {/* Map Layer Switcher Header */}
              <div className="flex flex-col gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">Map Symbology:</span>
                  <div className="inline-flex flex-wrap items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    {LAYER_OPTIONS.map(({ key, label }) => (
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
              <MapExportControls
                tileUrl={getActiveTileUrl()!}
                thumbUrl={activeLayer === "slope" ? (data as any).slope_thumb_url : activeLayer === "hillshade" ? (data as any).hillshade_thumb_url : activeLayer === "aspect" ? (data as any).aspect_thumb_url : activeLayer === "tpi" ? (data as any).tpi_thumb_url : activeLayer === "tri" ? (data as any).tri_thumb_url : activeLayer === "upa" ? (data as any).upa_thumb_url : activeLayer === "dir" ? (data as any).dir_thumb_url : (data as any).contours_thumb_url}
                downloadUrl={activeLayer === "slope" ? (data as any).slope_download_url : activeLayer === "hillshade" ? (data as any).hillshade_download_url : activeLayer === "aspect" ? (data as any).aspect_download_url : activeLayer === "tpi" ? (data as any).tpi_download_url : activeLayer === "tri" ? (data as any).tri_download_url : activeLayer === "upa" ? (data as any).upa_download_url : activeLayer === "dir" ? (data as any).dir_download_url : (data as any).contours_download_url}
                district={aoi.name || "Custom"}
                title={LAYER_OPTIONS.find(l => l.key === activeLayer)?.label || "Terrain Map"}
                classAreas={activeLayer === "slope" ? data.class_areas_km2 : undefined}
              />
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Terrain Statistics — {data.district}
                </h2>
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
                <h3 className="font-medium mb-3">Slope Class Areas</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(activeAreas || {}).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: SLOPE_COLORS[i % SLOPE_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={SLOPE_COLORS[i % SLOPE_COLORS.length]} />
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
                    {Object.entries(activeAreas || {}).map(([cls, km2], i) => (
                      <tr key={cls} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-1.5 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                            style={{ background: SLOPE_COLORS[i % SLOPE_COLORS.length] }}
                          />
                          {cls}
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
                {palette(data.classify.n_classes).map((color, i) => {
                  const labels: Record<number, string[]> = {
                    2: ["Flat","Steep"],
                    3: ["Flat","Moderate","Steep"],
                    4: ["Flat","Gentle","Moderate","Steep"],
                    5: ["Flat","Gentle","Moderate","Steep","Very Steep"],
                    6: ["Flat","Gentle","Moderate","Steep","Very Steep","Cliff"],
                  };
                  const lbl = (labels[data.classify.n_classes] ?? [])[i] ?? `Class ${i + 1}`;
                  return (
                    <span key={i} className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                      {lbl}
                    </span>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {data.classify.panels.map((panel) => (
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
                          fill: palette(data.classify.n_classes)[i],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis unit=" km²" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[3, 3, 0, 0]}>
                          {Object.keys(panel.areas).map((_, i) => (
                            <Cell key={i} fill={palette(data.classify.n_classes)[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Report ── */}
            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including terrain statistics, class areas, and classification maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · Elevation & slope statistics (min, max, mean, std) ·
                  Slope class area table · Quantile classification panels · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Terrain and Slope"
                  district={aoi.name || "Custom"}
                  dateRange="Current (SRTM 30m)"
                  stats={data.stats as Record<string, number>}
                  classAreas={activeAreas}
                  extraNotes={`Terrain analysis derived from USGS SRTM (Shuttle Radar Topography Mission) 30m Digital Elevation Model. Analysis covers ${data.district} district.`}
                  maps={data.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? []}
                  filename={`Slope_${data.district}.pdf`}
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
