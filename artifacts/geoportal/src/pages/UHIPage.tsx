import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { api, UHIResult , AOIConfig} from "@/lib/api";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}
function sixMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}

export function UHIPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [startDate, setStartDate] = useState(sixMonthsAgo());
  const [endDate, setEndDate] = useState(today());
  const [gridSize, setGridSize] = useState(5);
  const [activeLayer, setActiveLayer] = useState<"lst" | "ndbi">("lst");

  const { mutate, data, isPending, error } = useMutation<UHIResult, Error>({
    mutationFn: () =>
      api.uhi({
        aoi,
                start_date: startDate,
        end_date: endDate,
        grid_size: gridSize,
      }),
  });


  const tileUrl = data
    ? activeLayer === "lst"
      ? data.lst_tile_url
      : data.ndbi_tile_url
    : "";

  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Thermometer className="w-5 h-5" />
          UHI Analysis
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Urban Heat Island analysis using Land Surface Temperature (LST) and
          Normalized Difference Built-up Index (NDBI).
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label htmlFor="uhi-start-date">Start date</Label>
          <input
            id="uhi-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="uhi-end-date">End date</Label>
          <input
            id="uhi-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <Label>Grid: {gridSize}x{gridSize}</Label>
          <Slider
            min={3}
            max={12}
            step={1}
            value={[gridSize]}
            onValueChange={([v]) => setGridSize(v)}
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
          {isPending ? "Analyzing…" : "Analyze UHI"}
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
            <strong className="mx-1">Analyze UHI</strong>.
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Analyzing UHI for {aoi.name || 'Custom'}…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="grid">Grid Table</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map Tab */}
            <TabsContent value="map" className="flex-1 space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={activeLayer === "lst" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveLayer("lst")}
                >
                  LST
                </Button>
                <Button
                  variant={activeLayer === "ndbi" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveLayer("ndbi")}
                >
                  NDBI
                </Button>
              </div>

              <div className="h-[480px] rounded-lg overflow-hidden border">
                <DistrictMap center={data.center} tileUrl={tileUrl} />
              </div>

              <div className="flex gap-4">
                {data.lst_thumb_url && (
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">LST Thumbnail</p>
                    <img
                      src={data.lst_thumb_url}
                      alt="LST thumbnail"
                      className="w-full rounded border object-cover"
                    />
                  </div>
                )}
                {data.ndbi_thumb_url && (
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">NDBI Thumbnail</p>
                    <img
                      src={data.ndbi_thumb_url}
                      alt="NDBI thumbnail"
                      className="w-full rounded border object-cover"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">UHI Analysis — {aoi.name || 'Custom'}</h2>
                <p className="text-sm text-muted-foreground">
                  {data.n_cells_with_data} / {data.n_cells_total} cells with data
                </p>
              </div>

              {data.regression === null ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Not enough data for regression analysis.
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-medium">Regression: LST ~ NDBI</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard label="R²" value={data.regression.r2.toFixed(4)} />
                    <StatCard label="Slope" value={data.regression.slope.toFixed(4)} />
                    <StatCard label="p-value" value={data.regression.p_value.toExponential(2)} />
                    <StatCard label="n (cells)" value={data.regression.n} />
                  </div>
                </div>
              )}

              <div className="flex gap-4 flex-wrap">
                {data.bivariate_png && (
                  <div className="flex-1 min-w-[260px] space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Bivariate Map</p>
                    <img
                      src={"data:image/png;base64," + data.bivariate_png}
                      alt="Bivariate map"
                      className="w-full rounded border"
                    />
                  </div>
                )}
                {data.scatter_png && (
                  <div className="flex-1 min-w-[260px] space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Scatter Plot</p>
                    <img
                      src={"data:image/png;base64," + data.scatter_png}
                      alt="Scatter plot"
                      className="w-full rounded border"
                    />
                  </div>
                )}
              </div>

              {/* LST Stats */}
              <div>
                <h3 className="font-medium mb-2">LST Statistics</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(data.lst_stats).map(([k, v]) => (
                    <div key={k} className="bg-card border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">{k}</p>
                      <p className="text-lg font-bold text-primary">
                        {v !== null ? v.toFixed(2) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* NDBI Stats */}
              <div>
                <h3 className="font-medium mb-2">NDBI Statistics</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(data.ndbi_stats).map(([k, v]) => (
                    <div key={k} className="bg-card border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">{k}</p>
                      <p className="text-lg font-bold text-primary">
                        {v !== null ? v.toFixed(4) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Grid Table Tab */}
            <TabsContent value="grid" className="space-y-4">
              <h2 className="font-semibold text-lg">Grid Cell Data</h2>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Grid ID</th>
                      <th className="text-right px-4 py-2 font-medium">LST (°C)</th>
                      <th className="text-right px-4 py-2 font-medium">NDBI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.grid_table.map((row, i) => (
                      <tr key={row.grid_id} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-4 py-1.5">{row.grid_id}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">
                          {row.LST !== null ? row.LST.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums">
                          {row.NDBI !== null ? row.NDBI.toFixed(4) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                tileUrl={tileUrl}
                thumbUrl={activeLayer === "lst" ? (data as any).lst_thumb_url : (data as any).ndbi_thumb_url}
                downloadUrl={activeLayer === "lst" ? (data as any).lst_download_url : (data as any).ndbi_download_url}
                district={data.district ?? (aoi.name || "Custom")}
                title={activeLayer === "lst" ? "LST Map" : "NDBI Map"}
                classAreas={data.class_areas_km2}
              /></div>
            </TabsContent>

            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district ?? (aoi.name || "Custom")}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including LST/NDBI statistics, linear regression results, and correlation charts.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · LST & NDBI descriptive statistics ·
                  Linear regression summary (R², p-value, slope) · Bivariate map & Scatterplot · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Urban Heat Island"
                  district={data.district ?? (aoi.name || "Custom")}
                  dateRange={`${data.start_date ?? startDate} to ${data.end_date ?? endDate}`}
                  stats={{
                    "LST Mean": data.lst_stats.mean ?? 0,
                    "NDBI Mean": data.ndbi_stats.mean ?? 0,
                    "R²": data.regression?.r2 ?? 0,
                    "Slope": data.regression?.slope ?? 0,
                  }}
                  classAreas={{}}
                  extraNotes={`Urban Heat Island (UHI) analysis correlates Land Surface Temperature (LST) with the Normalized Difference Built-up Index (NDBI) using a spatial grid approach. Analysis covers ${data.district} (aoi.name || "Custom") from ${data.start_date} to ${data.end_date} with a grid size of ${data.n_cells_total} cells.`}
                  maps={[
                    ["Bivariate Map (LST x NDBI)", data.bivariate_png],
                    ["Scatterplot", data.scatter_png],
                  ]}
                  filename={`UHI_${data.district}_${data.start_date}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
