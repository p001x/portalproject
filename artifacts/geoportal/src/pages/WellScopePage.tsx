import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Loader2, Waves, FileText, Printer, AlertTriangle, Info, Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, AOIConfig } from "@/lib/api";
import { DistrictMap, LegendItem } from "@/components/DistrictMap";
import { StudyAreaSelector } from "@/components/StudyAreaSelector";
import { MapExportControls } from "@/components/MapExportControls";

const PALETTES = [
  { name: "Default (Score Vis)", value: "default" },
  { name: "Red to Green", value: "d73027,fc8d59,fee08b,91cf60,1a9850" },
  { name: "Blue to Red", value: "313695,74add1,fee090,f46d43,a50026" },
  { name: "Spectral", value: "d53e4f,fc8d59,fee08b,e6f598,99d594,3288bd" },
  { name: "Viridis", value: "440154,414487,2a788e,22a884,7ad151,fde725" },
  { name: "Magma", value: "000004,3b0f70,8c2981,de4968,fe9f6d,fcfdbf" },
  { name: "Grayscale", value: "000000,ffffff" },
];

const FACTOR_KEYS = ["rainfall", "lithology", "slope", "twi", "drainage", "dist_water", "lulc"] as const;
type FactorKey = typeof FACTOR_KEYS[number];

const FACTOR_LABELS: Record<FactorKey, string> = {
  rainfall: "Rainfall",
  lithology: "Lithology",
  slope: "Slope",
  twi: "Topographic Wetness",
  drainage: "Drainage Density",
  dist_water: "Distance to Water",
  lulc: "Land Cover",
};

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  rainfall: 30, lithology: 21, slope: 15, twi: 15, drainage: 9, dist_water: 6, lulc: 4,
};

const SUITABILITY_LEGEND: LegendItem[] = [
  { color: "#d73027", label: "Very Low (0-19)" },
  { color: "#fc8d59", label: "Low (20-39)" },
  { color: "#fee08b", label: "Moderate (40-59)" },
  { color: "#91cf60", label: "High (60-79)" },
  { color: "#1a9850", label: "Very High (80-100)" },
];

const SCORE_LEGEND: LegendItem[] = [
  { color: "#1a9850", label: "Score 5 – Most suitable" },
  { color: "#d9ef8b", label: "Score 4" },
  { color: "#fee08b", label: "Score 3" },
  { color: "#f46d43", label: "Score 2" },
  { color: "#d73027", label: "Score 1 – Least suitable" },
];

const CLASS_COLOR_LIST = ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"];

