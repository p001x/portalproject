import { useState } from "react";
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
import { Loader2, Waves, FileText, AlertTriangle } from "lucide-react";
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
import { api, FloodResult , AOIConfig} from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";

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

export function FloodPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [startYear, setStartYear] = useState(2019);
  const [endYear, setEndYear] = useState(2024);
  const [nClasses, setNClasses] = useState(5);
  const [activeLayer, setActiveLayer] = useState<"continuous" | "classified">("continuous");

  // Weights
  const [weights, setWeights] = useState<Record<string, number>>({
    rainfall: 0.15,
    twi: 0.12,
    lulc: 0.12,
    elevation: 0.10,
    slope: 0.10,
    river_dist: 0.09,
    road_dist: 0.09,
    soil_type: 0.08,
    drainage_density: 0.08,
    ndvi: 0.07,
  });

  // Factor reversal states
  const [reversals, setReversals] = useState<Record<string, boolean>>({
    rainfall: false,
    twi: false,
    lulc: false,
    elevation: false,
    slope: false,
    river_dist: false,
    road_dist: false,
    soil_type: false,
    drainage_density: false,
    ndvi: false,
  });

  const { mutate, data, isPending, error } = useMutation<FloodResult, Error>({
    mutationFn: () =>
      api.flood({
        aoi,
                start_year: startYear,
        end_year: endYear,
        n_classes: nClasses,
        reverse_rainfall: reversals.rainfall,
        reverse_twi: reversals.twi,
        reverse_lulc: reversals.lulc,
        reverse_elevation: reversals.elevation,
        reverse_slope: reversals.slope,
        reverse_river_dist: reversals.river_dist,
        reverse_road_dist: reversals.road_dist,
        reverse_soil_type: reversals.soil_type,
        reverse_drainage_density: reversals.drainage_density,
        reverse_ndvi: reversals.ndvi,
        custom_weights: weights,
      }),
  });

  const handleWeightChange = (key: string, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val / 100 }));
  };

  const handleReverseToggle = (key: string, checked: boolean) => {
    setReversals((prev) => ({ ...prev, [key]: checked }));
  };

  const activeFactorPanel = data?.classify.panels.find((p) => p.name === `${activeLayer}_score`);

  const currentTileUrl = data
    ? activeLayer === "continuous"
      ? data.tile_url
      : activeLayer === "classified"
      ? data.classify.panels[0].tile_url
      : activeFactorPanel?.tile_url || data.factor_maps[activeLayer]?.tile_url
    : undefined;

  const getReportPayload = () => {
    if (!data) return null;
    return {
      moduleName: "Flood Susceptibility",
      district: data.aoi.name || "Custom",
      dateRange: `${data.start_year} - ${data.end_year}`,
      stats: data.stats,
      classAreas: data.class_areas_km2,
      extraNotes: "Flood Susceptibility computed using Spatial Multi-Criteria Evaluation (SMCE).",
      maps: [
        ["Flood Susceptibility Index", data.thumb_url] as [string, string],
        ["Classified Flood Risk", data.classify.panels[0].thumb_url] as [string, string],
        ...Object.entries(data.factor_maps).map(
          ([key, fm]) => [fm.label, fm.thumb_url] as [string, string]
        )
      ] as [string, string][]
    };
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-80 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Waves className="w-5 h-5" />
          Flood Susceptibility
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Compute Flood Susceptibility using Spatial Multi-Criteria Evaluation (SMCE) with AHP.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Start Year</Label>
            <Select value={startYear.toString()} onValueChange={(v) => setStartYear(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>End Year</Label>
            <Select value={endYear.toString()} onValueChange={(v) => setEndYear(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Classification Classes (Quantile)</Label>
          <Select value={nClasses.toString()} onValueChange={(v) => setNClasses(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 7].map((n) => (
                <SelectItem key={n} value={n.toString()}>{n} Classes</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-sm">Factor Weights (%)</Label>
            <span className="text-xs text-muted-foreground">Total: {Math.round(totalWeight * 100)}%</span>
          </div>
          {Object.entries(weights).map(([k, w]) => (
            <div key={k} className="space-y-1.5 p-2 bg-muted/50 rounded-md border">
              <div className="flex justify-between text-xs">
                <span className="font-medium capitalize">{k.replace("_", " ")}</span>
                <span>{Math.round(w * 100)}%</span>
              </div>
              <Slider
                value={[w * 100]}
                onValueChange={(val) => handleWeightChange(k, val[0])}
                max={100}
                step={1}
                className="py-1"
              />
              <div className="flex items-center justify-between pt-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Reverse Logic</Label>
                <Switch
                  checked={reversals[k]}
                  onCheckedChange={(c) => handleReverseToggle(k, c)}
                  className="scale-75 origin-right"
                />
              </div>
            </div>
          ))}
        </div>

        <Button onClick={() => mutate()} disabled={isPending} className="w-full mt-2">
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Computing...
            </>
          ) : (
            "Run Analysis"
          )}
        </Button>
      </aside>

      {/* ── Main content area ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-muted/30">
        {!data && !isPending && !error && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
            <Waves className="w-12 h-12 opacity-20" />
            <p>Select parameters and run the analysis.</p>
          </div>
        )}

        {isPending && (
          <div className="flex-1 flex items-center justify-center flex-col gap-4 text-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="animate-pulse font-medium">Processing Flood Susceptibility in Earth Engine...</p>
          </div>
        )}

        {error && (
          <div className="p-6 m-6 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 flex flex-col gap-2">
            <h3 className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Analysis Failed
            </h3>
            <p className="text-sm opacity-90">{error.message}</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start flex-wrap h-auto gap-1">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Summary</TabsTrigger>
              <TabsTrigger value="ahp">AHP</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              {getReportPayload() && <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>}
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px] space-y-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase mr-2">Main Layers:</span>
                  <button
                    onClick={() => setActiveLayer("continuous")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "continuous" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Index (Continuous)
                  </button>
                  <button
                    onClick={() => setActiveLayer("classified")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "classified" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Risk (Classified)
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase mr-2">Factor Maps:</span>
                  {Object.entries(data.factor_maps).map(([k, fm]) => (
                    <button
                      key={k}
                      onClick={() => setActiveLayer(k as any)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[520px] rounded-lg overflow-hidden border relative">
                {currentTileUrl ? (
                  <DistrictMap tileUrl={currentTileUrl} center={data.center} />
                ) : (
                  <div className="flex-1 h-full flex items-center justify-center bg-muted">
                    <span className="text-muted-foreground">Map data unavailable</span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Flood Statistics — {data.district}
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Mean Flood Index</div>
                  <div className="text-2xl font-bold text-primary">
                    {data.stats.mean_suitability?.toFixed(2) || "N/A"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Scale 1-5</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">High Risk Area</div>
                  <div className="text-2xl font-bold text-destructive">
                    {data.stats.max_risk_area_km2?.toFixed(1) || "0"} <span className="text-sm font-normal">km²</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Area &gt; 4.5 index</div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Area by Flood Risk Class (km²)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([name, val], i) => ({
                      name: name,
                      value: Math.round(val),
                      color: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={SUSCEPTIBILITY_COLORS[index % SUSCEPTIBILITY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* AHP */}
            <TabsContent value="ahp" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-4">
                  AHP & Consistency Analysis
                </h2>
                
                <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg border mb-6 max-w-md">
                  <span className="font-semibold">Consistency Ratio (CR)</span>
                  <span className={`px-3 py-1 rounded text-sm font-bold ${data.ahp.consistent ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {data.ahp.cr.toFixed(3)} {data.ahp.consistent ? "(Consistent)" : "(Inconsistent)"}
                  </span>
                </div>
                
                <h3 className="font-medium mb-3">Factor Weights</h3>
                <div className="border rounded-lg overflow-hidden max-w-2xl text-sm">
                  <table className="w-full">
                    <thead className="bg-muted text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Factor</th>
                        <th className="px-4 py-3 text-right font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(data.ahp.weights).map(([k, w]) => (
                        <tr key={k} className="hover:bg-muted/30">
                          <td className="px-4 py-3 capitalize">{k.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-right font-mono">{(w * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Select Map to Export:</span>
                <div className="flex flex-wrap gap-2 items-center mb-1">
                  <button
                    onClick={() => setActiveLayer("continuous")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "continuous" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Index (Continuous)
                  </button>
                  <button
                    onClick={() => setActiveLayer("classified")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "classified" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Risk (Classified)
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center mb-4">
                  {Object.entries(data.factor_maps).map(([k, fm]) => (
                    <button
                      key={k}
                      onClick={() => setActiveLayer(k as any)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border rounded-lg p-4">
                {activeLayer === "continuous" && (
                  <MapExportControls
                    title="Flood_Susceptibility"
                    district={aoi.name || "Custom"}
                    tileUrl={data.tile_url}
                    thumbUrl={data.thumb_url}
                    downloadUrl={data.thumb_url}
                  />
                )}
                {activeLayer === "classified" && data.classify?.panels[0] && (
                  <MapExportControls
                    title="Flood_Risk_Classified"
                    district={aoi.name || "Custom"}
                    tileUrl={data.classify.panels[0].tile_url}
                    thumbUrl={data.classify.panels[0].thumb_url}
                    downloadUrl={data.classify.panels[0].thumb_url}
                    classAreas={data.class_areas_km2}
                  />
                )}
                {activeLayer !== "continuous" && activeLayer !== "classified" && data.factor_maps[activeLayer] && (
                  <MapExportControls
                    title={`Flood_Factor_${activeLayer}`}
                    district={aoi.name || "Custom"}
                    tileUrl={data.factor_maps[activeLayer].class_tile_url || data.factor_maps[activeLayer].tile_url}
                    thumbUrl={data.factor_maps[activeLayer].class_thumb_url || data.factor_maps[activeLayer].thumb_url}
                    downloadUrl={data.factor_maps[activeLayer].class_thumb_url || data.factor_maps[activeLayer].thumb_url}
                    
                  />
                )}
              </div>
            </TabsContent>

            {/* Report */}
            {getReportPayload() && (
              <TabsContent value="report" className="flex-1 space-y-4">
                <div className="bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-2xl mx-auto mt-8">
                  <FileText className="w-16 h-16 text-muted-foreground" />
                  <h2 className="text-2xl font-bold">Comprehensive Analysis Report</h2>
                  <p className="text-muted-foreground">
                    Download a detailed PDF report containing all generated maps, 
                    factor weightings, consistency ratios, and statistical breakdowns 
                    for {data.district}.
                  </p>
                  <div className="pt-4">
                    <ReportDownloadButton aoi={aoi} {...getReportPayload()!} />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}
