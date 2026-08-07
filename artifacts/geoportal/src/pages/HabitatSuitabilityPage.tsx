import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Loader2, Trash2, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, HabitatResult, AOIConfig, fetchHabitatSuitability, fetchHabitatAhp, AhpData } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";

const DISTRICTS = [
  "Bugesera","Burera","Gakenke","Gasabo","Gatsibo","Gicumbi","Gisagara",
  "Huye","Kamonyi","Karongi","Kayonza","Kicukiro","Kirehe","Muhanga",
  "Musanze","Ngoma","Ngororero","Nyabihu","Nyagatare","Nyamagabe",
  "Nyamasheke","Nyanza","Nyarugenge","Nyaruguru","Rubavu","Ruhango",
  "Rulindo","Rusizi","Rutsiro","Rwamagana",
  "Custom Study Area",
];

const FACTOR_KEYS = [
  "wetlands", "water", "landcover", "rainfall", "buildings",
  "irrigated", "slope", "roads", "elevation", "temperature"
] as const;
type FactorKey = typeof FACTOR_KEYS[number];

const FACTOR_LABELS: Record<FactorKey, string> = {
  wetlands: "Distance from Wetlands",
  water: "Distance from Water",
  landcover: "Land Cover",
  rainfall: "Mean Annual Rainfall",
  buildings: "Distance from Buildings",
  irrigated: "Distance from Irrigated",
  slope: "Slope",
  roads: "Distance from Roads",
  elevation: "Elevation",
  temperature: "Mean Annual Temperature",
};

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  wetlands: 22,
  water: 16,
  landcover: 13,
  rainfall: 10,
  buildings: 10,
  irrigated: 8,
  slope: 7,
  roads: 6,
  elevation: 4,
  temperature: 4,
};

const SUITABILITY_LEGEND: LegendItem[] = [
  { color: "#d7191c", label: "Very Low Suitability" },
  { color: "#fdae61", label: "Low Suitability" },
  { color: "#ffffbf", label: "Moderate Suitability" },
  { color: "#a6d96a", label: "High Suitability" },
  { color: "#1a9641", label: "Very High Suitability" },
];

const SCORE_LEGEND: LegendItem[] = [
  { color: "#1a9641", label: "Score 5 – Most suitable" },
  { color: "#a6d96a", label: "Score 4" },
  { color: "#ffffbf", label: "Score 3" },
  { color: "#fdae61", label: "Score 2" },
  { color: "#d7191c", label: "Score 1 – Least suitable" },
];

const CLASS_COLOR_LIST = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"];

