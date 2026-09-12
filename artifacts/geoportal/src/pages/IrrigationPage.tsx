import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Droplet, FileText, Info , Play} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, IrrigationMapResult, IrrigationStatsResult, IrrigationExportResult, AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";

const CROP_TYPES = ["Maize", "Beans", "Potatoes", "Rice", "Coffee", "Tea", "Generic"];

const DEFICIT_LEGEND: LegendItem[] = [
  { color: "#0000ff", label: "<-10mm (Surplus)" },
  { color: "#a3ccff", label: "-10 to 0mm" },
  { color: "#ffffff", label: "0mm (Balanced)" },
  { color: "#ff9999", label: "0 to 10mm" },
  { color: "#ff0000", label: ">10mm (Deficit)" },
];

function oneWeekAgo() {
  const d = new Date("2023-12-01"); // Fixed historical date for demo due to MODIS latency
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function today() {
  return "2023-12-01"; // Fixed historical date
}

export function IrrigationPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", province: "Eastern Province", name: "Bugesera" });
  const [startDate, setStartDate] = useState(oneWeekAgo());
  const [endDate, setEndDate] = useState(today());
  const [cropType, setCropType] = useState("Maize");
  const [activeTab, setActiveTab] = useState("map");
  const [activeLayer, setActiveLayer] = useState("deficit");

  const effectiveDistrictName = aoi.name || "Custom Study Area";

  const getReq = () => ({
    aoi, start_date: startDate, end_date: endDate, crop_type: cropType
  });

  const mapMutation = useMutation({ mutationFn: async () => api.irrigation.map(getReq()), onSuccess: () => setActiveTab("map") });
  const statsMutation = useMutation({ mutationFn: async () => api.irrigation.stats(getReq()) });
  const exportMutation = useMutation({ mutationFn: async () => api.irrigation.export(getReq()) });

  const runAnalysis = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || exportMutation.isPending;
  const anyData = mapMutation.data || statsMutation.data || exportMutation.data;
  
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  const exportData = exportMutation.data;
  
  const error = mapMutation.error || statsMutation.error || exportMutation.error;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Irrigation Scheduling Advisor</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Calculates irrigation requirements by balancing Crop Evapotranspiration (ETc) against Precipitation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg shadow-sm flex flex-col h-[calc(100vh-140px)] sticky top-20">
            <h3 className="font-semibold text-lg flex items-center border-b p-5 shrink-0 gap-2">
              <Droplet className="w-5 h-5 text-blue-500" />
              Configuration
            </h3>
            
            <ScrollArea className="flex-1 px-5 py-4">
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
                  <p className="text-xs text-muted-foreground">Adjusts the Crop Coefficient (Kc) for ET calculations.</p>
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
              </div>
            </ScrollArea>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Analyzing..." : "Calculate Requirement"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="lg:col-span-3 flex flex-col h-[calc(100vh-140px)] sticky top-20">
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
                      tileUrl={mapData.tile_url}
                      center={mapData.center}
                      bbox={mapData.bbox as unknown as number[][]}
                      title="Deficit (mm)"
                      legend={DEFICIT_LEGEND}
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
                  onClick={() => typeof runAnalysis === 'function' ? runAnalysis() : mutate()} 
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
                    <div className={`p-6 rounded-lg border-2 flex items-start gap-4 ${
                      statsData.status === 'irrigate' ? 'bg-red-50 border-red-200' :
                      statsData.status === 'monitor' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                      <Info className={`w-8 h-8 mt-1 ${
                        statsData.status === 'irrigate' ? 'text-red-500' :
                        statsData.status === 'monitor' ? 'text-yellow-500' :
                        'text-green-500'
                      }`} />
                      <div>
                        <h4 className="font-bold text-xl mb-1">
                          {statsData.status === 'irrigate' ? 'Action Required' :
                           statsData.status === 'monitor' ? 'Monitor Field' : 'No Action Needed'}
                        </h4>
                        <p className="text-lg text-slate-700 font-medium">
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
                      tileUrl={activeLayer === "deficit" ? mapData.tile_url : mapData.factor_maps?.[activeLayer]?.tile_url || mapData.tile_url}
                      thumbUrl={activeLayer === "deficit" ? exportData.thumb_url : exportData.factors[activeLayer]?.thumb_url}
                      downloadUrl={activeLayer === "deficit" ? exportData.download_url : exportData.factors[activeLayer]?.download_url}
                      district={effectiveDistrictName}
                      title={activeLayer === "deficit" ? "Irrigation Deficit (mm)" : activeLayer === "etc" ? "Crop ET (mm)" : "Precipitation (mm)"}
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
      </div>
    </div>
  );
}
