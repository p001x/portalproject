import { useState, useEffect } from "react";
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
import { Loader2, Thermometer, FileText } from "lucide-react";
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
import { api, LSTResult , AOIConfig} from "@/lib/api";
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

const TEMP_COLORS = ["#313695","#74add1","#fee090","#f46d43","#a50026"];
const TEMP_LABELS = ["Cool","Moderate","Warm","Hot","Very Hot"];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function sixMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

const palette = (n: number) => {
  const full = ["#313695","#4575b4","#74add1","#abd9e9","#e0f3f8",
                "#fee090","#fdae61","#f46d43","#d73027","#a50026"];
  if (n === 1) return [full[4]];
  const step = (full.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => full[Math.round(i * step)]);
};

export function LSTPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [startDate, setStartDate] = useState(sixMonthsAgo());
  const [endDate, setEndDate] = useState(today());
  const [nClasses, setNClasses] = useState(5);

  const { mutate, data, isPending, error } = useMutation<LSTResult, Error>({
    mutationFn: () =>
      api.lst({ aoi,
        start_date: startDate, end_date: endDate, n_classes: nClasses }),
  });


  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Thermometer className="w-5 h-5" />
          LST Analysis
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Land Surface Temperature derived from Landsat 8/9 thermal infrared imagery.
          Cloud-masked median composite over the selected period.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label htmlFor="lst-start-date">Start date</Label>
          <input
            id="lst-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="lst-end-date">End date</Label>
          <input
            id="lst-end-date"
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
            <Thermometer className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Calculate LST"}
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
            Select a district and date range, then click <strong className="mx-1">Calculate LST</strong>.
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Computing LST for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="classify">Classification</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px]">
              <div className="h-[560px] rounded-lg overflow-hidden border">
                <DistrictMap center={data.center} tileUrl={data.tile_url} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {TEMP_LABELS.map((label, i) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm inline-block"
                      style={{ background: TEMP_COLORS[i] }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Statistics — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Period: {data.start_date} → {data.end_date}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(data.stats).map(([label, val]) => (
                  <div key={label} className="bg-card border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-2xl font-bold text-primary">{val}</p>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="font-medium mb-3">Temperature Class Areas</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: TEMP_COLORS[i % TEMP_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={TEMP_COLORS[i % TEMP_COLORS.length]} />
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
                    {Object.entries(data.class_areas_km2).map(([cls, km2], i) => (
                      <tr key={cls} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-1.5 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                            style={{ background: TEMP_COLORS[i % TEMP_COLORS.length] }}
                          />
                          {cls}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{km2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Classification */}
            <TabsContent value="classify" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Quantile Classification — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Breakpoints computed from the actual pixel distribution within the district.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                {palette(data.classify.n_classes).map((color, i) => {
                  const labels: Record<number, string[]> = {
                    2: ["Cool","Hot"],
                    3: ["Cool","Warm","Hot"],
                    4: ["Cool","Moderate","Warm","Hot"],
                    5: ["Cool","Moderate","Warm","Hot","Very Hot"],
                    6: ["Cool","Moderate","Warm","Hot","Very Hot","Extreme"],
                  };
                  const lbl = (labels[data.classify.n_classes] ?? [])[i] ?? `Class ${i + 1}`;
                  return (
                    <span key={i} className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                      {lbl}
                    </span>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {data.classify.panels.map((panel) => (
                  <div key={panel.letter} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground font-bold px-2 py-0.5 rounded text-sm">
                        {panel.letter}
                      </span>
                      <span className="font-medium">{panel.title}</span>
                    </div>
                    {panel.breakpoints.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Breakpoints: {panel.breakpoints.map((b) => b.toFixed(4)).join(" | ")}
                      </p>
                    )}
                    <img
                      src={panel.thumb_url}
                      alt={`${panel.title} classified thumbnail`}
                      className="w-full rounded object-cover border"
                    />
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={Object.entries(panel.areas).map(([k, v], i) => ({
                          name: k.split(" (")[0],
                          area: v,
                          fill: palette(data.classify.n_classes)[i],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis unit=" km²" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[3, 3, 0, 0]}>
                          {Object.keys(panel.areas).map((_, i) => (
                            <Cell key={i} fill={palette(data.classify.n_classes)[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
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
                downloadUrl={(data as any).download_url}
                district={aoi.name || "Custom"}
                title="Land Surface Temperature"
              />
              </div>
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including LST statistics, temperature zone areas, and classification maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · LST statistics (min, max, mean, std) ·
                  Temperature zone area table · Quantile classification panels · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Land Surface Temperature"
                  district={aoi.name || "Custom"}
                  dateRange={`${data.start_date} to ${data.end_date}`}
                  stats={data.stats as Record<string, number>}
                  classAreas={data.class_areas_km2}
                  extraNotes={`LST in °C derived from Landsat 8/9 thermal infrared using the mono-window algorithm with NDVI-based emissivity correction. Analysis covers ${data.district} district from ${data.start_date} to ${data.end_date}.`}
                  maps={data.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? []}
                  filename={`LST_${data.district}_${data.start_date}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
