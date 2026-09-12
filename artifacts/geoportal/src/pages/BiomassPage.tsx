import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Flame, Loader2, Info , Play} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
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
    <div className="bg-white/90 backdrop-blur rounded shadow-sm p-1 flex flex-col items-center">
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
        year_start: yearStart,
        year_end: yearEnd
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
    <div className="border rounded-lg p-4 space-y-4 bg-white shadow-sm flex flex-col">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.title || factor.label}</h4>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
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
        )}
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
                  year_start: yearStart,
                  year_end: yearEnd
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

        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur shadow-sm p-1.5 rounded text-[10px] uppercase font-bold text-slate-700 tracking-wider">
          Score Map
        </div>
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur shadow-sm p-1.5 rounded text-[9px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-1">
          <span className="text-slate-400">Scale:</span> 1 : 100,000
        </div>
        <div className="absolute bottom-2 right-2 drop-shadow-md">
          <SmallNorthArrow />
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <div className="w-16 h-2 rounded-sm bg-gradient-to-r from-[#0000ff] via-[#00ff00] to-[#ff0000]" />
          Low → High Risk
        </span>
        <span className="text-[10px] uppercase">{analysisDate}</span>
      </div>
    </div>
  );
}

export function BiomassPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "district", name: "GICUMBI" });
  const [bufferKm, setBufferKm] = useState(3.0);
  const [activeTab, setActiveTab] = useState("map");

  const effectiveDistrictName = aoi.type === "district" ? aoi.name : "Custom Area";

  const getReq = () => ({
    aoi,
    buffer_km: bufferKm,
    year_start: 2019,
    year_end: 2023,
  });

  const mapMutation = useMutation({
    mutationFn: async () => api.biomass.map(getReq()),
    onSuccess: () => setActiveTab("map"),
  });
  
  const statsMutation = useMutation({
    mutationFn: async () => api.biomass.stats(getReq()),
  });

  const runAnalysis = () => {
    mapMutation.mutate();
    statsMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending;
  const anyData = mapMutation.data || statsMutation.data;
  
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const error = mapMutation.error || statsMutation.error;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Flame className="w-8 h-8 text-orange-500" />
            Firewood/Biomass Depletion Tracker
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Monitors forest cover change over time near settlements to flag areas at risk of biomass/firewood scarcity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg shadow-sm flex flex-col h-[calc(100vh-170px)] sticky top-20">
            <h3 className="font-semibold text-lg flex items-center border-b p-5 shrink-0 gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Configuration
            </h3>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              <div className="space-y-3">
                <StudyAreaSelector value={aoi} onChange={setAoi} />
                <p className="text-xs text-muted-foreground">Select an area to scan for biomass depletion.</p>
              </div>

              <div className="space-y-4 pt-2 border-t">
                <div>
                  <h4 className="font-medium text-sm">Settlement Proximity Buffer (km)</h4>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Distance from populated areas (WorldPop &gt; 10 people/100m) to search for forest degradation.
                  </p>
                </div>
                
                <div className="space-y-2 bg-slate-50/50 p-3 rounded-md border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <Label className="text-sm font-medium">Gathering Distance</Label>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                      {bufferKm} km
                    </span>
                  </div>
                  <Slider
                    value={[bufferKm]}
                    min={1}
                    max={10}
                    step={0.5}
                    onValueChange={(v) => setBufferKm(v[0])}
                    className="py-1"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base bg-orange-600 hover:bg-orange-700">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Calculating..." : "Run Tracker"}
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col h-[calc(100vh-170px)] sticky top-20">
          {error ? (
             <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-red-50 text-red-500 p-6 text-center">
               <Info className="w-10 h-10 mb-4" />
               <p className="text-lg font-bold">Analysis Failed</p>
               <p className="text-sm mt-2">{error.message}</p>
             </div>
          ) : isPending && !anyData ? (
            <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing Sentinel-2 NDVI trends and Hansen Forest Cover...</p>
            </div>
          ) : anyData ? (
            <div className="bg-card border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
                <div className="border-b px-4 py-2 shrink-0 flex items-center justify-between bg-slate-50/50">
                  <TabsList>
                    <TabsTrigger value="map">Risk Map</TabsTrigger>
                    <TabsTrigger value="factors">Factors</TabsTrigger>
                    <TabsTrigger value="statistics">Statistics</TabsTrigger>
                    <TabsTrigger value="static-maps">Static Maps</TabsTrigger>
                    <TabsTrigger value="report">Report</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <TabsContent value="map" className="h-full w-full m-0 data-[state=active]:flex flex-col">
                    {mapData ? (
                      <div className="flex-1 relative bg-slate-100">
                        <DistrictMap
                          tileUrl={mapData.tile_url}
                          center={mapData.center}
                          bbox={mapData.bbox}
                          title="Biomass Depletion Risk (0-100)"
                          legend={RISK_LEGEND}
                        />
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Map data unavailable</div>
                    )}
                  </TabsContent>

                  <TabsContent value="statistics" className="h-full w-full m-0 p-6 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-5xl mx-auto space-y-8">
                      {statsData && mapData && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                              Risk Distribution (km²)
                            </h3>
                            <div className="space-y-3">
                              {Object.entries(statsData.class_areas_km2).map(([cls, area]: [string, any], i) => {
                                const total = Object.values(statsData.class_areas_km2).reduce((a: any, b: any) => a + b, 0) as number;
                                const pct = total > 0 ? (area / total) * 100 : 0;
                                return (
                                  <div key={cls} className="space-y-1.5">
                                    <div className="flex justify-between text-sm">
                                      <span className="font-medium text-slate-700">{cls}</span>
                                      <span className="text-muted-foreground">{area.toFixed(1)} km² ({pct.toFixed(1)}%)</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div 
                                        className="h-full rounded-full transition-all duration-1000 ease-out" 
                                        style={{ width: `${pct}%`, backgroundColor: CLASS_COLOR_LIST[i] }} 
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 rounded-lg p-6 border flex flex-col justify-center">
                            <p className="text-sm text-slate-600 mb-2">Mean Depletion Risk (Forested Areas)</p>
                            <div className="text-4xl font-bold text-slate-800">
                              {statsData.stats["Mean Depletion Risk"]}<span className="text-lg text-slate-400 font-normal ml-1">/ 100</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200/60 text-sm text-muted-foreground leading-relaxed">
                              This score reflects the average forest degradation and proximity to population centers within the AOI. Areas over 75 indicate critical loss of biomass that may impact local communities.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="factors" className="h-full w-full m-0 p-6 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-6xl mx-auto space-y-6">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-800">Biomass Depletion Factors</h2>
                        <p className="text-muted-foreground">Preview, customize, and export individual factor maps that contributed to the final risk assessment.</p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                        {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                          <InteractiveFactorMapCard 
                            key={key} 
                            factorKey={key} 
                            factor={factor} 
                            aoiConfig={aoi}
                            bufferKm={bufferKm}
                            yearStart={2019}
                            yearEnd={2023}
                          />
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="static-maps" className="h-full w-full m-0 p-6 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-6xl mx-auto space-y-6">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-800">Static Maps</h2>
                        <p className="text-muted-foreground">Print-ready static maps for reports and presentations.</p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="border rounded-lg p-4 space-y-3 bg-white">
                          <h4 className="font-semibold text-base leading-tight">Final Depletion Risk Map</h4>
                          <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden">
                            <img src={mapData?.thumb_url} alt="Final Map" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded pointer-events-none"></div>
                            <div className="absolute bottom-2 right-2 drop-shadow-md">
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

                  <TabsContent value="report" className="h-full w-full m-0 p-6 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-3xl mx-auto space-y-6">
                      <div className="bg-white border rounded-xl p-8 shadow-sm text-center space-y-4">
                        <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                          <FileText className="w-8 h-8" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-2xl mb-2">Biomass Depletion Report — {effectiveDistrictName}</h2>
                          <p className="text-muted-foreground">
                            Download a full PDF report including statistics, class areas, and classification maps.
                          </p>
                        </div>
                        
                        <div className="pt-4 flex justify-center">
                          <ReportDownloadButton 
                            aoi={aoi}
                            moduleName="Firewood/Biomass Depletion Tracker"
                            dateRange="2019 - 2023"
                            stats={statsData?.stats || {}}
                            classAreas={statsData?.class_areas_km2 || {}}
                            district={effectiveDistrictName}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
