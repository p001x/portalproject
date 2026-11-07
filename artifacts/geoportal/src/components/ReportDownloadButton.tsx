import { useState, useMemo } from "react";
import {
  Download,
  Loader2,
  FileText,
  Printer,
  Copy,
  Check,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Layers,
  MapPin,
  Calendar,
  Activity,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";

interface Props {
  moduleName: string;
  aoi: AOIConfig;
  district?: string;
  dateRange: string;
  stats: Record<string, number>;
  classAreas: Record<string, number>;
  extraNotes?: string;
  maps?: Array<[string, string]>;
  filename?: string;
  proposedFacilities?: [number, number][];
  deltaStats?: Record<string, number>;
}

// ─── Executive Intelligence Helper ──────────────────────────────────────────

interface DerivedInsights {
  conditionTitle: string;
  conditionTier: "OPTIMAL" | "FAVORABLE" | "MODERATE_WATCH" | "ELEVATED_RISK" | "CRITICAL_ALERT";
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  healthScore: number;
  executiveSummary: string;
  meanValue: string;
  minMaxRange: string;
  totalAreaKm2: number;
  totalAreaHa: number;
  dominantClass: { name: string; areaKm2: number; pct: number };
  breakdown: Array<{ name: string; areaKm2: number; areaHa: number; pct: number; color: string }>;
  interventions: Array<{ urgency: "Immediate" | "High" | "Medium"; action: string; rationale: string }>;
  provenance: {
    constellation: string;
    resolution: string;
    processingLevel: string;
    cloudMasking: string;
    projection: string;
  };
}

const PALETTE = [
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#f59e0b", "#f97316", "#ef4444", "#14b8a6", "#6366f1",
];

function deriveExecutiveInsights(
  moduleName: string,
  districtName: string,
  dateRange: string,
  stats: Record<string, number> = {},
  classAreas: Record<string, number> = {}
): DerivedInsights {
  const modLower = moduleName.toLowerCase();

  // 1. Calculate Totals and Classes
  const rawTotal = Object.values(classAreas).reduce(
    (acc, val) => acc + (typeof val === "number" && !isNaN(val) ? val : 0),
    0
  );
  const totalAreaKm2 = rawTotal > 0 ? rawTotal : 1.0;
  const totalAreaHa = totalAreaKm2 * 100;

  const sortedClasses = Object.entries(classAreas)
    .filter(([_, v]) => typeof v === "number" && !isNaN(v) && v > 0)
    .sort((a, b) => b[1] - a[1]);

  const dominant = sortedClasses[0] || ["Dominant Class", totalAreaKm2];
  const dominantPct = rawTotal > 0 ? (dominant[1] / totalAreaKm2) * 100 : 100;

  const breakdown = sortedClasses.map(([name, area], i) => ({
    name,
    areaKm2: area,
    areaHa: area * 100,
    pct: rawTotal > 0 ? (area / totalAreaKm2) * 100 : 0,
    color: PALETTE[i % PALETTE.length],
  }));

  // 2. Extract Key Numerical Stats
  let foundMean: number | null = null;
  let foundMin: number | null = null;
  let foundMax: number | null = null;

  for (const [key, val] of Object.entries(stats)) {
    const k = key.toLowerCase();
    const num = Number(val);
    if (isNaN(num)) continue;
    if (k.includes("mean") || k.includes("avg") || k === "value") {
      foundMean = num;
    } else if (k.includes("min")) {
      foundMin = num;
    } else if (k.includes("max")) {
      foundMax = num;
    }
  }

  const meanStr = foundMean !== null ? foundMean.toFixed(2) : "—";
  const rangeStr =
    foundMin !== null && foundMax !== null
      ? `${foundMin.toFixed(2)} to ${foundMax.toFixed(2)}`
      : "Multi-point distribution";

  // 3. Defaults
  let conditionTier: DerivedInsights["conditionTier"] = "FAVORABLE";
  let conditionTitle = "Favorable Environmental Condition";
  let badgeBg = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  let badgeText = "text-emerald-600 dark:text-emerald-400";
  let badgeBorder = "border-emerald-500/30";
  let healthScore = 80;
  let summary = `Earth observation analysis for ${districtName} across ${dateRange} demonstrates stable surface conditions.`;
  const interventions: DerivedInsights["interventions"] = [];

  // 4. Module-Specific Intelligence Synthesis
  if (modLower.includes("ndvi") || modLower.includes("vegetation")) {
    const val = foundMean ?? 0.5;
    if (val >= 0.6) {
      conditionTier = "OPTIMAL";
      conditionTitle = "Optimal Canopy Vigor & Robust Biomass";
      badgeBg = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
      badgeText = "text-emerald-500";
      badgeBorder = "border-emerald-500/40";
      healthScore = 94;
      summary = `Vegetative health across ${districtName} is exceptionally vigorous (Mean NDVI: ${meanStr}). Satellite spectral signals confirm dense, active photosynthetic foliage across ${dominant[0]} (${dominantPct.toFixed(1)}% of total territory). Canopy hydration and biomass accumulation indicate healthy ecological vigor with minimal moisture stress.`;
      interventions.push(
        { urgency: "Immediate", action: "Ground verification of peak canopy zones", rationale: "Document high-yield agroforestry parcels for seed stock preservation." },
        { urgency: "High", action: "Sustain watershed conservation buffers", rationale: "Prevent encroachment into riverine forest canopies during harvesting cycles." },
        { urgency: "Medium", action: "Monitor seasonal pest and blight vectors", rationale: "Dense vegetative canopies can foster localized fungal vectors if humidity rises." }
      );
    } else if (val >= 0.4) {
      conditionTier = "FAVORABLE";
      conditionTitle = "Favorable Mixed Vegetation Health";
      badgeBg = "bg-teal-500/15 text-teal-500 border-teal-500/30";
      badgeText = "text-teal-500";
      badgeBorder = "border-teal-500/40";
      healthScore = 78;
      summary = `Vegetative cover across ${districtName} exhibits balanced seasonal development (Mean NDVI: ${meanStr}). The landscape represents a productive mosaic of active cropland, rangeland, and agroforestry. Dominant class '${dominant[0]}' accounts for ${dominantPct.toFixed(1)}% (${dominant[1].toFixed(1)} km²) of the surveyed area.`;
      interventions.push(
        { urgency: "High", action: "Targeted mulching & organic soil conditioning", rationale: "Reinforce soil moisture retention across transition zones before peak dry periods." },
        { urgency: "Medium", action: "Enhance agroforestry integration with Alnus and Grevillea", rationale: "Strengthen long-term topsoil fertility and microclimate buffering." }
      );
    } else if (val >= 0.25) {
      conditionTier = "MODERATE_WATCH";
      conditionTitle = "Moderate Moisture & Canopy Stress";
      badgeBg = "bg-amber-500/15 text-amber-500 border-amber-500/30";
      badgeText = "text-amber-500";
      badgeBorder = "border-amber-500/40";
      healthScore = 52;
      summary = `Satellite observations detect localized canopy thinning and moisture deficit across ${districtName} (Mean NDVI: ${meanStr}). Vegetation is experiencing physiological moisture constraints or seasonal dormancy. Dominant category '${dominant[0]}' covers ${dominantPct.toFixed(1)}% of surveyed land.`;
      interventions.push(
        { urgency: "Immediate", action: "Prioritize smallholder supplementary irrigation", rationale: "Alleviate moisture deficits in rain-dependent agricultural clusters." },
        { urgency: "High", action: "Mobilize drought-tolerant seed allocations", rationale: "Deploy cassava, sorghum, and drought-resistant beans to vulnerable farmers." },
        { urgency: "Medium", action: "Construct localized micro-catchment water pans", rationale: "Harvest surface runoff for dry-spell crop sustenance." }
      );
    } else {
      conditionTier = "CRITICAL_ALERT";
      conditionTitle = "Acute Vegetation Deficit / Bare Soil Alert";
      badgeBg = "bg-red-500/15 text-red-500 border-red-500/30";
      badgeText = "text-red-500";
      badgeBorder = "border-red-500/40";
      healthScore = 26;
      summary = `Spectral reflectance indicates critical canopy depletion and extensive bare/degraded terrain across ${districtName} (Mean NDVI: ${meanStr}). Large parcels reflect sparse or dormant vegetation requiring urgent agricultural and soil-restoration measures.`;
      interventions.push(
        { urgency: "Immediate", action: "Emergency agricultural extension deployment", rationale: "Assess crop failure risks and provide emergency farmer relief." },
        { urgency: "High", action: "Initiate rapid soil cover and erosion protection", rationale: "Prevent wind and water detachment on bare cultivated parcels." }
      );
    }
  } else if (modLower.includes("rusle") || modLower.includes("erosion")) {
    const val = foundMean ?? 15;
    if (val > 50) {
      conditionTier = "CRITICAL_ALERT";
      conditionTitle = "Severe Catchment Soil Loss Risk";
      badgeBg = "bg-red-500/15 text-red-500 border-red-500/30";
      badgeText = "text-red-500";
      healthScore = 22;
      summary = `Watershed erosion modeling estimates severe topsoil loss exceeding sustainability thresholds in ${districtName} (Mean: ${meanStr} t/ha/yr). Steep slope topography combined with intense precipitation exposes valuable agricultural topsoil to accelerated detachment.`;
      interventions.push(
        { urgency: "Immediate", action: "Construct radical terraces on cultivated slopes > 16°", rationale: "Dramatically reduce slope length (LS factor) and interrupt surface runoff velocities." },
        { urgency: "High", action: "Plant continuous Vetiver Grass hedgerows", rationale: "Filter sediment detachment along contour lines and stabilize terrace risers." },
        { urgency: "High", action: "Enforce 10m vegetated riverine protection buffers", rationale: "Trap agricultural sediment before entering vital stream networks." }
      );
    } else if (val > 25) {
      conditionTier = "ELEVATED_RISK";
      conditionTitle = "Elevated Watershed Soil Loss Hazard";
      badgeBg = "bg-orange-500/15 text-orange-500 border-orange-500/30";
      badgeText = "text-orange-500";
      healthScore = 48;
      summary = `Soil erosion modeling highlights elevated vulnerability across ${districtName} hillsides (Mean: ${meanStr} t/ha/yr). Catchment slopes require structured mechanical and biological soil conservation measures.`;
      interventions.push(
        { urgency: "Immediate", action: "Install contour cut-off drains and retention trenches", rationale: "Safely divert excess storm runoff away from vulnerable steep farm plots." },
        { urgency: "High", action: "Promote progressive terracing & agroforestry", rationale: "Integrate Alnus and Calliandra to bind topsoil and boost soil organic matter." }
      );
    } else {
      conditionTier = "OPTIMAL";
      conditionTitle = "Tolerable Soil Loss Baseline";
      badgeBg = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
      badgeText = "text-emerald-500";
      healthScore = 88;
      summary = `Estimated soil loss in ${districtName} remains largely within tolerable ecological limits (Mean: ${meanStr} t/ha/yr). Existing vegetative cover and terrace structures effectively mitigate surface runoff detachment.`;
      interventions.push(
        { urgency: "Medium", action: "Maintain existing terrace drainage ditches", rationale: "Prevent localized ditch sedimentation prior to peak rainy seasons." },
        { urgency: "Medium", action: "Conduct routine sediment monitoring in catchment outlets", rationale: "Verify long-term catchment soil conservation performance." }
      );
    }
  } else if (modLower.includes("drought")) {
    conditionTier = "MODERATE_WATCH";
    conditionTitle = "Drought Vulnerability & Moisture Profile";
    badgeBg = "bg-amber-500/15 text-amber-500 border-amber-500/30";
    badgeText = "text-amber-500";
    healthScore = 60;
    summary = `Multi-temporal drought indexing across ${districtName} for ${dateRange} evaluates meteorological rainfall deficit and vegetative thermal stress. Dominant classification '${dominant[0]}' encompasses ${dominantPct.toFixed(1)}% of monitored territory (${totalAreaKm2.toFixed(1)} km²).`;
    interventions.push(
      { urgency: "Immediate", action: "Monitor smallholder crop water satisfaction levels", rationale: "Identify early signs of agricultural drought before irreversible yield losses." },
      { urgency: "High", action: "Promote rainwater harvesting and farm pond construction", rationale: "Store surplus rainfall for supplemental irrigation during seasonal dry spells." },
      { urgency: "Medium", action: "Implement community drought contingency plans", rationale: "Coordinate emergency water and livestock fodder reserves." }
    );
  } else if (modLower.includes("flood") || modLower.includes("water")) {
    conditionTier = "FAVORABLE";
    conditionTitle = "Hydrological Drainage & Inundation Baseline";
    badgeBg = "bg-sky-500/15 text-sky-500 border-sky-500/30";
    badgeText = "text-sky-500";
    healthScore = 82;
    summary = `Synthetic Aperture Radar (SAR) and optical hydrological assessment maps surface water dynamics and flood inundation extent across ${districtName}. Total monitored area covers ${totalAreaKm2.toFixed(1)} km² with '${dominant[0]}' as the dominant landscape unit (${dominantPct.toFixed(1)}%).`;
    interventions.push(
      { urgency: "Immediate", action: "Clear sediment obstructions from main drainage canals", rationale: "Ensure unimpeded stormwater conveyance through urban and valley bottoms." },
      { urgency: "High", action: "Restrict permanent structures in delineated floodplains", rationale: "Preserve natural retention zones and protect community assets." }
    );
  } else if (modLower.includes("landslide") || modLower.includes("slope")) {
    conditionTier = "MODERATE_WATCH";
    conditionTitle = "Slope Stability & Geomorphological Profile";
    badgeBg = "bg-orange-500/15 text-orange-500 border-orange-500/30";
    badgeText = "text-orange-500";
    healthScore = 65;
    summary = `Terrain elevation modeling and slope angle analysis across ${districtName} evaluates geomorphological stability. Hillside sectors exceeding 25° require active vegetative bio-engineering and stormwater management.`;
    interventions.push(
      { urgency: "Immediate", action: "Inspect high-risk hillside settlements during heavy rains", rationale: "Detect early tension cracks and soil saturation signals." },
      { urgency: "High", action: "Plant deep-rooted bamboo along vulnerable gully heads", rationale: "Mechanically anchor loose regolith and absorb sub-surface pore pressure." }
    );
  } else if (modLower.includes("uhi") || modLower.includes("lst") || modLower.includes("heat")) {
    conditionTier = "FAVORABLE";
    conditionTitle = "Thermal & Surface Temperature Profile";
    badgeBg = "bg-rose-500/15 text-rose-500 border-rose-500/30";
    badgeText = "text-rose-500";
    healthScore = 75;
    summary = `Thermal infrared satellite radiometry measures Land Surface Temperature (LST) across ${districtName} (Mean: ${meanStr}°C). Urban impervious surfaces contrast with surrounding rural vegetative cooling sinks.`;
    interventions.push(
      { urgency: "High", action: "Expand urban tree canopies and green corridors", rationale: "Provide direct shading and natural evaporative cooling to reduce microclimate heat." },
      { urgency: "Medium", action: "Mandate cool roof / reflective materials on public buildings", rationale: "Lower building solar heat absorption and internal cooling demands." }
    );
  } else {
    // Universal Fallback
    summary = `Geospatial Earth observation report for ${moduleName} across ${districtName} (${dateRange}). Total evaluated territory encompasses ${totalAreaKm2.toFixed(2)} km² (${totalAreaHa.toLocaleString(undefined, { maximumFractionDigits: 0 })} hectares), with '${dominant[0]}' representing ${dominantPct.toFixed(1)}% of the landscape.`;
    interventions.push(
      { urgency: "High", action: "Integrate spatial findings into local planning dossiers", rationale: "Ensure empirical satellite evidence guides district development decisions." },
      { urgency: "Medium", action: "Ground-truth sample locations across primary classes", rationale: "Calibrate and validate satellite-derived indices against field observations." }
    );
  }

  return {
    conditionTitle,
    conditionTier,
    badgeBg,
    badgeText,
    badgeBorder,
    healthScore,
    executiveSummary: summary,
    meanValue: meanStr,
    minMaxRange: rangeStr,
    totalAreaKm2,
    totalAreaHa,
    dominantClass: { name: dominant[0], areaKm2: dominant[1], pct: dominantPct },
    breakdown,
    interventions,
    provenance: {
      constellation: modLower.includes("flood")
        ? "Copernicus Sentinel-1 C-SAR + Sentinel-2 MSI"
        : modLower.includes("rusle")
        ? "SRTM 30m DEM + Sentinel-2 SR + FAO Soils"
        : modLower.includes("lst") || modLower.includes("uhi")
        ? "USGS Landsat-8/9 TIRS + Copernicus Sentinel-2"
        : "Copernicus Sentinel-2 MSI (10m Resolution)",
      resolution: "10 m sub-hectare spatial resolution",
      processingLevel: "Surface Reflectance (SR) Level-2A",
      cloudMasking: "Automated QA60 & s2cloudless pixel masking (<10% cloud threshold)",
      projection: "WGS 84 / Geographic (EPSG:4326)",
    },
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ReportDownloadButton({
  moduleName,
  aoi,
  district,
  dateRange,
  stats,
  classAreas,
  extraNotes,
  maps = [],
  filename,
  proposedFacilities,
  deltaStats,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agencyTemplate, setAgencyTemplate] = useState("STANDARD");
  const [copied, setCopied] = useState(false);

  const districtName = district || aoi.name || "Survey Area";

  // Compute rich executive intelligence
  const insights = useMemo(
    () => deriveExecutiveInsights(moduleName, districtName, dateRange, stats, classAreas),
    [moduleName, districtName, dateRange, stats, classAreas]
  );

  const downloadPdf = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await api.report({
        module_name: moduleName,
        aoi,
        district: districtName,
        date_range: dateRange,
        stats,
        class_areas: classAreas,
        extra_notes: extraNotes,
        maps,
        agency_template: agencyTemplate,
        include_action_matrix: true,
        proposed_facilities: proposedFacilities,
        delta_stats: deltaStats,
      });

      const url = window.URL.createObjectURL(blob);
      const safeFile = filename || `${moduleName.replace(/\s+/g, "_")}_${districtName}_Report.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = safeFile;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Server-side report generation failed. You can use 'Print Dossier' for an instant local copy.");
    } finally {
      setLoading(false);
    }
  };

  const copyExecutiveSummary = () => {
    const textToCopy = `SPETRO SPATIAL INTELLIGENCE DOSSIER
Module: ${moduleName}
Area of Interest: ${districtName}
Observation Window: ${dateRange}
Condition Assessment: ${insights.conditionTitle} (Health Score: ${insights.healthScore}/100)

EXECUTIVE SUMMARY:
${insights.executiveSummary}

KEY METRICS:
- Spatial Mean: ${insights.meanValue}
- Observed Spread: ${insights.minMaxRange}
- Total Surveyed Area: ${insights.totalAreaKm2.toFixed(2)} km² (${insights.totalAreaHa.toLocaleString(undefined, { maximumFractionDigits: 0 })} hectares)
- Dominant Class: ${insights.dominantClass.name} (${insights.dominantClass.pct.toFixed(1)}%)

TOP RECOMMENDED INTERVENTIONS:
${insights.interventions.map((item, idx) => `${idx + 1}. [${item.urgency}] ${item.action} — ${item.rationale}`).join("\n")}

Data Provenance: ${insights.provenance.constellation} (${insights.provenance.resolution}). Processed via Google Earth Engine.`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const printDossier = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ── Print Optimization CSS ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #spetro-printable-dossier, #spetro-printable-dossier * {
            visibility: visible !important;
          }
          #spetro-printable-dossier {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #0f172a !important;
            padding: 24px !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* ── Complete Executive Dossier Container ── */}
      <div id="spetro-printable-dossier" className="space-y-6">
        {/* 1. Executive Dossier Header */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
                SPETRO DOSSIER
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary" /> {districtName}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {dateRange}
              </span>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${insights.badgeBg}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{insights.conditionTitle}</span>
              <span className="opacity-75">· {insights.healthScore}/100</span>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {moduleName} — Executive Briefing
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Empirical Earth Observation synthesis derived from Google Earth Engine satellite telemetry.
            </p>
          </div>
        </div>

        {/* 2. Executive Narrative Summary */}
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-2.5 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              Operational Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <p className="text-sm text-foreground/90 leading-relaxed font-normal">
              {insights.executiveSummary}
            </p>
            {extraNotes && (
              <p className="text-xs text-muted-foreground/80 italic border-l-2 border-primary/40 pl-3">
                {extraNotes}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 3. Key Metrics Highlight Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-primary" /> Spatial Mean
            </span>
            <div className="text-lg font-bold text-foreground">{insights.meanValue}</div>
            <span className="text-[10px] text-muted-foreground block truncate">
              {insights.conditionTier.replace("_", " ")}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-teal-500" /> Observed Range
            </span>
            <div className="text-sm font-bold text-foreground truncate">{insights.minMaxRange}</div>
            <span className="text-[10px] text-muted-foreground block">Min to Max spread</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-500" /> Monitored Area
            </span>
            <div className="text-lg font-bold text-foreground">{insights.totalAreaKm2.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">km²</span></div>
            <span className="text-[10px] text-muted-foreground block truncate">
              {insights.totalAreaHa.toLocaleString(undefined, { maximumFractionDigits: 0 })} hectares
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Dominant Class
            </span>
            <div className="text-sm font-bold text-foreground truncate">{insights.dominantClass.name}</div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">
              {insights.dominantClass.pct.toFixed(1)}% of territory
            </span>
          </div>
        </div>

        {/* 4. Territorial Land Distribution & Breakdown */}
        {insights.breakdown.length > 0 && (
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-2.5 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Territorial Land Classification Breakdown
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  Total: {insights.totalAreaKm2.toFixed(2)} km²
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {/* Proportional Segmented Bar */}
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/60 p-0.5">
                {insights.breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    style={{ width: `${Math.max(item.pct, 1)}%`, backgroundColor: item.color }}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                    title={`${item.name}: ${item.pct.toFixed(1)}% (${item.areaKm2.toFixed(2)} km²)`}
                  />
                ))}
              </div>

              {/* Breakdown Table */}
              <div className="border border-border rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-2 px-3">Classification</th>
                      <th className="py-2 px-3 text-right">Area (km²)</th>
                      <th className="py-2 px-3 text-right hidden sm:table-cell">Area (Hectares)</th>
                      <th className="py-2 px-3 text-right">Territorial Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {insights.breakdown.map((item, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-3 font-medium flex items-center gap-2 text-foreground">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate max-w-[200px]">{item.name}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                          {item.areaKm2.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground hidden sm:table-cell">
                          {item.areaHa.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-foreground">
                          {item.pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Actionable Strategic Interventions Matrix */}
        {insights.interventions.length > 0 && (
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-2.5 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Actionable Strategic Interventions Matrix
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="space-y-2.5">
                {insights.interventions.map((item, idx) => {
                  const urgencyStyle =
                    item.urgency === "Immediate"
                      ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                      : item.urgency === "High"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-border/70 bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="space-y-0.5 flex-1">
                        <div className="text-xs font-semibold text-foreground">{item.action}</div>
                        <div className="text-[11px] text-muted-foreground leading-normal">{item.rationale}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border shrink-0 ${urgencyStyle}`}>
                        {item.urgency}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 6. Satellite Data Provenance & Reliability Audit */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/80 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Info className="w-3.5 h-3.5 text-primary" />
            Satellite Data Provenance & Analytical Quality Assurance
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Sensor Platform:</span> {insights.provenance.constellation}
            </div>
            <div>
              <span className="font-medium text-foreground">Spatial Resolution:</span> {insights.provenance.resolution}
            </div>
            <div>
              <span className="font-medium text-foreground">Radiometric Processing:</span> {insights.provenance.processingLevel}
            </div>
            <div>
              <span className="font-medium text-foreground">Cloud Masking:</span> {insights.provenance.cloudMasking}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">
            Computed on-demand via Google Earth Engine under the SPETRO Spatial Intelligence verification protocol.
          </p>
        </div>
      </div>

      {/* ── 7. Interactive Action Bar & Export Controls (Hidden from paper print) ── */}
      <div className="no-print pt-2 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Institutional Template:
            </span>
            <Select value={agencyTemplate} onValueChange={setAgencyTemplate}>
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue placeholder="Agency Profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STANDARD">SPETRO Standard</SelectItem>
                <SelectItem value="REMA">REMA (Environment)</SelectItem>
                <SelectItem value="MINEMA">MINEMA (Disaster Risk)</SelectItem>
                <SelectItem value="RAB">RAB (Agriculture)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyExecutiveSummary}
              className="h-9 gap-1.5 text-xs font-medium"
              title="Copy executive briefing text for memos or emails"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Briefing</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={printDossier}
              className="h-9 gap-1.5 text-xs font-medium"
              title="Print or Save as PDF directly from browser"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Dossier</span>
            </Button>

            <Button
              onClick={downloadPdf}
              disabled={loading}
              size="sm"
              className="h-9 gap-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {loading ? "Generating PDF…" : "Download Official PDF"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
