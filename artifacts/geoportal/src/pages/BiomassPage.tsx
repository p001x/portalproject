import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Flame, Loader2, Info , Play} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ImageIcon, FileText, Printer, Map as MapIcon } from "lucide-react";
import { useEffect } from "react";

const RISK_LEGEND: LegendItem[] = [
  { color: "#ff0000", label: "High Risk (>75)" },
  { color: "#ffff00", label: "Moderate Risk (50-75)" },
  { color: "#00ff00", label: "Low Risk (25-50)" },
  { color: "#0000ff", label: "Minimal Risk (<25)" },
];

const CLASS_COLOR_LIST = ["#ff0000", "#ffff00", "#00ff00", "#0000ff"].reverse();

const PALETTES = [
  { name: "Default", value: "default" },
  { name: "Viridis (Perceptually Uniform)", value: "440154,3b528b,21908d,5dc963,fde725" },
  { name: "Magma (High Contrast)", value: "000004,3b0f70,8c2981,de4968,fe9f6d,fcfdbf" },
  { name: "Inferno (Vibrant)", value: "000004,420a68,932667,dd513a,fca50a,fcffa4" },
  { name: "Plasma (Bright)", value: "0d0887,5a01a5,9c179e,cc4678,ed7953,fdb32f,f0f921" },
  { name: "Terrain (Earth Tones)", value: "006600,33cc33,cccc00,cc9900,996600,663300" },
  { name: "Blues", value: "f7fbff,deebf7,c6dbef,9ecae1,6baed6,4292c6,2171b5,08519c,08306b" },
  { name: "Grayscale", value: "000000,ffffff" },
];

function SmallNorthArrow() {
  return (
    <div className="bg-background/90 backdrop-blur rounded shadow-sm p-1 flex flex-col items-center">
      <div className="text-[10px] font-bold leading-none mb-0.5 text-slate-700">N</div>
      <svg width="12" height="16" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0L24 32L12 24L0 32L12 0Z" fill="currentColor" className="text-slate-800" />
      </svg>
    </div>
  );
}

function InteractiveFactorMapCard({ factorKey, factor, aoiConfig, bufferKm, yearStart, yearEnd }: { factorKey: string; factor: any; aoiConfig: AOIConfig; bufferKm: number; yearStart: number; yearEnd: number; }) {
  const [selectedPalette, setSelectedPalette] = useState("default");
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<{ thumb_url: string; download_url: string | null }>({
    thumb_url: factor.thumb_url,
    download_url: null,
  });

  const generateExport = async () => {
    try {
      setLoading(true);
      const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
      const res = await api.biomass.factorExport({
        aoi: aoiConfig,
        factor_key: factorKey,
        palette: paletteParam,
        buffer_km: bufferKm,
        start_year: aoi.start_year || 1980,
        end_year: aoi.end_year || 2024
      });
      setUrls(res.data);
    } catch (err) {
      console.error("Failed to generate export", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPalette !== "default") {
      generateExport();
    } else {
      setUrls({ thumb_url: factor.thumb_url, download_url: null });
    }
  }, [selectedPalette]);

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm flex flex-col">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.title || factor.label}</h4>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : null}
          {/*<div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
            <DistrictMap aoi={aoi} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <Flame className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Biomass Tracking</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Select a district and parameters from the sidebar, then run the analysis to visualize results here.
                </p>
                <Button 
                  onClick={runAnalysis} 
                  className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        )}*/}
        <img src={urls.thumb_url} alt={factor.title || factor.label} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300" />
      </div>

      <div className="space-y-3 pt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-500">Color Palette</Label>
          <Select value={selectedPalette} onValueChange={setSelectedPalette} disabled={loading}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={() => {
              const link = document.createElement('a');
              link.href = urls.thumb_url;
              link.download = `biomass_${factorKey}_classified.png`;
              link.click();
            }}
          >
            <ImageIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Classified
          </Button>
          
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={async () => {
              if (urls.download_url) {
                window.open(urls.download_url, '_blank');
              } else {
                await generateExport();
                const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
                api.biomass.factorExport({
                  aoi: aoiConfig,
                  factor_key: factorKey,
                  palette: paletteParam,
                  buffer_km: bufferKm,
                  start_year: aoi.start_year || 1980,
                  end_year: aoi.end_year || 2024
                }).then(res => {
                  window.open(res.data.download_url, '_blank');
                });
              }
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Raw
          </Button>
        </div>
      </div>
    </div>
  );
}

function StaticMapCard({ factorKey, factor, analysisDate }: { factorKey: string; factor: any; analysisDate: string; }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.title || factor.label}</h4>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group">
        <img src={factor.thumb_url} alt={factor.title || factor.label} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300" />
        
        <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded pointer-events-none"></div>

        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur shadow-sm p-1.5 rounded text-[10px] uppercase font-bold text-slate-700 tracking-wider">
          Score Map
        </div>
        <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur shadow-sm p-1.5 rounded text-[9px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-1">
          <span className="text-slate-400">Scale:</span> 1 : 100,000
        </div>
        <div className="absolute bottom-2 right-2 drop-shadow-md">
          <SmallNorthArrow />
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <div className="w-16 h-2 rounded-sm bg-gradient-to-r from-[#0000ff] via-[#00ff00] to-[#ff0000]" />
          Low â†’ High Risk
        </span>
        <span className="text-[10px] uppercase">{analysisDate}</span>
      </div>
    </div>
  );
}

