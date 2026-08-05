import { useState, useEffect } from "react";
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
} from "recharts";
import { Loader2, Wind, FileText } from "lucide-react";
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
import { api, AirPollutionResult , AOIConfig} from "@/lib/api";
import { DistrictMap } from "@/components/DistrictMap";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { MapExportControls } from "@/components/MapExportControls";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";

const DISTRICTS = [
  "Bugesera","Burera","Gakenke","Gasabo","Gatsibo","Gicumbi","Gisagara",
  "Huye","Kamonyi","Karongi","Kayonza","Kicukiro","Kirehe","Muhanga",
  "Musanze","Ngoma","Ngororero","Nyabihu","Nyagatare","Nyamagabe",
  "Nyamasheke","Nyanza","Nyarugenge","Nyaruguru","Rubavu","Ruhango",
  "Rulindo","Rusizi","Rutsiro","Rwamagana",
  "Custom Study Area",
];

export function AirPollutionPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("2023-12-31");
  const [nClasses, setNClasses] = useState(5);

  const { mutate, data, isPending, error } = useMutation<AirPollutionResult, Error>({
    mutationFn: () =>
      api.airPollution({ aoi,
        start_date: startDate, end_date: endDate, n_classes: nClasses }),
  });


  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Wind className="w-5 h-5" />
          Air Pollution (NO₂)
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Nitrogen Dioxide (NO₂) concentration from Sentinel-5P TROPOMI.
          Tropospheric column density averaged over the selected period.
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

        <div className="space-y-2">
          <Label>Classes: {nClasses}</Label>
          <Slider
            min={2}
            max={10}
            step={1}
            value={[nClasses]}
            onValueChange={([v]) => setNClasses(v)}
          />
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => mutate()}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wind className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Analyze NO2"}
        </Button>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
            {error.message}
          </p>
        )}
      </aside>

      {/* ── Results ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        {!data && !isPending && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Select a district and date range, then click{" "}
            <strong className="mx-1">Analyze NO2</strong>.
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Analyzing NO₂ pollution for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="timeseries">Time Series</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px]">
              {data.exceeds_who && (
                <div className="mb-3 flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-2.5 text-sm font-medium">
                  <Wind className="w-4 h-4 shrink-0" />
                  Exceeds WHO annual limit (10 µmol/m²)
                </div>
              )}
              <div className="h-[520px] rounded-lg overflow-hidden border">
                <DistrictMap center={data.center} tileUrl={data.tile_url} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>NO₂ tropospheric column density (µmol/m²)</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#313695" }} />
                  Low
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#a50026" }} />
                  High
                </span>
              </div>
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Statistics — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  NO₂ tropospheric column density statistics over the selected period.
                </p>
              </div>

              {data.exceeds_who && (
                <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
                  <Wind className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">WHO Guideline Exceeded</p>
                    <p className="text-xs mt-0.5 opacity-90">
                      The mean NO₂ concentration exceeds the WHO annual air quality guideline of 10 µmol/m².
                      This may pose health risks to the population.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(data.stats).map(([label, val]) => (
                  <div key={label} className="bg-card border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-2xl font-bold text-primary">{val}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Time Series */}
            <TabsContent value="timeseries" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  NO₂ Time Series — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Monthly mean NO₂ tropospheric column density (µmol/m²).
                </p>
              </div>

              <ResponsiveContainer width="100%" height={360}>
                <LineChart
                  data={data.time_series.map((pt) => ({
                    date: `${pt.year}-${String(pt.month).padStart(2, "0")}`,
                    no2: pt["NO2 (µmol/m²)"],
                  }))}
                  margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    height={55}
                  />
                  <YAxis
                    unit=" µmol/m²"
                    tick={{ fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(4)} µmol/m²`, "NO₂"]}
                    labelFormatter={(l) => `Period: ${l}`}
                  />
                  <ReferenceLine
                    y={10}
                    stroke="#d73027"
                    strokeDasharray="4 4"
                    label={{ value: "WHO limit", position: "insideTopRight", fontSize: 11, fill: "#d73027" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="no2"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>

            {/* ── Report ── */}
            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              <div className="bg-card border rounded-lg p-4">
              <MapExportControls
                tileUrl={data.tile_url}
                thumbUrl={data.classify?.panels?.[0]?.thumb_url || (data as any).thumb_url}
                downloadUrl={data.download_url}
                district={aoi.name || "Custom"}
                title="Air Quality (NO2)"
              />
              </div>
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including NO₂ statistics, time series analysis, and air quality maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · NO₂ concentration statistics ·
                  WHO limit exceedance check · Time series data · Air quality maps · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Air Quality (NO2)"
                  district={aoi.name || "Custom"}
                  dateRange={`${data.start_date} to ${data.end_date}`}
                  stats={{
                    ...data.stats,
                    "WHO Status": data.exceeds_who ? 1 : 0,
                  }}
                  classAreas={{}}
                  extraNotes={`Air quality analysis derived from Sentinel-5P NRTI NO2 dataset. Values are tropospheric column density in µmol/m². The WHO recommended limit is 10 µmol/m² (annual mean). Analysis covers ${data.district} district from ${data.start_date} to ${data.end_date}.`}
                  maps={data.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? [["NO2 Density", data.tile_url]]}
                  filename={`AirQuality_${data.district}_${data.start_date}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
