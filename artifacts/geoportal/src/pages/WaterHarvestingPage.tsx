import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Droplet, FileText, Info , Play} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { api, AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";
import { Checkbox } from "@/components/ui/checkbox";

const PRECIP_LEGEND: LegendItem[] = [
  { color: "#f7fbff", label: "0 mm" },
  { color: "#c6dbef", label: "50 mm" },
  { color: "#6baed6", label: "100 mm" },
  { color: "#2171b5", label: "150 mm" },
  { color: "#08306b", label: "200+ mm" },
];

export function WaterHarvestingPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", province: "Kigali City", name: "Gasabo" });
  const [year, setYear] = useState<number>(2023);
  const [runoffCoefficient, setRunoffCoefficient] = useState<number>(0.8);
  const [manualArea, setManualArea] = useState<string>("");
  const [useBuildingFootprint, setUseBuildingFootprint] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState("map");

  const effectiveDistrictName = aoi.name || "Custom Study Area";

  const getReq = () => ({
    aoi, 
    year, 
    runoff_coefficient: runoffCoefficient,
    manual_area_m2: manualArea ? parseFloat(manualArea) : undefined,
    use_building_footprint: useBuildingFootprint
  });

  const mapMutation = useMutation({ mutationFn: async () => api.waterHarvesting.map(getReq()), onSuccess: () => setActiveTab("map") });
  const statsMutation = useMutation({ mutationFn: async () => api.waterHarvesting.stats(getReq()) });
  const exportMutation = useMutation({ mutationFn: async () => api.waterHarvesting.export(getReq()) });

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
          <h1 className="text-3xl font-bold">Household Water Harvesting Calculator</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Estimate the volume of rainwater that can be harvested from a roof footprint and recommend a rainwater tank size.
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
                  <Label>Study Area (Roof / Plot)</Label>
                  <StudyAreaSelector value={aoi} onChange={setAoi} />
                  <p className="text-xs text-muted-foreground">For accurate results, draw a polygon around the roof footprint.</p>
                </div>

                <div className="space-y-3">
                  <Label>Manual Roof Area (m²) (Optional)</Label>
                  <Input 
                    type="number" 
                    value={manualArea}
                    onChange={(e) => setManualArea(e.target.value)}
                    placeholder="e.g. 150"
                  />
                  <p className="text-xs text-muted-foreground">Overrides the drawn polygon's area if provided.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="use-footprint" 
                      checked={useBuildingFootprint} 
                      onCheckedChange={(c) => setUseBuildingFootprint(c === true)} 
                    />
                    <Label htmlFor="use-footprint">Use Real Building Footprints</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calculates actual roof area using Google Open Buildings dataset within your study area.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Year (for historical rainfall)</Label>
                  <Input 
                    type="number" 
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value) || 2023)}
                    min={2000}
                    max={2024}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Runoff Coefficient</Label>
                  <Input 
                    type="number" 
                    value={runoffCoefficient}
                    onChange={(e) => setRunoffCoefficient(parseFloat(e.target.value) || 0.8)}
                    step={0.1}
                    min={0.1}
                    max={1.0}
                  />
                  <p className="text-xs text-muted-foreground">Typical value is 0.8 for corrugated iron or tile roofs.</p>
                </div>
              </div>
            </ScrollArea>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Calculating..." : "Calculate Harvesting"}
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
              <p>Calculating rainwater harvesting potential...</p>
            </div>
          ) : anyData ? (
            <div className="bg-card border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
                <div className="border-b px-4 py-2 shrink-0 flex items-center justify-between bg-slate-50/50">
                  <TabsList>
                    <TabsTrigger value="map">Map View</TabsTrigger>
                    <TabsTrigger value="static-map">Static Map</TabsTrigger>
                    <TabsTrigger value="report">Report</TabsTrigger>
                  </TabsList>
                  
                  {exportData && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={exportData.download_url} target="_blank" rel="noreferrer">
                        Download TIFF
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <TabsContent value="map" className="h-full w-full m-0 data-[state=active]:flex flex-col">
                    {mapData ? (
                      <div className="flex-1 relative bg-slate-100">
                        <DistrictMap
                          tileUrl={mapData.tile_url}
                          center={mapData.center}
                          bbox={mapData.bbox as unknown as number[][]}
                          title="Monthly Avg Precipitation (mm)"
                          legend={PRECIP_LEGEND}
                        />
                      </div>
                    ) : (
          <div className="h-full relative bg-muted/20 border rounded-lg overflow-hidden">
            <DistrictMap aoi={aoi} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <Droplet className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">WaterHarvesting</h3>
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
                  </TabsContent>

                  <TabsContent value="static-map" className="h-full w-full m-0 p-6 overflow-y-auto">
                    <div className="max-w-4xl mx-auto space-y-4">
                      <div>
                        <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                        <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
                      </div>
                      {mapData ? (
                        <div className="bg-card border rounded-lg p-4">
                          <MapExportControls
                            district={effectiveDistrictName}
                            title="Average Monthly Precipitation (mm)"
                            tileUrl={mapData.tile_url}
                            thumbUrl={mapData.thumb_url}
                            legend={PRECIP_LEGEND}
                          />
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-sm">Map data unavailable</div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="report" className="h-full w-full m-0 p-6 overflow-y-auto">
                    {statsData ? (
                      <div className="max-w-4xl mx-auto space-y-8">
                        <div className="text-center space-y-2 mb-8">
                          <h2 className="text-2xl font-bold">Rainwater Harvesting Report</h2>
                          <p className="text-muted-foreground">Study Area: {effectiveDistrictName} | Year: {year}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                            <p className="text-sm text-blue-600 font-medium mb-1">Roof Area</p>
                            <p className="text-2xl font-bold text-blue-900">{statsData.area_m2} m²</p>
                          </div>
                          <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-100">
                            <p className="text-sm text-indigo-600 font-medium mb-1">Avg Rainfall</p>
                            <p className="text-2xl font-bold text-indigo-900">{statsData.avg_monthly_precip_mm} mm/month</p>
                          </div>
                          <div className="p-4 rounded-lg bg-teal-50 border border-teal-100">
                            <p className="text-sm text-teal-600 font-medium mb-1">Monthly Harvest</p>
                            <p className="text-2xl font-bold text-teal-900">{statsData.monthly_volume_liters.toLocaleString()} Liters</p>
                          </div>
                          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 shadow-sm relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-200 rounded-full opacity-50" />
                            <p className="text-sm text-emerald-700 font-medium mb-1">Recommended Tank</p>
                            <p className="text-2xl font-bold text-emerald-900">{statsData.recommended_tank_liters.toLocaleString()} L</p>
                          </div>
                        </div>

                        <div className="bg-white border rounded-lg p-6 shadow-sm">
                          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            Calculation Details
                          </h3>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b">
                              <span className="text-muted-foreground">Runoff Coefficient Used</span>
                              <span className="font-medium">{statsData.runoff_coefficient}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                              <span className="text-muted-foreground">Annual Harvest Potential</span>
                              <span className="font-medium">{(statsData.monthly_volume_liters * 12).toLocaleString()} Liters</span>
                            </div>
                            <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md">
                              <strong>Formula:</strong> Volume (L) = Area (m²) × Rainfall (mm) × Runoff Coefficient
                              <br/>
                              <em>Note: 1 mm of rainfall over 1 square meter is equal to 1 liter of water. The recommended tank size is an approximation assuming the tank must hold at least one average month's worth of rainfall.</em>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Report data unavailable</div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          ) : (
            <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <Droplet className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-500">Ready to calculate</p>
              <p className="text-sm">Select an area and click Calculate to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
