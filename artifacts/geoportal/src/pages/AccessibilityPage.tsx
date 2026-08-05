import { useState } from "react";
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
import { Loader2, Navigation, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { api, AccessibilityMapResult, AccessibilityStatsResult, AccessibilityClassifyResult, AccessibilityExportResult, AOIConfig } from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";

const ACCESSIBILITY_COLORS = ["#5C3A21", "#B98D4F", "#E8C285", "#F3E58C"];
const ACCESSIBILITY_LABELS = ["Very High (0-15m)", "High (15-30m)", "Low (30-45m)", "Very Low (45-60m)"];

const AMENITY_OPTIONS = [
  { id: "hospital", label: "Hospital" },
  { id: "clinic", label: "Clinic" },
  { id: "school", label: "School" },
  { id: "college", label: "College" },
  { id: "university", label: "University" },
  { id: "marketplace", label: "Marketplace" },
  { id: "bank", label: "Bank" },
  { id: "townhall", label: "Town Hall" },
  { id: "community_centre", label: "Community Centre" }
];

export function AccessibilityPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Kigali City", level1: "Kigali City", level2: "Gasabo" });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(["school"]);
  const [nClasses, setNClasses] = useState(4);
  const [activeLayer, setActiveLayer] = useState<string>("classified");
  const [showRoads, setShowRoads] = useState(false);

  const handleAmenityChange = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedAmenities((prev) => [...prev, id]);
    } else {
      setSelectedAmenities((prev) => prev.filter((a) => a !== id));
    }
  };

  const getReq = () => {
    return {
      aoi,
      amenities: selectedAmenities,
      n_classes: nClasses
    };
  };

  const mapMutation = useMutation<AccessibilityMapResult, Error>({
    mutationFn: () => api.accessibility.map(getReq()),
  });
  const statsMutation = useMutation<AccessibilityStatsResult, Error>({
    mutationFn: () => api.accessibility.stats(getReq()),
  });
  const classifyMutation = useMutation<AccessibilityClassifyResult, Error>({
    mutationFn: () => api.accessibility.classify(getReq()),
  });
  const exportMutation = useMutation<AccessibilityExportResult, Error>({
    mutationFn: () => api.accessibility.export(getReq()),
  });

  const handleAnalyze = () => {
    if (selectedAmenities.length === 0) return;
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
    if (activeLayer === "continuous") return mapData.travel_time_tile_url;
    if (activeLayer === "classified") return mapData.acc_class_tile_url;
    return undefined;
  })();

  const enrichedFacilities = (() => {
    if (!mapData?.facilities) return undefined;
    if (!statsData) return mapData.facilities;
    return mapData.facilities.map(f => {
      const isNearest = statsData.nearest_facility && f.lon === statsData.nearest_facility.lon && f.lat === statsData.nearest_facility.lat;
      const isFarthest = statsData.farthest_facility && f.lon === statsData.farthest_facility.lon && f.lat === statsData.farthest_facility.lat;
      return { ...f, isNearest, isFarthest };
    });
  })();

  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Navigation className="w-5 h-5" />
          Accessibility
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estimate travel time to selected amenities using simulated road networks and friction surfaces.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-2">
          <Label>Amenities to Include</Label>
          <div className="space-y-2 text-sm border rounded-md p-3 max-h-48 overflow-y-auto">
            {AMENITY_OPTIONS.map((opt) => (
              <div key={opt.id} className="flex items-center space-x-2">
                <Checkbox
                  id={opt.id}
                  checked={selectedAmenities.includes(opt.id)}
                  onCheckedChange={(checked) => handleAmenityChange(opt.id, checked as boolean)}
                />
                <label
                  htmlFor={opt.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {opt.label}
                </label>
              </div>
            ))}
          </div>
          {selectedAmenities.length === 0 && (
            <p className="text-xs text-destructive">Select at least one amenity.</p>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-roads"
              checked={showRoads}
              onCheckedChange={(c) => setShowRoads(c as boolean)}
            />
            <Label htmlFor="show-roads">Overlay Roads Network</Label>
          </div>
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleAnalyze}
          disabled={isPending || selectedAmenities.length === 0}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Analyze Accessibility"}
        </Button>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
            {error.message}
          </p>
        )}
      </aside>

      {/* ── Results ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        {!anyData && !isPending && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Select an area and amenities, then click{" "}
            <strong className="mx-1">Analyze Accessibility</strong>.
          </div>
        )}

        {!anyData && isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Analyzing travel times for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">Fetching POIs and routing can take 15–30 seconds.</p>
          </div>
        )}

        {anyData && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
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
                      variant={activeLayer === "classified" ? "default" : "outline"}
                      onClick={() => setActiveLayer("classified")}
                    >
                      Accessibility Classes
                    </Button>
                    <Button
                      size="sm"
                      variant={activeLayer === "continuous" ? "default" : "outline"}
                      onClick={() => setActiveLayer("continuous")}
                    >
                      Travel Time Continuous
                    </Button>
                  </div>
                  <div className="h-[520px] rounded-lg overflow-hidden border">
                    <DistrictMap 
                      center={mapData.center} 
                      tileUrl={currentTileUrl || ""} 
                      overlayUrl={showRoads && mapData.roads_tile_url ? mapData.roads_tile_url : undefined}
                      facilities={enrichedFacilities}
                      nearestRoadGeojson={mapData.nearest_road_geojson}
                      farthestRoadGeojson={mapData.farthest_road_geojson}
                      incidents={mapData.incidents}
                      routes={mapData.routes}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {ACCESSIBILITY_LABELS.map((label, i) => (
                      <span key={label} className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-sm inline-block"
                          style={{ background: ACCESSIBILITY_COLORS[i % ACCESSIBILITY_COLORS.length] }}
                        />
                        {label}
                      </span>
                    ))}
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
                      Travel time distribution across the selected area.
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

                  {(statsData.nearest_facility || statsData.farthest_facility) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      {statsData.nearest_facility && (
                        <div className="bg-card border rounded-lg p-4">
                          <p className="text-xs text-muted-foreground mb-1">Nearest Facility</p>
                          <p className="text-lg font-bold text-primary">{statsData.nearest_facility.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 capitalize">
                            Type: {statsData.nearest_facility.type} | Distance: {statsData.nearest_facility.distance_km} km
                          </p>
                        </div>
                      )}
                      {statsData.farthest_facility && (
                        <div className="bg-card border rounded-lg p-4">
                          <p className="text-xs text-muted-foreground mb-1">Farthest Facility</p>
                          <p className="text-lg font-bold text-primary">{statsData.farthest_facility.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 capitalize">
                            Type: {statsData.farthest_facility.type} | Distance: {statsData.farthest_facility.distance_km} km
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="font-medium mb-3">Accessibility Class Areas</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={Object.entries(statsData.class_areas_km2).map(([k, v], i) => ({
                          name: k,
                          area: v,
                          fill: ACCESSIBILITY_COLORS[i % ACCESSIBILITY_COLORS.length],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                          {Object.keys(statsData.class_areas_km2).map((_, i) => (
                            <Cell key={i} fill={ACCESSIBILITY_COLORS[i % ACCESSIBILITY_COLORS.length]} />
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
                                style={{ background: ACCESSIBILITY_COLORS[i % ACCESSIBILITY_COLORS.length] }}
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

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Select Map to Export:</span>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button
                    size="sm"
                    variant={activeLayer === "classified" ? "default" : "outline"}
                    onClick={() => setActiveLayer("classified")}
                  >
                    Accessibility Classes
                  </Button>
                  <Button
                    size="sm"
                    variant={activeLayer === "continuous" ? "default" : "outline"}
                    onClick={() => setActiveLayer("continuous")}
                  >
                    Travel Time Continuous
                  </Button>
                </div>
              </div>

              {exportMutation.isPending && !exportData ? (
                 <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : exportData && mapData ? (
                <div className="bg-card border rounded-lg p-4">
                  <MapExportControls
                    tileUrl={currentTileUrl!}
                    thumbUrl={activeLayer === "continuous" ? exportData.travel_time_thumb_url : exportData.acc_class_thumb_url}
                    downloadUrl={activeLayer === "continuous" ? exportData.travel_time_download_url : undefined}
                    district={mapData.district || aoi.name || "Custom"}
                    title={activeLayer === "continuous" ? "Travel Time Continuous Map" : "Accessibility Classes Map"}
                    classAreas={activeLayer === "classified" ? statsData?.class_areas_km2 : undefined}
                    overridePalette={ACCESSIBILITY_COLORS}
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
                  Download a full PDF report including accessibility statistics and area analysis.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                {(mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending) ? (
                   <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/> Gathering report data...</div>
                ) : (mapData && statsData && classifyData && exportData) ? (
                  <ReportDownloadButton aoi={aoi}
                    moduleName="Accessibility"
                    district={mapData.district || aoi.name || "Custom"}
                    dateRange={`Current`}
                    stats={statsData.stats as Record<string, number>}
                    classAreas={statsData.class_areas_km2}
                    extraNotes={`Accessibility mapped for ${selectedAmenities.join(", ")}.`}
                    maps={[]}
                    filename={`Accessibility_${mapData.district}.pdf`}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Report data is unavailable. Please try analyzing again.</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
