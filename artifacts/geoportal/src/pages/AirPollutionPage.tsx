import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { Loader2, Wind, FileText, Tag, RotateCcw } from "lucide-react";
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
import { api, AOIConfig, AirPollutionMapResult, AirPollutionStatsResult, AirPollutionClassifyResult, AirPollutionTimeseriesResult, AirPollutionExportResult } from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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

export function AirPollutionPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("2023-12-31");
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
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

  const mapMutation = useMutation<AirPollutionMapResult, Error>({
    mutationFn: () => api.airPollution.map({ aoi, start_date: startDate, end_date: endDate }),
  });

  const statsMutation = useMutation<AirPollutionStatsResult, Error>({
    mutationFn: () => api.airPollution.stats({ aoi, start_date: startDate, end_date: endDate }),
  });

  const classifyMutation = useMutation<AirPollutionClassifyResult, Error>({
    mutationFn: () => api.airPollution.classify({ aoi, start_date: startDate, end_date: endDate, n_classes: nClasses, method, custom_labels: customClassNames }),
  });

  const exportMutation = useMutation<AirPollutionExportResult, Error>({
    mutationFn: () => api.airPollution.export({ aoi, start_date: startDate, end_date: endDate }),
  });

  const timeseriesMutation = useMutation<AirPollutionTimeseriesResult, Error>({
    mutationFn: () => api.airPollution.timeseries({ aoi, start_date: startDate, end_date: endDate }),
  });

  const handleAnalyze = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
    exportMutation.mutate();
    timeseriesMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending || timeseriesMutation.isPending;
  const dataMap = mapMutation.data;
  const dataStats = statsMutation.data;
  const dataClassify = classifyMutation.data;
  const dataExport = exportMutation.data;
  const dataTimeseries = timeseriesMutation.data;
  const hasError = mapMutation.error || statsMutation.error || classifyMutation.error || exportMutation.error || timeseriesMutation.error;

  const activeAreas = useMemo(() => {
    const rawAreas = dataClassify?.classify?.panels?.[0]?.areas;
    if (!rawAreas) return undefined;
    const mapped: Record<string, number> = {};
    const keys = Object.keys(rawAreas);
    keys.forEach((oldKey, i) => {
      const newKey = customClassNames[i] || oldKey;
      mapped[newKey] = rawAreas[oldKey];
    });
    return mapped;
  }, [dataClassify, customClassNames]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-lg">
            <Wind className="w-5 h-5" />
            Air Pollution (Sentinel-5P)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Multi-pollutant analysis (NO₂, CO, SO₂, Aerosols) from Sentinel-5P TROPOMI.
          </p>

          <StudyAreaSelector value={aoi} onChange={setAoi} />

          <div className="space-y-1">
            <Label htmlFor="start-date">Start date</Label>
            <input
              id="start-date"
              type="date"
              min="2018-07-01"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="end-date">End date</Label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Classification Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
                <SelectItem value="equal_interval">Discrete (Equal Interval)</SelectItem>
                <SelectItem value="quantiles">Discrete (Quantiles / Equal Area)</SelectItem>
                <SelectItem value="continuous">Continuous (Linear)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {method !== "continuous" && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Classes: {nClasses}</Label>
                <span className="text-[11px] text-muted-foreground">{nClasses} intervals</span>
              </div>
              <Slider
                min={2}
                max={10}
                step={1}
                value={[nClasses]}
                onValueChange={([v]) => setNClasses(v)}
              />
            </div>
          )}

          {method !== "continuous" && (
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
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {Array.from({ length: nClasses }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-xs shrink-0 border border-black/15 shadow-2xs"
                      style={{ background: ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"][i % 5] }}
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
          )}

          <Button
            className="w-full gap-2"
            onClick={handleAnalyze}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wind className="w-4 h-4" />
            )}
            {isPending ? "Analyzing..." : "Analyze Air Pollution"}
          </Button>

          {hasError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
              An error occurred during analysis. Check the developer console.
            </p>
          )}
        </aside>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={75}>
        <main className="h-full overflow-y-auto p-6">
          {!dataMap && !isPending && (
            <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
              <DistrictMap aoi={aoi} basemap="satellite" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
                <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                  <h3 className="text-xl font-bold mb-2 text-foreground">Analysis Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a study area and parameters from the sidebar, then click run to visualize the multi-pollutant results here.
                  </p>
                </div>
              </div>
            </div>
          )}

          {mapMutation.isPending && !dataMap && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p>Analyzing Air Pollution for {aoi.name || 'Custom'}…</p>
              <p className="text-xs">Initial map rendering typically takes 5–15 seconds.</p>
            </div>
          )}

          {dataMap && (
            <Tabs defaultValue="map" className="h-full flex flex-col">
              <TabsList className="mb-4 self-start">
                <TabsTrigger value="map">Map (NO₂)</TabsTrigger>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
                <TabsTrigger value="timeseries" disabled={!dataTimeseries}>
                  {timeseriesMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
                  Time Series
                </TabsTrigger>
                <TabsTrigger value="static-map" disabled={!dataClassify && !dataExport}>
                  {(classifyMutation.isPending || exportMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
                  Static Maps
                </TabsTrigger>
                <TabsTrigger value="report" disabled={!dataStats || !dataTimeseries} className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" />Report
                </TabsTrigger>
              </TabsList>

              <TabsContent value="map" className="flex-1 min-h-[500px]">
                {dataStats?.exceeds_who && (
                  <div className="mb-3 flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-2.5 text-sm font-medium">
                    <Wind className="w-4 h-4 shrink-0" />
                    Exceeds WHO annual limit equivalent (10 µmol/m²*) 
                    <span className="text-xs opacity-80 font-normal ml-2">(*Note: WHO limit is surface µg/m³, this is column density)</span>
                  </div>
                )}
                <div className="h-[520px] rounded-lg overflow-hidden border">
                  <DistrictMap center={dataMap.center} bbox={dataMap.bbox} tileUrl={dataMap.tile_url} />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>NO₂ tropospheric column density (µmol/m²)</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#000080" }} />
                    Low (0)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#ff0000" }} />
                    High (≥20)
                  </span>
                </div>
              </TabsContent>

              <TabsContent value="stats" className="space-y-6">
                <div>
                  <h2 className="font-semibold text-lg mb-1">
                    Multi-Pollutant Statistics — {dataMap.district}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Averaged column density statistics over the selected period. Quality masked: NO₂ (qa&gt;0.75), CO &amp; SO₂ (qa&gt;0.5).
                  </p>
                </div>

                {!dataStats && statsMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted/20 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin" /> Computing statistics...
                  </div>
                )}

                {dataStats && (
                  <>
                    {dataStats.exceeds_who && (
                      <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
                        <Wind className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold">WHO Guideline Proxy Exceeded</p>
                          <p className="text-xs mt-0.5 opacity-90">
                            The mean NO₂ column density exceeds 10 µmol/m². While not perfectly translatable to ground-level µg/m³, this serves as a proxy indicating potentially hazardous long-term exposure.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {Object.entries(dataStats.stats).map(([label, val]) => (
                        <div key={label} className="bg-card border rounded-lg p-4 shadow-sm">
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className="text-2xl font-bold text-primary">{val}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="timeseries" className="space-y-6">
                <div>
                  <h2 className="font-semibold text-lg mb-1">
                    Air Pollution Time Series — {dataMap.district}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Monthly mean column densities (NO₂, CO, SO₂) and Aerosol Index.
                  </p>
                </div>

                {dataTimeseries && (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                      data={dataTimeseries.time_series.map((pt) => ({
                        date: `${pt.year}-${String(pt.month).padStart(2, "0")}`,
                        no2: pt["NO2 (µmol/m²)"],
                        so2: pt["SO2 (µmol/m²)"],
                        co: pt["CO (mol/m²)"],
                        aer: pt["Aerosol Index"],
                      }))}
                      margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={55} />
                      <YAxis yAxisId="left" unit=" µmol/m²" tick={{ fontSize: 11 }} width={80} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip labelFormatter={(l) => `Period: ${l}`} />
                      <Legend verticalAlign="top" height={36}/>
                      <ReferenceLine yAxisId="left" y={10} stroke="#d73027" strokeDasharray="4 4" label={{ value: "WHO (NO₂)", position: "insideTopRight", fontSize: 10, fill: "#d73027" }} />
                      <Line yAxisId="left" type="monotone" name="NO₂ (µmol/m²)" dataKey="no2" stroke="#d73027" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line yAxisId="left" type="monotone" name="SO₂ (µmol/m²)" dataKey="so2" stroke="#4575b4" strokeWidth={2} dot={{ r: 3 }} />
                      <Line yAxisId="right" type="monotone" name="CO (mol/m²)" dataKey="co" stroke="#313695" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                      <Line yAxisId="right" type="monotone" name="Aerosol Index" dataKey="aer" stroke="#fdae61" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </TabsContent>

              <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                  <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
                </div>
                {dataClassify && dataExport && (
                  <div className="bg-card border rounded-lg p-4">
                    <MapExportControls
                      tileUrl={dataMap.tile_url}
                      thumbUrl={dataMap.thumb_url}
                      downloadUrl={dataExport.download_url}
                      district={aoi.name || "Custom"}
                      title="Air Quality (NO2)"
                      bbox={dataMap.bbox}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="report" className="space-y-6">
                <div>
                  <h2 className="font-semibold text-lg mb-1">PDF Report — {dataMap.district}</h2>
                  <p className="text-sm text-muted-foreground">
                    Download a full PDF report including NO₂ statistics, time series analysis, and air quality maps.
                  </p>
                </div>
                {dataStats && dataTimeseries && (
                  <div className="bg-card border rounded-lg p-5 space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      <strong>Contents:</strong> District metadata · NO₂ concentration statistics ·
                      WHO limit exceedance check · Time series data · Air quality maps · Methodology notes.
                    </p>
                    <ReportDownloadButton
                      aoi={aoi}
                      moduleName="Air Quality (Multi-Pollutant)"
                      district={aoi.name || "Custom"}
                      dateRange={`${dataMap.start_date} to ${dataMap.end_date}`}
                      stats={{
                        ...dataStats.stats,
                        "WHO Status": dataStats.exceeds_who ? 1 : 0,
                      }}
                      classAreas={activeAreas || {}}
                      extraNotes={`Air quality analysis derived from Sentinel-5P NRTI datasets (NO2, SO2, CO, Aerosol). Data has been rigorously quality masked (NO2 qa>0.75, CO/SO2 qa>0.5). Analysis covers ${dataMap.district} district from ${dataMap.start_date} to ${dataMap.end_date}.`}
                      maps={dataClassify?.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? [["NO2 Density", dataMap.thumb_url]]}
                      filename={`AirQuality_${dataMap.district}_${dataMap.start_date}.pdf`}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
