import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Droplet, FileText, Info, Play, Tag, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { api, IrrigationMapResult, IrrigationStatsResult, IrrigationExportResult, AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";

const DEFAULT_PRESETS: Record<number, string[]> = {
  1: ["Uniform / Full Area"],
  2: ["Low", "High"],
  3: ["Low", "Moderate", "High"],
  4: ["Low", "Moderate", "High", "Very High"],
  5: ["Very Low", "Low", "Moderate", "High", "Very High"],
  6: ["Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  7: ["Extremely Low", "Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
};

function getDefaultLabels(n: number): string[] {
  if (DEFAULT_PRESETS[n]) return [...DEFAULT_PRESETS[n]];
  return Array.from({ length: n }, (_, i) => `Class ${i + 1}`);
}

const DEFICIT_PRESETS: Record<number, string[]> = {
  3: ["Surplus", "Balanced", "Deficit"],
  4: ["Surplus", "Balanced", "Moderate Deficit", "Severe Deficit"],
  5: ["High Surplus", "Slight Surplus", "Balanced", "Moderate Deficit", "Severe Deficit"],
  6: ["High Surplus", "Slight Surplus", "Balanced", "Slight Deficit", "Moderate Deficit", "Severe Deficit"],
};

const CLASS_COLORS = ["#4575b4", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"];

const CROP_TYPES = ["Maize", "Beans", "Potatoes", "Rice", "Coffee", "Tea", "Generic"];

const DEFICIT_LEGEND: LegendItem[] = [
  { color: "#0000ff", label: "<-10mm (Surplus)" },
  { color: "#a3ccff", label: "-10 to 0mm" },
  { color: "#ffffff", label: "0mm (Balanced)" },
  { color: "#ff9999", label: "0 to 10mm" },
  { color: "#ff0000", label: ">10mm (Deficit)" },
];

function oneWeekAgo() {
  const d = new Date("2023-12-01");
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function today() {
  return "2023-12-01";
}
function oneMonthAgo() {
  const d = new Date("2023-12-01");
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function IrrigationPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", province: "Eastern Province", name: "Bugesera" });
  const [startDate, setStartDate] = useState(oneWeekAgo());
  const [endDate, setEndDate] = useState(today());
  const [plantingDate, setPlantingDate] = useState(oneMonthAgo());
  const [cropType, setCropType] = useState("Maize");
  const [activeTab, setActiveTab] = useState("map");
  const [activeLayer, setActiveLayer] = useState("deficit");

  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [layerMode, setLayerMode] = useState<"classified" | "continuous">("classified");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));

  useEffect(() => {
    setCustomClassNames(prev => {
      const def = getDefaultLabels(nClasses);
      return Array.from({ length: nClasses }, (_, i) => prev[i] || def[i]);
    });
  }, [nClasses]);

  const effectiveDistrictName = aoi.name || "Custom Study Area";

  const getReq = () => ({
    aoi, start_date: startDate, end_date: endDate, planting_date: plantingDate, crop_type: cropType, n_classes: nClasses, method, custom_labels: customClassNames
  });

  const mapMutation = useMutation({ 
    mutationFn: async () => api.irrigation.map(getReq()), 
    onSuccess: (res) => {
      setActiveTab("map");
      if (method === "continuous") setLayerMode("continuous"); else setLayerMode("classified");
    }
  });
  const statsMutation = useMutation({ mutationFn: async () => api.irrigation.stats(getReq()) });
  const exportMutation = useMutation({ mutationFn: async () => api.irrigation.export(getReq()) });

  const runAnalysis = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || exportMutation.isPending;
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const exportData = exportMutation.data;
  const anyData = mapData || statsData || exportData;
  const error = mapMutation.error || statsMutation.error || exportMutation.error;

  const palette = (n: number) => {
    const stops = ["#4575b4", "#91bfdb", "#e0f3f8", "#ffffbf", "#fee090", "#fc8d59", "#d73027"];
    if (n <= 1) return ["#fc8d59"];
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

  const isContinuous = method === "continuous";
  const activeNClasses = mapData?.classify?.n_classes || nClasses;
  const activeColors = !isContinuous ? palette(activeNClasses) : CLASS_COLORS;

  const classifiedTileUrl = mapData?.classify?.panels?.[0]?.tile_url || mapData?.tile_url;
  const continuousTileUrl = mapData?.tile_url;
  const activeTileUrl = (layerMode === "classified" && !isContinuous) ? classifiedTileUrl : continuousTileUrl;
  
  const dynamicLegend = useMemo(() => {
    if (isContinuous) return DEFICIT_LEGEND;
    return Array.from({ length: activeNClasses }).map((_, i) => ({
      color: activeColors[i % activeColors.length],
      label: customClassNames[i] || `Class ${i + 1}`
    }));
  }, [isContinuous, activeNClasses, activeColors, customClassNames]);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div>
          <h1 className="text-3xl font-bold">Irrigation Scheduling Advisor</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Calculates irrigation requirements by balancing Crop Evapotranspiration (ETc) against Precipitation.
          </p>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 items-stretch">
        {/* Left Sidebar: Controls */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="pr-4">
          <div className="bg-card border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
            <h3 className="font-semibold text-lg flex items-center border-b p-5 shrink-0 gap-2">
              <Droplet className="w-5 h-5 text-blue-500" />
              Configuration
            </h3>
            
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>Study Area</Label>
                  <StudyAreaSelector value={aoi} onChange={setAoi} />
                </div>

                <div className="space-y-3">
                  <Label>Crop Type</Label>
                  <Select value={cropType} onValueChange={setCropType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CROP_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Planting Date</Label>
                  <input
                    type="date"
                    value={plantingDate}
                    onChange={(e) => setPlantingDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Used to calculate dynamic Crop Coefficient (Kc).</p>
                </div>

                <div className="space-y-3">
                  <Label>Start Date</Label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="space-y-3">
                  <Label>End Date</Label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="space-y-1 mt-4 border-t pt-4">
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
                    <div className="space-y-2 mt-4">
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

                  <div className="space-y-3 bg-muted/40 border rounded-lg p-3 mt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        Rename Classes ({nClasses})
                      </Label>
                      <button
                        type="button"
                        onClick={() => setCustomClassNames(getDefaultLabels(nClasses))}
                        className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </div>

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
                          const preset = DEFICIT_PRESETS[nClasses] || Array.from({ length: nClasses }, (_, i) => `Deficit ${i+1}`);
                          setCustomClassNames(Array.from({ length: nClasses }, (_, i) => preset[i] || `Level ${i+1}`));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border bg-card hover:bg-muted transition-colors font-medium"
                      >
                        Deficit
                      </button>
                    </div>

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
              </div>
            </div>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Analyzing..." : "Calculate Requirement"}
              </Button>
            </div>
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle className="mx-2" />
        
        <ResizablePanel defaultSize={75} className="pl-4">
          <div className="flex flex-col h-full p-2 rounded">
          {error ? (
             <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-red-50 text-red-500 p-6 text-center">
               <Info className="w-10 h-10 mb-4" />
               <p className="text-lg font-bold">Analysis Failed</p>
               <p className="text-sm mt-2">{error.message}</p>
             </div>
          ) : isPending && !anyData ? (
            <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing water balance...</p>
            </div>
          ) : anyData ? (
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="h-full flex flex-col w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="self-start">
                  <TabsTrigger value="map">Irrigation Deficit Map</TabsTrigger>
                  <TabsTrigger value="stats">Advisor & Stats</TabsTrigger>
                  <TabsTrigger value="factors">Factor Maps</TabsTrigger>
                  <TabsTrigger value="static-map">Static Maps</TabsTrigger>
                </TabsList>
              </div>

              {/* Map Tab */}
              <TabsContent value="map" className="flex-1 min-h-[500px] mt-0">
                <div className="bg-card border rounded-lg p-5 shadow-sm h-full flex flex-col">
                  <h3 className="font-semibold text-lg mb-4">
                    Irrigation Deficit (mm) — {effectiveDistrictName}
                  </h3>
                  {mapData ? (
                    <DistrictMap
                      tileUrl={activeTileUrl || mapData.tile_url}
                      center={mapData.center}
                      bbox={mapData.bbox as unknown as number[][]}
                      title="Deficit (mm)"
                      legend={dynamicLegend}
                    />
                  ) : (
          <div className="h-full relative bg-muted/20 border rounded-lg overflow-hidden">
            <DistrictMap aoi={aoi} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <Droplet className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Irrigation</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Select a district and parameters from the sidebar, then run the analysis to visualize results here.
                </p>
                <Button 
                  onClick={() => typeof runAnalysis === 'function' ? runAnalysis() : mapMutation.mutate()} 
                  className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        )}
                </div>
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats" className="flex-1 overflow-y-auto space-y-6 mt-0">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Weekly Advisor</h2>
                  <p className="text-sm text-muted-foreground">Automated SMS/App style notification based on recent water balance.</p>
                </div>
                
                {statsData ? (
                  <>
                    <div className={`p-6 rounded-lg border flex items-start gap-4 ${
                      statsData.status === 'irrigate' ? 'bg-red-500/10 border-red-500/20' :
                      statsData.status === 'monitor' ? 'bg-yellow-500/10 border-yellow-500/20' :
                      'bg-green-500/10 border-green-500/20'
                    }`}>
                      <Info className={`w-8 h-8 mt-1 ${
                        statsData.status === 'irrigate' ? 'text-red-500' :
                        statsData.status === 'monitor' ? 'text-yellow-500' :
                        'text-green-500'
                      }`} />
                      <div>
                        <h4 className={`font-bold text-xl mb-1 ${
                          statsData.status === 'irrigate' ? 'text-red-500' :
                          statsData.status === 'monitor' ? 'text-yellow-500' :
                          'text-green-500'
                        }`}>
                          {statsData.status === 'irrigate' ? 'Action Required' :
                           statsData.status === 'monitor' ? 'Monitor Field' : 'No Action Needed'}
                        </h4>
                        <p className="text-lg text-foreground font-medium">
                          {statsData.recommendation}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-card border rounded p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Crop ET (ETc)</div>
                        <div className="text-2xl font-semibold mt-1">{statsData.mean_etc_mm} mm</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Crop Coefficient (Kc) = {statsData.kc_used}</div>
                      </div>
                      <div className="bg-card border rounded p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Precipitation</div>
                        <div className="text-2xl font-semibold mt-1 text-blue-600">{statsData.mean_precip_mm} mm</div>
                        <div className="text-[10px] text-muted-foreground mt-1">From CHIRPS</div>
                      </div>
                      <div className="bg-card border rounded p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Soil Moisture</div>
                        <div className="text-2xl font-semibold mt-1 text-amber-600">{statsData.mean_sm_mm} mm</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Surface (NASA USDA)</div>
                      </div>
                      <div className="bg-card border rounded p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Net Deficit</div>
                        <div className={`text-2xl font-semibold mt-1 ${statsData.mean_deficit_mm > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {statsData.mean_deficit_mm} mm
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">ETc - Precip</div>
                      </div>
                    </div>

                    <div className="mt-8">
                      <ReportDownloadButton
                        moduleName="Irrigation Scheduling Advisor"
                        aoi={aoi}
                        district={effectiveDistrictName}
                        dateRange={`${startDate} to ${endDate}`}
                        stats={{
                          "Mean Deficit (mm)": statsData.mean_deficit_mm,
                          "Mean ETc (mm)": statsData.mean_etc_mm,
                          "Mean Precipitation (mm)": statsData.mean_precip_mm || 0,
                          "Mean Soil Moisture (mm)": statsData.mean_sm_mm || 0,
                        }}
                        classAreas={{}}
                        extraNotes={`Crop: ${cropType}. Recommendation: ${statsData.recommendation}`}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                )}
              </TabsContent>

              {/* Factor Maps Tab */}
              <TabsContent value="factors" className="flex-1 overflow-y-auto space-y-6 mt-0">
                 <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Factor Maps</h3>
                      <p className="text-sm text-muted-foreground">Individual components of the water balance equation.</p>
                    </div>
                  </div>
                  
                  {mapData && exportData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      
                      {/* ETc Map */}
                      <div className="border rounded-md p-3 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm">Crop ET (ETc)</span>
                        </div>
                        <div className="relative aspect-square bg-slate-100 rounded border overflow-hidden">
                          {exportData.factors.etc?.thumb_url ? (
                            <img src={exportData.factors.etc.thumb_url} className="w-full h-full object-cover" alt="ETc" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data</div>
                          )}
                        </div>
                        {exportData.factors.etc?.download_url && (
                          <div className="mt-2 text-right">
                             <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                              <a href={exportData.factors.etc.download_url} download target="_blank" rel="noreferrer">Download GeoTIFF</a>
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Precip Map */}
                      <div className="border rounded-md p-3 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm">Precipitation</span>
                        </div>
                        <div className="relative aspect-square bg-slate-100 rounded border overflow-hidden">
                          {exportData.factors.precip?.thumb_url ? (
                            <img src={exportData.factors.precip.thumb_url} className="w-full h-full object-cover" alt="Precipitation" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data</div>
                          )}
                        </div>
                        {exportData.factors.precip?.download_url && (
                          <div className="mt-2 text-right">
                             <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                              <a href={exportData.factors.precip.download_url} download target="_blank" rel="noreferrer">Download GeoTIFF</a>
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Soil Moisture Map */}
                      <div className="border rounded-md p-3 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm">Soil Moisture (SSM)</span>
                        </div>
                        <div className="relative aspect-square bg-slate-100 rounded border overflow-hidden">
                          {exportData.factors.sm?.thumb_url ? (
                            <img src={exportData.factors.sm.thumb_url} className="w-full h-full object-cover" alt="Soil Moisture" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data</div>
                          )}
                        </div>
                        {exportData.factors.sm?.download_url && (
                          <div className="mt-2 text-right">
                             <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                              <a href={exportData.factors.sm.download_url} download target="_blank" rel="noreferrer">Download GeoTIFF</a>
                            </Button>
                          </div>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                  )}
                 </div>
              </TabsContent>

              {/* Static Maps Tab */}
              <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4 mt-0">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                  <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
                </div>
                
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Select Map to Export:</span>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Button
                      size="sm"
                      variant={activeLayer === "deficit" ? "default" : "outline"}
                      onClick={() => setActiveLayer("deficit")}
                    >
                      Irrigation Deficit
                    </Button>
                    <Button
                      size="sm"
                      variant={activeLayer === "etc" ? "default" : "outline"}
                      onClick={() => setActiveLayer("etc")}
                    >
                      Crop ET
                    </Button>
                    <Button
                      size="sm"
                      variant={activeLayer === "precip" ? "default" : "outline"}
                      onClick={() => setActiveLayer("precip")}
                    >
                      Precipitation
                    </Button>
                  </div>
                </div>

                {exportData && mapData ? (
                  <div className="bg-card border rounded-lg p-4">
                    <MapExportControls
                      tileUrl={activeLayer === "deficit" ? (activeTileUrl || mapData.tile_url) : mapData.factor_maps?.[activeLayer]?.tile_url || mapData.tile_url}
                      thumbUrl={activeLayer === "deficit" ? exportData.thumb_url : exportData.factors[activeLayer]?.thumb_url}
                      downloadUrl={activeLayer === "deficit" ? exportData.download_url : exportData.factors[activeLayer]?.download_url}
                      district={effectiveDistrictName}
                      title={activeLayer === "deficit" ? "Irrigation Deficit (mm)" : activeLayer === "etc" ? "Crop ET (mm)" : "Precipitation (mm)"}
                      bbox={mapData?.bbox as unknown as number[][]}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                )}
              </TabsContent>

            </Tabs>
          ) : (
            <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                <Droplet className="w-12 h-12 text-blue-300" />
              </div>
              <p className="text-lg font-medium">Ready to run Irrigation Scheduling Analysis</p>
              <p className="text-sm mt-1">Select a study area, crop type, and date range.</p>
            </div>
          )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
