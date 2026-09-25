import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Droplet, FileText, Info , Play} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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
  const [runoffCoefficient, setRunoffCoefficient] = useState<number>(0.85);
  const [manualArea, setManualArea] = useState<string>("");
  const [useBuildingFootprint, setUseBuildingFootprint] = useState<boolean>(false);
  const [householdSize, setHouseholdSize] = useState<number>(5);
  const [dailyWaterUse, setDailyWaterUse] = useState<number>(50);
  const [activeTab, setActiveTab] = useState("map");

  const effectiveDistrictName = aoi.name || "Custom Study Area";

  const getReq = () => ({
    aoi, 
    year, 
    runoff_coefficient: runoffCoefficient,
    manual_area_m2: manualArea ? parseFloat(manualArea) : undefined,
    use_building_footprint: useBuildingFootprint,
    household_size: householdSize,
    daily_water_use_liters: dailyWaterUse
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
    <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-80px)] items-stretch">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full w-full md:border-b md:border-b-0 md:border-r bg-card flex flex-col gap-5 p-5 md:overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-lg">
            <Droplet className="w-5 h-5" />
            Water Harvesting
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Estimate the volume of rainwater that can be harvested from a roof footprint and recommend a rainwater tank size.
          </p>

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
              <Label>Roof Material</Label>
              <Select
                value={runoffCoefficient.toString()}
                onValueChange={(v) => setRunoffCoefficient(parseFloat(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select roof material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.85">Corrugated Iron / Metal (0.85)</SelectItem>
                  <SelectItem value="0.8">Concrete / Tile (0.80)</SelectItem>
                  <SelectItem value="0.7">Asphalt Roof (0.70)</SelectItem>
                  <SelectItem value="0.2">Thatch / Dirt (0.20)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>Household Size</Label>
                <Input 
                  type="number" 
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(parseInt(e.target.value) || 1)}
                  min={1}
                />
              </div>
              <div className="space-y-3">
                <Label>Liters per Day</Label>
                <Input 
                  type="number" 
                  value={dailyWaterUse}
                  onChange={(e) => setDailyWaterUse(parseInt(e.target.value) || 1)}
                  min={1}
                />
              </div>
            </div>
          </div>

          <Button onClick={runAnalysis} disabled={isPending} className="w-full gap-2 mt-4">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isPending ? "Calculating..." : "Calculate Harvesting"}
          </Button>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2 mt-2">
              {error.message}
            </p>
          )}
        </aside>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* ── Results ──────────────────────────────────────────────── */}
      <ResizablePanel defaultSize={75}>
        <main className="h-full flex flex-col flex-1 md:overflow-y-auto p-4 md:p-6 bg-background">
          {!anyData && !isPending && (
            <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
              <DistrictMap aoi={aoi} basemap="satellite" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
                <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                    <Droplet className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">Analysis Configuration</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Select a study area and parameters from the sidebar, then click run to visualize the results here.
                  </p>
                  <Button 
                    onClick={runAnalysis} 
                    className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all pointer-events-auto"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Run Analysis
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isPending && !anyData && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p>Calculating rainwater harvesting potential...</p>
            </div>
          )}

          {anyData && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="mb-4 self-start">
                <TabsTrigger value="map">Map View</TabsTrigger>
                <TabsTrigger value="static-map">Static Map</TabsTrigger>
                <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
              </TabsList>

              <TabsContent value="map" className="flex-1 min-h-[500px] flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Map Options:</span>
                  </div>
                  {exportData && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={exportData.download_url} target="_blank" rel="noreferrer">
                        Download TIFF
                      </a>
                    </Button>
                  )}
                </div>

                <div className="h-[520px] rounded-lg overflow-hidden border relative">
                  {mapData ? (
                    <DistrictMap
                      tileUrl={mapData.tile_url}
                      center={mapData.center}
                      bbox={mapData.bbox as unknown as number[][]}
                      title="Monthly Avg Precipitation (mm)"
                      legend={PRECIP_LEGEND}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">Map data unavailable</div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
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
              </TabsContent>

              <TabsContent value="report" className="space-y-6">
                {statsData ? (
                  <>
                    <div>
                      <h2 className="font-semibold text-lg mb-1">Rainwater Harvesting Report — {effectiveDistrictName}</h2>
                      <p className="text-sm text-muted-foreground">
                        Download a full PDF report including statistics, potential yield, and simulation data.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100/50">
                        <p className="text-sm text-blue-600 font-medium mb-1">Total Annual Harvest</p>
                        <p className="text-2xl font-bold text-blue-900">{statsData.annual_volume_liters.toLocaleString()} L</p>
                      </div>
                      <div className="p-4 rounded-lg bg-orange-50/50 border border-orange-100/50">
                        <p className="text-sm text-orange-600 font-medium mb-1">Annual Demand</p>
                        <p className="text-2xl font-bold text-orange-900">{statsData.annual_demand_liters.toLocaleString()} L</p>
                      </div>
                      <div className="p-4 rounded-lg bg-purple-50/50 border border-purple-100/50">
                        <p className="text-sm text-purple-600 font-medium mb-1">Dry Season Reliability</p>
                        <p className="text-2xl font-bold text-purple-900">{statsData.months_of_autonomy}/12 Months</p>
                      </div>
                      <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-200 rounded-full opacity-50" />
                        <p className="text-sm text-emerald-700 font-medium mb-1">Recommended Tank</p>
                        <p className="text-2xl font-bold text-emerald-900">{statsData.recommended_tank_liters.toLocaleString()} L</p>
                      </div>
                    </div>

                    <div className="bg-card border rounded-lg p-5 space-y-4">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        Simulation Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Roof Area Used</span>
                          <span className="font-medium">{statsData.area_m2} m²</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Annual Rainfall</span>
                          <span className="font-medium">{statsData.annual_precip_mm} mm</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Runoff Coefficient</span>
                          <span className="font-medium">{statsData.runoff_coefficient}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Annual Demand Met</span>
                          <span className="font-medium">{statsData.demand_met_percent}%</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                        <strong>Methodology:</strong> A 12-month water balance simulation attempts to find the minimum standard tank size that captures enough wet-season runoff to ensure the household never runs out of water during the dry season.
                      </div>
                      
                      <div className="pt-4 border-t">
                        <ReportDownloadButton aoi={aoi}
                          moduleName="Household Water Harvesting"
                          district={effectiveDistrictName}
                          dateRange={`Year ${year}`}
                          stats={{
                            "Total Annual Harvest (L)": statsData.annual_volume_liters,
                            "Annual Household Demand (L)": statsData.annual_demand_liters,
                            "Dry Season Reliability (Months)": statsData.months_of_autonomy,
                            "Recommended Tank (L)": statsData.recommended_tank_liters,
                            "Roof Area (m²)": statsData.area_m2,
                            "Annual Rainfall (mm)": statsData.annual_precip_mm,
                            "Runoff Coefficient": statsData.runoff_coefficient
                          }}
                          extraNotes={`This report calculates rainwater harvesting potential for a household size of ${householdSize} using ${dailyWaterUse} L/day. Over a 12-month dry-season simulation, the recommended tank size to avoid water depletion is ${statsData.recommended_tank_liters} L.`}
                          maps={mapData ? [["Average Monthly Precipitation", mapData.thumb_url]] : []}
                          filename={`WaterHarvesting_${effectiveDistrictName.replace(/\s+/g, '_')}.pdf`}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Report data unavailable</div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

