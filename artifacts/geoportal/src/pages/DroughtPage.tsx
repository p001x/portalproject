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
import { Loader2, Droplet, FileText } from "lucide-react";
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
import { api, DroughtResult , AOIConfig} from "@/lib/api";
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

const YEARS = Array.from({ length: 2024 - 2013 + 1 }, (_, i) => 2013 + i);

const DVI_COLORS = ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"];
const DVI_LABELS = ["Very Low", "Low", "Moderate", "High", "Very High"];

export function DroughtPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [year, setYear] = useState(2023);
  const [nClasses, setNClasses] = useState(5);
  const [activeLayer, setActiveLayer] = useState<"continuous" | "classified">("continuous");

  // Factor reversal states
  const [reverseSm, setReverseSm] = useState(false);
  const [reverseRf, setReverseRf] = useState(false);
  const [reverseNdvi, setReverseNdvi] = useState(false);
  const [reverseVci, setReverseVci] = useState(false);
  const [reverseLst, setReverseLst] = useState(false);
  const [reverseCdd, setReverseCdd] = useState(false);
  const [reverseEvi, setReverseEvi] = useState(false);

  const { mutate, data, isPending, error } = useMutation<DroughtResult, Error>({
    mutationFn: () =>
      api.drought({
        aoi,
                year,
        n_classes: nClasses,
        reverse_sm: reverseSm,
        reverse_rf: reverseRf,
        reverse_ndvi: reverseNdvi,
        reverse_vci: reverseVci,
        reverse_lst: reverseLst,
        reverse_cdd: reverseCdd,
        reverse_evi: reverseEvi,
      }),
  });

  const currentTileUrl = data
    ? activeLayer === "continuous"
      ? data.dvi_tile_url
      : data.dvi_class_tile_url
    : undefined;

  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Droplet className="w-5 h-5" />
          Agricultural Drought
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Drought Vulnerability Index (DVI) computed for Season B (March-June)
          using AHP weighting of SM, RF, NDVI, VCI, LST, CDD, and EVI.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label>Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {/* Factor Reversal Section */}
        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reverse Factors
          </Label>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span>Soil Moisture (SM)</span>
              <Switch checked={reverseSm} onCheckedChange={setReverseSm} />
            </div>
            <div className="flex items-center justify-between">
              <span>Rainfall Anomaly (RF)</span>
              <Switch checked={reverseRf} onCheckedChange={setReverseRf} />
            </div>
            <div className="flex items-center justify-between">
              <span>NDVI Health</span>
              <Switch checked={reverseNdvi} onCheckedChange={setReverseNdvi} />
            </div>
            <div className="flex items-center justify-between">
              <span>VCI Index</span>
              <Switch checked={reverseVci} onCheckedChange={setReverseVci} />
            </div>
            <div className="flex items-center justify-between">
              <span>LST Temp Anomaly</span>
              <Switch checked={reverseLst} onCheckedChange={setReverseLst} />
            </div>
            <div className="flex items-center justify-between">
              <span>Dry Days (CDD)</span>
              <Switch checked={reverseCdd} onCheckedChange={setReverseCdd} />
            </div>
            <div className="flex items-center justify-between">
              <span>EVI Index</span>
              <Switch checked={reverseEvi} onCheckedChange={setReverseEvi} />
            </div>
          </div>
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => mutate()}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Droplet className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Analyze Drought"}
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
            Select a study area and year, then click{" "}
            <strong className="mx-1">Analyze Drought</strong>.
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Analyzing drought vulnerability for {aoi.name}…</p>
            <p className="text-xs">GEE analysis typically takes 30–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="classify">Classification Components</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px]">
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={activeLayer === "continuous" ? "default" : "outline"}
                  onClick={() => setActiveLayer("continuous")}
                >
                  DVI Continuous
                </Button>
                <Button
                  size="sm"
                  variant={activeLayer === "classified" ? "default" : "outline"}
                  onClick={() => setActiveLayer("classified")}
                >
                  DVI Classified
                </Button>
              </div>
              <div className="h-[520px] rounded-lg overflow-hidden border">
                <DistrictMap center={data.center} tileUrl={currentTileUrl!} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {DVI_LABELS.map((label, i) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm inline-block"
                      style={{ background: DVI_COLORS[i] }}
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
                  Drought Vulnerability Index distribution across the district.
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
                <h3 className="font-medium mb-3">Drought Vulnerability Area (Season B {data.year})</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: DVI_COLORS[i % DVI_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={DVI_COLORS[i % DVI_COLORS.length]} />
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
                            style={{ background: DVI_COLORS[i % DVI_COLORS.length] }}
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
                  Quantile Classification & Components — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Breakpoints computed from the actual pixel distribution within the district for DVI and underlying components.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                {DVI_LABELS.slice(0, data.classify.n_classes).map((label, i) => (
                  <span key={label} className="flex items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: DVI_COLORS[i % DVI_COLORS.length] }}
                    />
                    {label}
                  </span>
                ))}
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
                          fill: DVI_COLORS[i % DVI_COLORS.length],
                        }))}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis unit=" km²" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                        <Bar dataKey="area" radius={[3, 3, 0, 0]}>
                          {Object.keys(panel.areas).map((_, i) => (
                            <Cell key={i} fill={DVI_COLORS[i % DVI_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              <div className="bg-card border rounded-lg p-4">
              <MapExportControls
                tileUrl={currentTileUrl!}
                thumbUrl={activeLayer === "continuous" ? data.dvi_thumb_url : data.dvi_class_thumb_url}
                downloadUrl={activeLayer === "continuous" ? data.dvi_download_url : undefined}
                district={aoi.name || "Custom"}
                title={activeLayer === "continuous" ? `DVI Map (${data.year})` : `DVI Classes Map (${data.year})`}
                classAreas={activeLayer === "classified" ? data.class_areas_km2 : undefined}
              />
              </div>
            </TabsContent>

            {/* Report */}
            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including DVI statistics, susceptibility area analysis, and classification maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · DVI statistics (min, max, mean, std) ·
                  Drought class area table · Quantile classification panels · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="Agricultural Drought"
                  district={aoi.name || "Custom"}
                  dateRange={`Season B ${data.year}`}
                  stats={data.stats as Record<string, number>}
                  classAreas={data.class_areas_km2}
                  extraNotes={`Drought Vulnerability Index (DVI) for Season B is derived using an AHP weighted combination of soil moisture (40%), rainfall (22%), NDVI (11%), VCI (11%), LST (6.5%), CDD (6.5%), and EVI (3%). Analysis covers ${data.district} district in Season B ${data.year}.`}
                  maps={data.classify?.panels?.map((p) => [p.title, p.thumb_url] as [string, string]) ?? []}
                  filename={`Drought_${data.district}_SeasonB_${data.year}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