export function BiomassPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  const [bufferKm, setBufferKm] = useState(3.0);
  const [activeTab, setActiveTab] = useState("map");

  const effectiveDistrictName = aoi.type === "district" ? aoi.name : "Custom Area";

  const getReq = () => ({
    aoi,
    buffer_km: bufferKm,
    start_year: aoi.start_year || 1980,
    end_year: aoi.end_year || 2024,
  });

  const mapMutation = useMutation({
    mutationFn: async () => api.biomass.map(getReq()),
    onSuccess: () => setActiveTab("map"),
  });
  
  const statsMutation = useMutation({
    mutationFn: async () => api.biomass.stats(getReq()),
  });
  const classifyMutation = useMutation({ mutationFn: async () => api.biomass.classify(getReq()) });
  const exportMutation = useMutation({ mutationFn: async () => api.biomass.export(getReq()) });

  const runAnalysis = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending;
  
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const classifyData = classifyMutation.data;
  const exportData = exportMutation.data;

  const anyData = (mapData && statsData && classifyData && exportData) ? {
    ...mapData,
    ...statsData,
    class_areas_km2: classifyData.panels?.[0]?.areas || {},
    ...classifyData,
    ...exportData
  } : null;
  
  const error = mapMutation.error || statsMutation.error || classifyMutation.error || exportMutation.error;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* Sidebar */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full w-full md:border-b md:border-b-0 md:border-r bg-card flex flex-col gap-5 p-5 md:overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-lg">
            <Flame className="w-5 h-5" />
            Biomass Tracker
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Monitor forest cover change and analyze biomass depletion risk zones.
          </p>

          <StudyAreaSelector value={aoi} onChange={setAoi} />

          <div className="space-y-1">
            <Label>Analysis Buffer (km)</Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              Search radius from settlements to detect extraction activity.
            </p>
            <div className="flex justify-between items-center p-2 rounded-lg border bg-muted/30 text-sm">
              <span className="font-medium text-muted-foreground">Radius</span>
              <span className="font-bold text-primary">{bufferKm} km</span>
            </div>
            <Slider value={[bufferKm]} min={1} max={10} step={0.5} onValueChange={(v) => setBufferKm(v[0])} className="py-4" />
          </div>

          <div className="mt-auto pt-4 flex gap-2">
            <Button onClick={runAnalysis} disabled={isPending} className="w-full gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isPending ? "Processing..." : "Generate Analysis"}
            </Button>
          </div>
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        <div className="h-full flex flex-col relative bg-muted/10">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center text-destructive p-8 text-center">
              <Info className="w-10 h-10 mb-4" />
              <p className="text-lg font-semibold mb-2">Analysis Failed</p>
              <p className="text-sm opacity-80 max-w-md">{error.message}</p>
            </div>
          ) : isPending && !anyData ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium text-muted-foreground">Running Analysis in Earth Engine...</p>
            </div>
          ) : anyData ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="border-b px-4 py-2 bg-background flex items-center justify-between shrink-0">
                <TabsList className="bg-muted">
                  <TabsTrigger value="map">Risk Map</TabsTrigger>
                  <TabsTrigger value="statistics">Dashboard</TabsTrigger>
                  <TabsTrigger value="factors">Factors</TabsTrigger>
                  <TabsTrigger value="static-maps">Static Maps</TabsTrigger>
                  <TabsTrigger value="report">Report</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Data Ready
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <TabsContent value="map" className="h-full w-full m-0 p-0 border-0 data-[state=active]:flex flex-col">
                  <div className="flex-1 relative">
                    <DistrictMap
                      tileUrl={mapData.tile_url}
                      center={mapData.center}
                      bbox={mapData.bbox}
                      title="Biomass Depletion Risk"
                      legend={RISK_LEGEND}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="statistics" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-5xl mx-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Total Standing Biomass</div>
                        <div className="text-2xl font-bold">{statsData.stats["Total Standing Biomass (Tonnes)"]?.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Tonnes</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Mean Depletion Risk</div>
                        <div className="text-2xl font-bold text-orange-500">{statsData.stats["Mean Depletion Risk"]}</div>
                        <div className="text-xs text-muted-foreground mt-1">/ 100 average risk score</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Estimated Biomass Lost</div>
                        <div className="text-2xl font-bold text-red-500">{statsData.stats["Estimated Biomass Lost (Tonnes)"]?.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Tonnes recently depleted</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Depletion Runway</div>
                        <div className="text-2xl font-bold">{statsData.stats["Depletion Runway (Years)"] === 999 ? "∞" : statsData.stats["Depletion Runway (Years)"]}</div>
                        <div className="text-xs text-muted-foreground mt-1">Years</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 bg-card rounded-xl border p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-6">Commercial Energy Balance</h3>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 border-muted relative">
                            <span className={`text-sm font-bold text-center px-2 ${statsData.stats["Commercial Energy Status"]?.includes('CRITICAL') ? 'text-destructive' : statsData.stats["Commercial Energy Status"] === 'SUSTAINABLE SURPLUS' ? 'text-emerald-500' : 'text-orange-500'}`}>
                              {statsData.stats["Commercial Energy Status"]}
                            </span>
                          </div>
                          
                          <div className="flex-1 w-full space-y-4">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">Annual Fuelwood Demand</span>
                                <span className="text-muted-foreground">{statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"]?.toLocaleString()} T/yr</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, (statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"] / Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"])) * 100)}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">Sustainable Annual Yield</span>
                                <span className="text-muted-foreground">{statsData.stats["Sustainable Annual Yield (Tonnes/yr)"]?.toLocaleString()} T/yr</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (statsData.stats["Sustainable Annual Yield (Tonnes/yr)"] / Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"])) * 100)}%` }} />
                              </div>
                            </div>
                            <div className="pt-4 border-t flex justify-between items-center">
                              <span className="text-sm font-medium">Net Biomass Deficit</span>
                              <span className="text-lg font-bold">{statsData.stats["Net Biomass Deficit (Tonnes/yr)"]?.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">T/yr</span></span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-card rounded-xl border p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-6">Risk Distribution</h3>
                        <div className="space-y-4">
                          {Object.entries(anyData.class_areas_km2).map(([cls, area], i) => {
                            const total = Object.values(anyData.class_areas_km2).reduce((a, b) => (a as number) + (b as number), 0) as number;
                            const pct = total > 0 ? ((area as number) / total) * 100 : 0;
                            return (
                              <div key={cls} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{cls}</span>
                                  <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CLASS_COLOR_LIST[i] }} />
                                </div>
                                <div className="text-[10px] text-muted-foreground text-right">{(area as number).toFixed(1)} km²</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="factors" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-6xl mx-auto">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold">Biomass Depletion Factors</h2>
                      <p className="text-sm text-muted-foreground mt-1">Preview, customize, and export individual factor maps.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                        <InteractiveFactorMapCard 
                          key={key} 
                          factorKey={key} 
                          factor={factor} 
                          aoiConfig={aoi}
                          bufferKm={bufferKm}
                          yearStart={aoi.start_year || 1980}
                          yearEnd={aoi.end_year || 2024}
                        />
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="static-maps" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-6xl mx-auto">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold">Static Maps</h2>
                      <p className="text-sm text-muted-foreground mt-1">Print-ready static maps with scalebars and legends.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="border rounded-xl p-4 space-y-4 bg-card shadow-sm">
                        <h4 className="font-semibold text-sm">Final Depletion Risk Map</h4>
                        <div className="relative border rounded-lg bg-muted/20 aspect-square overflow-hidden">
                          <img src={mapData?.thumb_url} alt="Final Map" className="w-full h-full object-cover" />
                          <div className="absolute bottom-3 right-3 drop-shadow-md">
                            <SmallNorthArrow />
                          </div>
                        </div>
                      </div>
                      {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                        <StaticMapCard 
                          key={key} 
                          factorKey={key} 
                          factor={factor} 
                          analysisDate={new Date().toLocaleDateString()}
                        />
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="report" className="h-full w-full m-0 p-6 overflow-y-auto flex items-center justify-center">
                  <div className="max-w-xl w-full">
                    <div className="bg-card border rounded-2xl p-10 shadow-sm text-center space-y-6">
                      <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="font-bold text-2xl">Biomass Depletion Report</h2>
                        <p className="text-muted-foreground font-medium mt-2">{effectiveDistrictName}</p>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-4">
                          Download a comprehensive PDF report including all statistics, class area breakdowns, and high-resolution maps.
                        </p>
                      </div>
                      
                      <div className="pt-4 flex justify-center">
                        <ReportDownloadButton 
                          aoi={aoi}
                          moduleName="Firewood/Biomass Depletion Tracker"
                          dateRange="2019 - 2023"
                          stats={statsData?.stats || {}}
                          classAreas={anyData?.class_areas_km2 || {}}
                          district={effectiveDistrictName}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
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
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