function loadWeights(district: string): Record<FactorKey, number> {
  try {
    const stored = localStorage.getItem(`wellscope_weights_${district}`);
    if (stored) return { ...DEFAULT_WEIGHTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_WEIGHTS };
}

function saveWeights(district: string, w: Record<FactorKey, number>) {
  try { localStorage.setItem(`wellscope_weights_${district}`, JSON.stringify(w)); } catch { /* ignore */ }
}

function normalize(w: Record<FactorKey, number>): Record<FactorKey, number> {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total === 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(
    FACTOR_KEYS.map((k) => [k, Math.round((w[k] / total) * 1000) / 10])
  ) as Record<FactorKey, number>;
}

function SmallNorthArrow() {
  return (
    <svg width="18" height="22" viewBox="0 0 28 36" fill="none">
      <polygon points="14,2 20,18 14,14 8,18" fill="#111" />
      <polygon points="14,34 8,18 14,22 20,18" fill="#888" />
      <text x="14" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#fff" dy="-1">N</text>
    </svg>
  );
}

function FactorMapCard({ factorKey, factor, analysisDate }: {
  factorKey: string;
  factor: any;
  analysisDate: string;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.label}</h4>
        <p className="text-sm text-muted-foreground">
          Weight: {factor.weight_pct}%
        </p>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group">
        <img src={factor.thumb_url} alt={factor.label} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300" />
        
        <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded pointer-events-none"></div>

        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur shadow-sm p-1.5 rounded text-[10px] uppercase font-bold text-slate-700 tracking-wider">
          Score Map
        </div>
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur shadow-sm p-1.5 rounded text-[9px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-1">
          <span className="text-slate-400">Scale:</span> 1 : 100,000
        </div>
        <div className="absolute bottom-2 right-2 drop-shadow-md">
          <SmallNorthArrow />
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <div className="w-16 h-2 rounded-sm bg-gradient-to-r from-[#d73027] via-[#fee08b] to-[#1a9850]" />
          Low → High Score
        </span>
        <span className="text-[10px] uppercase">{analysisDate}</span>
      </div>
    </div>
  );
}

function InteractiveFactorMapCard({ factorKey, factor, aoiConfig }: { factorKey: string; factor: any; aoiConfig: AOIConfig }) {
  const [selectedPalette, setSelectedPalette] = useState("default");
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<{ thumb_url: string; download_url: string | null }>({
    thumb_url: factor.thumb_url,
    download_url: null,
  });

  const generateExport = async () => {
    try {
      setLoading(true);
      const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
      const res = await api.wellscope.factorExport({
        aoi: aoiConfig,
        factor_key: factorKey,
        palette: paletteParam
      });
      setUrls(res.data);
    } catch (err) {
      console.error("Failed to generate export", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Optionally fetch immediately on palette change, but let's wait for user to click a button to save API calls
    // Actually, generating the thumb on palette change is nice for preview!
    if (selectedPalette !== "default") {
      generateExport();
    } else {
      setUrls({ thumb_url: factor.thumb_url, download_url: null });
    }
  }, [selectedPalette]);

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-white shadow-sm flex flex-col">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.label}</h4>
        <p className="text-sm text-muted-foreground">
          Weight: {factor.weight_pct}%
        </p>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : null}
        <img src={urls.thumb_url} alt={factor.label} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300" />
      </div>

      <div className="space-y-3 pt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-500">Color Palette</Label>
          <Select value={selectedPalette} onValueChange={setSelectedPalette} disabled={loading}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={() => {
              const link = document.createElement('a');
              link.href = urls.thumb_url;
              link.download = `wellscope_${factorKey}_classified.png`;
              link.click();
            }}
          >
            <ImageIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Classified (PNG)
          </Button>
          
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={async () => {
              if (urls.download_url) {
                window.open(urls.download_url, '_blank');
              } else {
                await generateExport(); // This sets urls
                // Need to use state after it updates, so we cheat a little by using the API again or waiting
                const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
                api.wellscope.factorExport({
                  aoi: aoiConfig,
                  factor_key: factorKey,
                  palette: paletteParam
                }).then(res => {
                  window.open(res.data.download_url, '_blank');
                });
              }
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Raw (GeoTIFF)
          </Button>
        </div>
      </div>
    </div>
  );
}

function printReport(data: any, analysisDate: string) {
  const total = Object.values(data.class_areas_km2).reduce((a: any, b: any) => a + b, 0) as number;

  const factorRows = Object.entries(data.factor_maps).map(([, f]: any) => `
    <tr>
      <td>${f.label}</td>
      <td style="text-align:center">${f.weight_pct}%</td>
      <td>Normal</td>
    </tr>`).join("");

  const matrixLabels = data.ahp_data.factor_labels;
  const matrixRows = data.ahp_data.matrix.map((row: any, i: number) => `
    <tr>
      <td><strong>${matrixLabels[i]}</strong></td>
      ${row.map((v: any) => `<td style="text-align:center">${v.toFixed(2)}</td>`).join("")}
    </tr>`).join("");

  const areaRows = Object.entries(data.class_areas_km2).map(([cls, km2]: any, i) => `
    <tr>
      <td>${cls}</td>
      <td style="text-align:right">${km2} km²</td>
      <td style="text-align:right">${total > 0 ? ((km2 / total) * 100).toFixed(1) : "—"}%</td>
    </tr>`).join("");

  const factorThumbs = Object.entries(data.factor_maps).map(([, f]: any) => `
    <div style="break-inside:avoid;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;padding:8px">
      <p style="margin:0 0 4px;font-weight:600;font-size:13px">${f.label} — Weight: ${f.weight_pct}%</p>
      <img src="${f.thumb_url}" style="width:100%;border-radius:4px;border:1px solid #eee" alt="${f.label}" />
      <p style="margin:4px 0 0;font-size:10px;color:#888">Score 1 (Least suitable) → 5 (Most suitable) · Source: Google Earth Engine</p>
    </div>`).join("");

  const vhKm2 = (data.class_areas_km2["Very High (80-100)"] as number) ?? 0;
  const hKm2 = (data.class_areas_km2["High (60-79)"] as number) ?? 0;
  const hsKm2 = vhKm2 + hKm2;
  const vlKm2 = (data.class_areas_km2["Very Low (0-19)"] as number) ?? 0;
  const lKm2 = (data.class_areas_km2["Low (20-39)"] as number) ?? 0;
  const unKm2 = vlKm2 + lKm2;
  const hsPct = total > 0 ? ((hsKm2 / total) * 100).toFixed(1) : "0";
  const unPct = total > 0 ? ((unKm2 / total) * 100).toFixed(1) : "0";

  const interpretation = `
    The multi-criteria weighted overlay analysis for <strong>${data.district}</strong> identifies 
    <strong>${hsPct}%</strong> of the study area (${hsKm2.toFixed(2)} km²) as High to Very High potential for groundwater, 
    while <strong>${unPct}%</strong> (${unKm2.toFixed(2)} km²) is classified as Low to Very Low potential. 
    The analysis applies AHP-derived weights based on 7 factors, including Rainfall, Lithology, and Topography. 
    The AHP consistency ratio (CR = ${data.ahp_data.cr.toFixed(2)}) confirms the weight assignments are 
    ${data.ahp_data.consistent ? "acceptable (CR < 0.10)" : "inconsistent — consider revising weights"}.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WellScope Suitability Report — ${data.district}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #222; margin: 0; padding: 24px 36px; }
    h1 { font-size: 20px; margin: 0 0 2px; color: #1a5c2e; }
    h2 { font-size: 15px; border-bottom: 2px solid #1a5c2e; padding-bottom: 4px; margin: 20px 0 10px; color: #1a5c2e; }
    h3 { font-size: 13px; margin: 12px 0 6px; }
    .header-bar { background: #1a5c2e; color: #fff; padding: 12px 18px; border-radius: 6px; margin-bottom: 20px; }
    .header-bar p { margin: 2px 0; font-size: 12px; opacity: 0.9; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; }
    .stat-card .val { font-size: 22px; font-weight: 700; color: #1a5c2e; }
    .stat-card .lbl { font-size: 11px; color: #666; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
    th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ddd; }
    td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .cr-box { display: inline-block; padding: 6px 14px; border-radius: 4px; font-size: 13px; font-weight: 600; margin-top: 6px; }
    .cr-good { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .cr-bad  { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .factor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .final-map img { width: 100%; border-radius: 6px; border: 1px solid #ddd; }
    .interpretation { background: #f8f9fa; border-left: 4px solid #1a5c2e; padding: 10px 14px; border-radius: 0 6px 6px 0; line-height: 1.6; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    @media print {
      body { padding: 12px 20px; }
      .no-print { display: none !important; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="background:#1a5c2e;color:#fff;border:none;border-radius:5px;padding:8px 18px;cursor:pointer;font-size:13px">
      🖨 Print / Save as PDF
    </button>
  </div>

  <div class="header-bar">
    <h1>WellScope Groundwater Potential Report</h1>
    <p><strong>District / Area:</strong> ${data.district} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Date:</strong> ${analysisDate}</p>
  </div>

  <h2>1. Final Suitability Overview</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="val">${data.stats["Mean Suitability"]}/100</div>
      <div class="lbl">Mean Suitability Score</div>
    </div>
    <div class="stat-card">
      <div class="val">${hsKm2.toFixed(1)} <span style="font-size:12px;font-weight:normal">km²</span></div>
      <div class="lbl">High/Very High Potential Area</div>
    </div>
    <div class="stat-card">
      <div class="val">${hsPct}%</div>
      <div class="lbl">% Highly Suitable</div>
    </div>
  </div>

  <div class="final-map">
    <img src="${data.thumb_url}" alt="Final Suitability Map" />
    <p style="margin:6px 0 0;font-size:11px;color:#666">
      <strong>Red:</strong> Very Low (0-19) &nbsp;|&nbsp; 
      <strong>Orange:</strong> Low (20-39) &nbsp;|&nbsp; 
      <strong>Yellow:</strong> Moderate (40-59) &nbsp;|&nbsp; 
      <strong>Light Green:</strong> High (60-79) &nbsp;|&nbsp;
      <strong>Dark Green:</strong> Very High (80-100)
    </p>
  </div>

  <div class="interpretation" style="margin-top:16px">
    ${interpretation}
  </div>

  <h2>2. Suitability Class Distribution</h2>
  <table>
    <tr><th>Class</th><th style="text-align:right">Area (km²)</th><th style="text-align:right">% of Total</th></tr>
    ${areaRows}
    <tr style="font-weight:bold;background:#eee">
      <td>Total Area</td>
      <td style="text-align:right">${total.toFixed(2)} km²</td>
      <td style="text-align:right">100.0%</td>
    </tr>
  </table>

  <div style="page-break-before: always"></div>

  <h2>3. AHP Configuration & Consistency</h2>
  <p>The Suitability Index was derived using the Analytical Hierarchy Process (AHP) with the following parameters:</p>
  
  <h3>Factor Weights</h3>
  <table>
    <tr><th>Factor</th><th style="text-align:center">Assigned Weight</th><th>Relationship</th></tr>
    ${factorRows}
  </table>

  <h3>Pairwise Comparison Matrix</h3>
  <table>
    <tr>
      <th>Matrix</th>
      ${matrixLabels.map((lbl: any) => `<th style="text-align:center">${lbl}</th>`).join("")}
    </tr>
    ${matrixRows}
  </table>

  <div style="background:#f4f4f4;padding:12px 16px;border-radius:6px;margin-top:12px">
    <p style="margin:0 0 6px"><strong>Consistency Analysis</strong></p>
    <ul style="margin:0;padding-left:20px;font-size:12px">
      <li>Principal Eigenvalue (λ_max) = ${data.ahp_data.lambda_max.toFixed(3)}</li>
      <li>Consistency Index (CI) = ${data.ahp_data.ci.toFixed(3)}</li>
      <li>Random Index (RI) = ${data.ahp_data.ri.toFixed(2)}</li>
    </ul>
    <div class="cr-box ${data.ahp_data.consistent ? 'cr-good' : 'cr-bad'}">
      Consistency Ratio (CR) = ${data.ahp_data.cr.toFixed(3)}
      ${data.ahp_data.consistent ? " ✓ Acceptable" : " ⚠ Revision Recommended"}
    </div>
  </div>

  <div style="page-break-before: always"></div>

  <h2>4. Individual Factor Maps</h2>
  <p style="margin-bottom:16px">The following maps display the standardized scores (1-5) for each individual criterion prior to weighted summation.</p>
  
  <div class="factor-grid">
    ${factorThumbs}
  </div>

  <div class="footer">
    <p>Report generated by WellScope (GeoPortal) on ${new Date().toLocaleString()}. This tool is designed for pre-screening and strategic planning. Field verification and formal geophysical surveys are required prior to drilling.</p>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export function WellScopePage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", province: "Kigali City", name: "Gasabo" });
  const [activeTab, setActiveTab] = useState("map");

  const effectiveDistrictName = aoi.name || "Custom Study Area";
  
  const [weights, setWeights] = useState<Record<FactorKey, number>>(() => loadWeights(effectiveDistrictName));

  useEffect(() => {
    setWeights(loadWeights(effectiveDistrictName));
  }, [effectiveDistrictName]);

  const handleWeightChange = useCallback((key: FactorKey, val: number[]) => {
    setWeights((prev) => {
      const next = { ...prev, [key]: val[0] };
      saveWeights(effectiveDistrictName, next);
      return next;
    });
  }, [effectiveDistrictName]);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const normalizedWeights = normalize(weights);

  const getReq = () => ({ aoi, custom_weights: normalizedWeights });

  const mapMutation = useMutation({ mutationFn: async () => api.wellscope.map(getReq()), onSuccess: () => setActiveTab("map") });
  const statsMutation = useMutation({ mutationFn: async () => api.wellscope.stats(getReq()) });

  const runAnalysis = () => {
    mapMutation.mutate();
    statsMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending;
  const anyData = mapMutation.data || statsMutation.data;
  
  const mapData = mapMutation.data;
  const statsData = statsMutation.data;
  
  const error = mapMutation.error || statsMutation.error;
  
  const handlePrint = () => {
    if (!mapData || !statsData) return;
    const fullData = { ...mapData, ...statsData, district: effectiveDistrictName };
    printReport(fullData, new Date().toLocaleDateString());
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">WellScope: Groundwater Potential Suitability</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            A 7-factor weighted overlay screening tool to evaluate groundwater potential. 
            <strong> Pre-screening only: does not guarantee water presence or yield.</strong>
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Pre-screening Tool Only</p>
          <p>
            WellScope predicts relative groundwater potential based on satellite-derived surface factors (Rainfall, Lithology, Slope, TWI, Drainage Density, Surface Water Proximity, and LULC). 
            It is <strong>not a substitute for a formal geophysical survey (e.g., VES)</strong> prior to drilling, and does not guarantee depth to water or yield. 
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg shadow-sm flex flex-col h-[calc(100vh-210px)] sticky top-20">
            <h3 className="font-semibold text-lg flex items-center border-b p-5 shrink-0 gap-2">
              <Waves className="w-5 h-5 text-blue-500" />
              Configuration
            </h3>
            
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-8">
                <div className="space-y-3">
                  <StudyAreaSelector value={aoi} onChange={setAoi} />
                  <p className="text-xs text-muted-foreground">Select a district or draw an area to screen for groundwater potential.</p>
                </div>

                <div className="space-y-4 pt-2 border-t">
                  <div>
                    <h4 className="font-medium text-sm">AHP Factor Weights</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">Adjust relative importance of each criterion. Weights are auto-normalized to 100%.</p>
                  </div>
                  
                  {FACTOR_KEYS.map((k) => {
                    const normPct = normalizedWeights[k];
                    return (
                      <div key={k} className="space-y-2 bg-slate-50/50 p-2.5 rounded-md border border-slate-100">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-medium">{FACTOR_LABELS[k]}</Label>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {normPct.toFixed(1)}%
                          </span>
                        </div>
                        <Slider
                          value={[weights[k]]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) => handleWeightChange(k, v)}
                          className="py-1"
                        />
                      </div>
                    );
                  })}
                  
                  <div className={"flex justify-between items-center text-xs font-semibold p-2 rounded " + (totalWeight === 100 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
                    <span>Raw Sum: {totalWeight}</span>
                    <span>{totalWeight !== 100 && "(Auto-normalized)"}</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            </ScrollArea>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Calculating..." : "Run Suitability Model"}
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col h-[calc(100vh-210px)] sticky top-20">
          {error ? (
             <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-red-50 text-red-500 p-6 text-center">
               <Info className="w-10 h-10 mb-4" />
               <p className="text-lg font-bold">Analysis Failed</p>
               <p className="text-sm mt-2">{error.message}</p>
             </div>
          ) : isPending && !anyData ? (
            <div className="h-full border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Computing weighted overlay suitability...</p>
            </div>
          ) : anyData ? (
            <div className="bg-card border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
                <div className="border-b px-4 py-2 shrink-0 flex items-center justify-between bg-slate-50/50">
                  <TabsList>
                    <TabsTrigger value="map">Map</TabsTrigger>
                    <TabsTrigger value="statistics">Statistics</TabsTrigger>
                    <TabsTrigger value="factor-maps">Factor Maps</TabsTrigger>
                    <TabsTrigger value="static-maps">Static Maps</TabsTrigger>
                    <TabsTrigger value="report">
                      <FileText className="w-4 h-4 mr-2" />
                      Report
                    </TabsTrigger>
                  </TabsList>
                  {activeTab === "report" && mapData && (
                    <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 shadow-sm">
                      <Printer className="w-4 h-4 mr-2" />
                      Print / Save PDF
                    </Button>
                  )}
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <TabsContent value="map" className="h-full w-full m-0 data-[state=active]:flex flex-col">
                    {mapData ? (
                      <div className="flex-1 relative bg-slate-100">
                        <DistrictMap
                          tileUrl={mapData.tile_url}
                          center={mapData.center}
                          bbox={mapData.bbox as unknown as number[][]}
                          title="Groundwater Potential (0-100)"
                          legend={SUITABILITY_LEGEND}
                        />
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Map data unavailable</div>
                    )}
                  </TabsContent>

                  <TabsContent value="statistics" className="h-full w-full m-0 p-6 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-5xl mx-auto space-y-8">
                      {statsData && mapData && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                              Area Distribution
                            </h3>
                            <div className="space-y-3">
                              {Object.entries(statsData.class_areas_km2).map(([cls, area]: [string, any], i) => {
                                const total = Object.values(statsData.class_areas_km2).reduce((a: any, b: any) => a + b, 0) as number;
                                const pct = total > 0 ? (area / total) * 100 : 0;
                                return (
                                  <div key={cls} className="space-y-1.5">
                                    <div className="flex justify-between text-sm">
                                      <span className="font-medium text-slate-700">{cls}</span>
                                      <span className="text-muted-foreground">{area.toFixed(1)} km² ({pct.toFixed(1)}%)</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div 
                                        className="h-full rounded-full transition-all duration-1000 ease-out" 
                                        style={{ width: `${pct}%`, backgroundColor: CLASS_COLOR_LIST[i] }} 
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-6 border flex flex-col justify-center">
                            <p className="text-sm text-slate-600 mb-2">Mean Suitability Index</p>
                            <div className="text-4xl font-bold text-slate-800">
                              {statsData.stats["Mean Suitability"]}<span className="text-lg text-slate-400 font-normal ml-1">/ 100</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200/60">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-500">Min Score</span>
                                <span className="font-medium">{statsData.stats["Min Suitability"]}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Max Score</span>
                                <span className="font-medium">{statsData.stats["Max Suitability"]}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="factor-maps" className="h-full w-full m-0 p-6 overflow-y-auto">
                    <div className="max-w-7xl mx-auto space-y-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Factor Maps</h3>
                        <p className="text-sm text-muted-foreground">Customize colors and download individual criteria maps.</p>
                      </div>
                      {mapData?.factor_maps ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-4 border-t">
                          {Object.entries(mapData.factor_maps).map(([key, f]: [string, any]) => (
                            <InteractiveFactorMapCard 
                              key={key} 
                              factorKey={key} 
                              factor={f} 
                              aoiConfig={aoi}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="pt-8 text-center text-muted-foreground flex flex-col items-center">
                          <Info className="w-8 h-8 mb-2 opacity-50" />
                          <p>Please run the Suitability Model first to view factor maps.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="static-maps" className="h-full w-full m-0 p-6 overflow-y-auto">
                    <div className="max-w-6xl mx-auto space-y-4">
                      <div>
                        <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                        <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
                      </div>
                      {mapData ? (
                        <div className="bg-card border rounded-lg p-4">
                          <MapExportControls
                            district={effectiveDistrictName}
                            title="Groundwater Potential Suitability"
                            tileUrl={mapData.tile_url}
                            thumbUrl={mapData.thumb_url}
                            legend={SUITABILITY_LEGEND}
                          />
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="report" className="h-full w-full m-0 overflow-y-auto bg-slate-50/50">
                    <div className="max-w-5xl mx-auto p-8 space-y-10">
                      <div className="bg-white border rounded-xl p-8 shadow-sm">
                        <div className="flex items-start justify-between border-b pb-6 mb-8">
                          <div>
                            <h2 className="text-2xl font-bold text-slate-800">Groundwater Potential Assessment</h2>
                            <p className="text-muted-foreground mt-1 flex items-center gap-2">
                              <span className="font-medium text-foreground">{effectiveDistrictName}</span>
                              <span className="text-slate-300">•</span>
                              <span>Analyzed on {new Date().toLocaleDateString()}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 text-blue-600 mb-2 ring-4 ring-blue-50/50">
                              <Waves className="w-6 h-6" />
                            </div>
                          </div>
                        </div>

                        {mapData?.ahp_data && (
                          <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-6 bg-purple-500 rounded-full" />
                              AHP Consistency Verification
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="border rounded-md p-3 bg-white">
                                <div className="text-xs text-slate-500 mb-1">Principal Eigenvalue (λ_max)</div>
                                <div className="font-semibold">{mapData.ahp_data.lambda_max.toFixed(3)}</div>
                              </div>
                              <div className="border rounded-md p-3 bg-white">
                                <div className="text-xs text-slate-500 mb-1">Consistency Index (CI)</div>
                                <div className="font-semibold">{mapData.ahp_data.ci.toFixed(3)}</div>
                              </div>
                              <div className="border rounded-md p-3 bg-white">
                                <div className="text-xs text-slate-500 mb-1">Random Index (RI)</div>
                                <div className="font-semibold">{mapData.ahp_data.ri.toFixed(2)}</div>
                              </div>
                              <div className={`border rounded-md p-3 ${mapData.ahp_data.consistent ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                                <div className={`text-xs mb-1 ${mapData.ahp_data.consistent ? "text-green-700" : "text-red-700"}`}>Consistency Ratio (CR)</div>
                                <div className={`font-bold ${mapData.ahp_data.consistent ? "text-green-800" : "text-red-800"}`}>
                                  {mapData.ahp_data.cr.toFixed(3)}
                                  <span className="text-xs font-normal ml-2 bg-white/50 px-1.5 py-0.5 rounded">
                                    {mapData.ahp_data.consistent ? "Acceptable (< 0.10)" : "Inconsistent"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
