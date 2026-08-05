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
import { Loader2, Mountain, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, RUSLEResult , AOIConfig} from "@/lib/api";
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

const YEARS = Array.from({ length: 15 }, (_, i) => 2010 + i);

const RUSLE_COLORS = ["#1a9641","#a6d96a","#ffffbf","#fdae61","#d7191c","#7b0000"];

const FACTOR_LAYERS = [
  { key: "A", label: "A — Annual Soil Loss" },
  { key: "R", label: "R — Rainfall Erosivity" },
  { key: "K", label: "K — Soil Erodibility" },
  { key: "LS", label: "LS — Topographic Factor" },
  { key: "C", label: "C — Cover Management" },
  { key: "P", label: "P — Support Practice" },
];

export function RUSLEPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [year, setYear] = useState(2023);
  const [nClasses, setNClasses] = useState(5);
  const [reverseR, setReverseR] = useState(false);
  const [reverseK, setReverseK] = useState(false);
  const [reverseLs, setReverseLs] = useState(false);
  const [reverseC, setReverseC] = useState(false);
  const [reverseP, setReverseP] = useState(false);
  const [activeLayer, setActiveLayer] = useState("A");

  const { mutate, data, isPending, error } = useMutation<RUSLEResult, Error>({
    mutationFn: () =>
      api.rusle({
        aoi,
                year,
        n_classes: nClasses,
        reverse_r: reverseR,
        reverse_k: reverseK,
        reverse_ls: reverseLs,
        reverse_c: reverseC,
        reverse_p: reverseP,
      }),
  });


  const getActiveTileUrl = () => {
    if (!data) return "";
    if (activeLayer === "A") return data.tile_url;
    return data.factor_maps[activeLayer]?.class_tile_url ?? data.factor_maps[activeLayer]?.tile_url ?? data.tile_url;
  };

  const getActiveThumbUrl = () => {
    if (!data) return undefined;
    if (activeLayer === "risk") return (data as any).risk_index?.thumb_url;
    if (activeLayer === "A") return (data as any).factor_maps?.A?.thumb_url;
    return (data as any).factor_maps?.[activeLayer]?.class_thumb_url ?? (data as any).factor_maps?.[activeLayer]?.thumb_url;
  };

  const getActiveDownloadUrl = () => {
    if (!data) return undefined;
    if (activeLayer === "risk") return (data as any).risk_index?.download_url;
    return (data as any).factor_maps?.[activeLayer]?.download_url;
  };

  return (
    <div className="flex h-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col gap-5 p-5 overflow-y-auto">
        <div className="flex items-center gap-2 text-primary font-semibold text-lg">
          <Mountain className="w-5 h-5" />
          RUSLE Analysis
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Revised Universal Soil Loss Equation — estimates annual soil erosion from
          rainfall, soil erodibility, slope, cover and practice factors.
        </p>

        <StudyAreaSelector value={aoi} onChange={setAoi} />

        <div className="space-y-1">
          <Label>Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
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

        <div className="space-y-4 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            Reverse Factors
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-normal text-muted-foreground">Optional</span>
          </Label>
          <div className="space-y-3">
          {[
            { label: "Reverse R (Rainfall)", value: reverseR, set: setReverseR },
            { label: "Reverse K (Soil)", value: reverseK, set: setReverseK },
            { label: "Reverse LS (Slope)", value: reverseLs, set: setReverseLs },
            { label: "Reverse C (Cover)", value: reverseC, set: setReverseC },
            { label: "Reverse P (Practice)", value: reverseP, set: setReverseP },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex items-center justify-between group">
              <Label className="text-xs font-normal cursor-pointer text-muted-foreground group-hover:text-foreground transition-colors" onClick={() => set(!value)}>
                {label}
              </Label>
              <Switch checked={value} onCheckedChange={set} className="scale-75 origin-right" />
            </div>
          ))}
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
            <Mountain className="w-4 h-4" />
          )}
          {isPending ? "Computing…" : "Run RUSLE"}
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
            Select a district and year, then click <strong className="mx-1">Run RUSLE</strong>.
          </div>
        )}

        {isPending && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Computing RUSLE for {aoi.name || 'Custom'} ({year})…</p>
            <p className="text-xs">GEE analysis typically takes 15–60 seconds.</p>
          </div>
        )}

        {data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="factors">Factor Maps</TabsTrigger>
              <TabsTrigger value="risk">Risk Index</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px] space-y-3">
              <div className="flex flex-wrap gap-2">
                {FACTOR_LAYERS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveLayer(key)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="h-[520px] rounded-lg overflow-hidden border">
                <DistrictMap center={data.center} tileUrl={getActiveTileUrl()} />
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Select Map to Export:</span>
                <div className="flex flex-wrap gap-2 mb-2">
                  {FACTOR_LAYERS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveLayer(key)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <MapExportControls
                tileUrl={getActiveTileUrl()!}
                thumbUrl={getActiveThumbUrl()}
                downloadUrl={getActiveDownloadUrl()}
                district={aoi.name || "Custom"}
                title={FACTOR_LAYERS.find(l => l.key === activeLayer)?.label || "RUSLE Map"}
                classAreas={activeLayer === "risk" ? data.risk_index.class_areas_km2 : activeLayer === "A" ? data.n_class_soil_loss_km2 : undefined}
              />
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Statistics — {data.district}
                </h2>
                <p className="text-sm text-muted-foreground">Year: {data.year}</p>
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
                <h3 className="font-medium mb-3">Factor Means</h3>
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Factor</th>
                      <th className="text-right px-3 py-2 font-medium">Mean Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.factor_means).map(([factor, val], i) => (
                      <tr key={factor} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-1.5 font-medium">{factor}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="font-medium mb-3">Fixed 6-Class Soil Loss Areas</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: RUSLE_COLORS[i % RUSLE_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={RUSLE_COLORS[i % RUSLE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Factor Maps */}
            <TabsContent value="factors" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">Factor Maps — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Individual RUSLE factor layers classified and visualised per district.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {["R","K","LS","C","P"].map((key) => {
                  const factor = data.factor_maps[key];
                  if (!factor) return null;
                  return (
                    <div key={key} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground font-bold px-2 py-0.5 rounded text-sm">
                          {key}
                        </span>
                        <span className="font-medium">{factor.label}</span>
                      </div>
                      {factor.direction_desc && (
                        <p className="text-xs text-muted-foreground italic">{factor.direction_desc}</p>
                      )}
                      {factor.class_thumb_url ? (
                        <img
                          src={factor.class_thumb_url}
                          alt={`${factor.label} classified thumbnail`}
                          className="w-full rounded border object-cover"
                        />
                      ) : factor.thumb_url ? (
                        <img
                          src={factor.thumb_url}
                          alt={`${factor.label} thumbnail`}
                          className="w-full rounded border object-cover"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Risk Index */}
            <TabsContent value="risk" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">Risk Index — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Composite erosion risk index derived from all RUSLE factors.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Mean Risk Index</p>
                  <p className="text-2xl font-bold text-primary">{data.risk_index.mean}</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Std Deviation</p>
                  <p className="text-2xl font-bold text-primary">{data.risk_index.std_dev}</p>
                </div>
              </div>

              {data.risk_index.thumb_url && (
                <div className="flex justify-center">
                  <img
                    src={data.risk_index.thumb_url}
                    alt="Risk Index thumbnail"
                    className="max-w-lg w-full rounded-lg border"
                  />
                </div>
              )}

              <div>
                <h3 className="font-medium mb-3">Risk Class Areas</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.risk_index.class_areas_km2).map(([k, v], i) => ({
                      name: k,
                      area: v,
                      fill: RUSLE_COLORS[i % RUSLE_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="area" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.risk_index.class_areas_km2).map((_, i) => (
                        <Cell key={i} fill={RUSLE_COLORS[i % RUSLE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* ── Report ── */}
            <TabsContent value="report" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">PDF Report — {data.district}</h2>
                <p className="text-sm text-muted-foreground">
                  Download a full PDF report including soil loss statistics, factor summaries, and risk maps.
                </p>
              </div>
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Contents:</strong> District metadata · Soil loss statistics ·
                  Factor means (R, K, LS, C, P) · Risk class area table · Maps · Methodology notes.
                </p>
                <ReportDownloadButton aoi={aoi}
                  moduleName="RUSLE Soil Erosion"
                  district={aoi.name || "Custom"}
                  dateRange={`Year: ${data.year}`}
                  stats={{
                    ...data.stats,
                    "Mean R": data.factor_means.R,
                    "Mean K": data.factor_means.K,
                    "Mean LS": data.factor_means.LS,
                    "Mean C": data.factor_means.C,
                    "Mean P": data.factor_means.P,
                  }}
                  classAreas={data.class_areas_km2}
                  extraNotes={`Soil loss is estimated using the Revised Universal Soil Loss Equation (RUSLE). Analysis covers ${data.district} district for the year ${data.year}.`}
                  maps={[
                    ["Soil Loss Map", data.tile_url],
                    ["Erosion Risk Index", data.risk_index.thumb_url]
                  ]}
                  filename={`RUSLE_${data.district}_${data.year}.pdf`}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