function loadWeights(district: string): Record<FactorKey, number> {
  try {
    const stored = localStorage.getItem(`habitat_weights_${district}`);
    if (stored) return { ...DEFAULT_WEIGHTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_WEIGHTS };
}

function saveWeights(district: string, w: Record<FactorKey, number>) {
  try { localStorage.setItem(`habitat_weights_${district}`, JSON.stringify(w)); } catch { /* ignore */ }
}

/** Normalize weight record so values sum to 100. */
function normalize(w: Record<FactorKey, number>): Record<FactorKey, number> {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total === 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(
    FACTOR_KEYS.map((k) => [k, Math.round((w[k] / total) * 1000) / 10])
  ) as Record<FactorKey, number>;
}

/** North arrow for thumbnail overlays */
function SmallNorthArrow() {
  return (
    <svg width="18" height="22" viewBox="0 0 28 36" fill="none">
      <polygon points="14,2 20,18 14,14 8,18" fill="#111" />
      <polygon points="14,34 8,18 14,22 20,18" fill="#888" />
      <text x="14" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#fff" dy="-1">N</text>
    </svg>
  );
}

/** Factor map card with cartographic overlays */
function FactorMapCard({ factorKey, factor, analysisDate }: {
  factorKey: string;
  factor: HabitatResult["factors"][string];
  analysisDate: string;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold">{FACTOR_LABELS[factorKey as FactorKey]}</h4>
          <p className="text-sm text-muted-foreground">{factor.description}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium">Weight</div>
          <div className="text-2xl font-bold text-primary">{factor.weight_pct.toFixed(1)}%</div>
          {factor.reversed && (
            <div className="text-xs text-orange-600 font-semibold bg-orange-100 px-2 py-0.5 rounded mt-1">
              REVERSED
            </div>
          )}
        </div>
      </div>
      
      <div className="relative aspect-square bg-slate-50 rounded-md overflow-hidden border">
        {factor.thumb_url ? (
          <>
            <img src={factor.thumb_url} alt={`${factorKey} map`} className="w-full h-full object-cover" />
            <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm text-xs border">
              <strong>{FACTOR_LABELS[factorKey as FactorKey]}</strong>
              <div className="text-[10px] text-muted-foreground">{analysisDate}</div>
            </div>
            <div className="absolute top-2 right-2 bg-white/80 rounded shadow-sm p-1">
              <SmallNorthArrow />
            </div>
            <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm rounded shadow-sm border px-2 py-1.5 flex flex-col gap-1">
              <div className="text-[10px] font-medium text-center uppercase tracking-wider text-slate-500">
                Suitability Score (1-5)
              </div>
              <div className="flex h-2 w-full">
                {SCORE_LEGEND.map((item, idx) => (
                  <div key={idx} style={{ backgroundColor: item.color }} className="flex-1 first:rounded-l-sm last:rounded-r-sm border-r border-black/10 last:border-0" />
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-medium px-1">
                <span>1 (Low)</span>
                <span>3 (Mod)</span>
                <span>5 (High)</span>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            Map unavailable
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        {factor.download_url && (
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <a href={factor.download_url} download target="_blank" rel="noreferrer">
              <FileText className="w-3.5 h-3.5 mr-2" />
              GeoTIFF
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}


export function HabitatSuitabilityPage() {
  const [district, setDistrict] = useState("Kigali City");
  const [customAoi, setCustomAoi] = useState<AOIConfig | null>(null);
  const [weights, setWeights] = useState<Record<FactorKey, number>>(loadWeights("Kigali City"));
  const [ahpData, setAhpData] = useState<AhpData | null>(null);
  const [reverseFlags, setReverseFlags] = useState<Record<string, boolean>>({});
  const [nClasses, setNClasses] = useState(5);
  const [activeTab, setActiveTab] = useState("map");

  const aoiConfig: AOIConfig = customAoi || (
    district === "Kigali City" ? { type: "kigali" } : { type: "district", name: district }
  );

  const effectiveDistrictName = customAoi ? (customAoi.name || "Custom Study Area") : (district === "Kigali City" ? "Kigali City" : district);

  const { data, mutate: runAnalysis, isPending } = useMutation({
    mutationFn: async () => {
      // Create decimals that sum to 1.0
      const norm = normalize(weights);
      const custom_weights: Record<string, number> = {};
      Object.entries(norm).forEach(([k, v]) => { custom_weights[k] = v / 100.0; });
      
      return fetchHabitatSuitability({
        aoi: aoiConfig,
        reverse_flags: reverseFlags,
        n_classes: nClasses,
        custom_weights,
      });
    },
    onSuccess: () => setActiveTab("map"),
  });

  const { mutate: updateAhp } = useMutation({
    mutationFn: async (w: Record<FactorKey, number>) => {
      const norm = normalize(w);
      const custom_weights: Record<string, number> = {};
      Object.entries(norm).forEach(([k, v]) => { custom_weights[k] = v / 100.0; });
      return fetchHabitatAhp(custom_weights);
    },
    onSuccess: (res) => setAhpData(res),
  });

  useEffect(() => {
    setWeights(loadWeights(effectiveDistrictName));
  }, [effectiveDistrictName]);

  useEffect(() => {
    updateAhp(weights);
  }, [weights, updateAhp]);

  const handleWeightChange = (k: FactorKey, val: number) => {
    const newW = { ...weights, [k]: val };
    setWeights(newW);
    saveWeights(effectiveDistrictName, newW);
  };

  const handleReset = () => {
    setWeights({ ...DEFAULT_WEIGHTS });
    saveWeights(effectiveDistrictName, { ...DEFAULT_WEIGHTS });
    setReverseFlags({});
  };

  const handleAoiSelect = useCallback((aoi: AOIConfig) => {
    setCustomAoi(aoi);
    if (aoi.type === 'district' && aoi.name) {
      setDistrict(aoi.name);
    } else {
      setDistrict("Custom Study Area");
    }
  }, []);

  const chartData = data ? Object.entries(data.class_areas_km2).map(([name, area]) => ({ name, area })) : [];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Crane Habitat Suitability</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Multi-Criteria Evaluation (MCE) for Grey Crowned Cranes using the Analytical Hierarchy Process (AHP).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card border rounded-lg p-5 shadow-sm space-y-5">
            <h3 className="font-semibold text-lg flex items-center border-b pb-2">
              Configuration
            </h3>
            
            <div className="space-y-3">
              <Label>Study Area</Label>
              <StudyAreaSelector
                districts={DISTRICTS}
                selectedDistrict={district}
                onDistrictChange={(d) => { setDistrict(d); setCustomAoi(null); }}
                onAoiChange={handleAoiSelect}
              />
            </div>

            <div className="space-y-3">
              <Label>Suitability Classes (Quantiles)</Label>
              <Select value={nClasses.toString()} onValueChange={(v) => setNClasses(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Classes</SelectItem>
                  <SelectItem value="4">4 Classes</SelectItem>
                  <SelectItem value="5">5 Classes</SelectItem>
                  <SelectItem value="7">7 Classes</SelectItem>
                  <SelectItem value="10">10 Classes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">AHP Weights</Label>
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 px-2 text-xs">
                  Reset Defaults
                </Button>
              </div>

              {ahpData && (
                <div className={`p-3 rounded-md text-sm ${ahpData.consistent ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="flex justify-between items-center font-medium">
                    <span>Consistency Ratio (CR):</span>
                    <span>{ahpData.cr.toFixed(3)}</span>
                  </div>
                  <p className="text-xs mt-1 opacity-90">
                    {ahpData.consistent ? 'CR < 0.10. Weights are perfectly consistent.' : 'CR > 0.10. Weights are inconsistent.'}
                  </p>
                </div>
              )}

              <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2">
                {FACTOR_KEYS.map((k) => (
                  <div key={k} className="space-y-2 bg-slate-50/50 p-3 rounded-md border border-slate-100">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-700">{FACTOR_LABELS[k]}</span>
                      <span className="font-mono text-slate-500 bg-white px-1.5 rounded shadow-sm border border-slate-200">
                        {weights[k]}
                      </span>
                    </div>
                    <Slider
                      value={[weights[k]]}
                      min={0} max={100} step={1}
                      onValueChange={([val]) => handleWeightChange(k, val)}
                    />
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                      <Label htmlFor={`rev-${k}`} className="text-xs text-slate-500 cursor-pointer">
                        Reverse Polarity
                      </Label>
                      <Switch
                        id={`rev-${k}`}
                        checked={reverseFlags[k] || false}
                        onCheckedChange={(c) => setReverseFlags({ ...reverseFlags, [k]: c })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={() => runAnalysis()} disabled={isPending} className="w-full h-11 text-base">
              {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {isPending ? "Computing AHP Model..." : "Run AHP Overlay"}
            </Button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {data ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="grid w-full max-w-[400px] grid-cols-2">
                  <TabsTrigger value="map">Final Suitability Map</TabsTrigger>
                  <TabsTrigger value="factors">Factor Scores</TabsTrigger>
                </TabsList>
                
                <div className="flex gap-2">
                  {data.download_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={data.download_url} download target="_blank" rel="noreferrer">
                        <FileText className="w-4 h-4 mr-2" /> Download Final TIF
                      </a>
                    </Button>
                  )}
                  <MapExportControls
                    mapUrl={data.tile_url}
                    district={effectiveDistrictName}
                    title="Crane Habitat Suitability"
                    bbox={data.classify?.panels?.[0]?.bbox || undefined}
                    classAreas={data.class_areas_km2}
                  />
                </div>
              </div>

              <TabsContent value="map" className="mt-0 space-y-6">
                <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <h3 className="font-semibold text-lg mb-4">
                    Habitat Suitability (Weighted Overlay) — {effectiveDistrictName}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                      <div className="aspect-[4/3] rounded-md overflow-hidden border shadow-inner">
                        <DistrictMap tileUrl={data.tile_url} legend={SUITABILITY_LEGEND} />
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="bg-slate-50 rounded-lg p-4 border">
                        <h4 className="font-medium mb-3 flex items-center">
                          Area Statistics
                        </h4>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                              <XAxis type="number" unit=" km²" fontSize={11} />
                              <YAxis dataKey="name" type="category" width={80} fontSize={11} tickFormatter={(val) => val.split(" ")[0]} />
                              <Tooltip formatter={(val: number) => [`${val} km²`, "Area"]} cursor={{fill: 'transparent'}} />
                              <Bar dataKey="area" radius={[0, 4, 4, 0]} barSize={20}>
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CLASS_COLOR_LIST[index % CLASS_COLOR_LIST.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4 border text-sm">
                        <h4 className="font-medium mb-2">AHP Weights Applied</h4>
                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-2">
                          {Object.entries(data.factors).map(([k, v]) => (
                            <div key={k} className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">{v.label}</span>
                              <span className="font-medium">{v.weight_pct.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="factors" className="mt-0">
                <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">Reclassified Criterion Maps (Scores 1-5)</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {FACTOR_KEYS.map((k) => (
                      <FactorMapCard
                        key={k}
                        factorKey={k}
                        factor={data.factors[k]}
                        analysisDate={new Date().toLocaleDateString()}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-[600px] border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <p className="text-lg font-medium">Ready to run Habitat Suitability Analysis</p>
              <p className="text-sm mt-1">Select a study area and adjust AHP weights, then click Run Analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
