/**
 * DatasetPropertiesDialog — ArcGIS Pro–style multi-tab Properties panel
 * with full operational tools & actions built directly inside.
 *
 * Rendered via React Portal for reliable z-index and no DOM nesting issues.
 *
 * Tabs:
 *   1. General     — Name, description, type, size, contributor, status, quick actions
 *   2. Operations  — Interactive Preview, Clip by District/AOI, Colab Snippets, Edit, Download, Delete
 *   3. Spatial     — Bounding box, cardinal coordinates, metric dimensions, CRS
 *   4. Source      — Original filename, storage key/location, URLs, protocol
 *   5. Metadata    — Category, tags, ID, status, raw JSON
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Database,
  Globe2,
  MapPin,
  Tag,
  FileText,
  Clock,
  User,
  HardDrive,
  Link as LinkIcon,
  Hash,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Ruler,
  Info,
  Eye,
  Scissors,
  Code2,
  Edit3,
  Download,
  Trash2,
  Settings2,
  Sparkles,
  Wrench,
} from "lucide-react";
import { BASE, type DatasetRecord } from "@/lib/api";
import { DatasetTypeIcon } from "@/components/DatasetTypeIcon";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface DatasetPropertiesDialogProps {
  dataset: DatasetRecord;
  source?: string;
  onClose: () => void;
  onOpenPreview?: (dataset: DatasetRecord) => void;
  onOpenClip?: (dataset: DatasetRecord) => void;
  onOpenColab?: (dataset: DatasetRecord) => void;
  onOpenEdit?: (dataset: DatasetRecord) => void;
  onDelete?: (id: string, source: string) => void;
  canEdit?: boolean;
}

/* ── Copyable property row ───────────────────────────────────────── */
function PropRow({
  label,
  value,
  icon,
  mono,
  copyable,
  link,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
  link?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = value == null || value === "" ? "—" : String(value);

  const handleCopy = () => {
    if (displayValue !== "—") {
      navigator.clipboard.writeText(displayValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-start gap-3 py-[6px] px-1 group hover:bg-muted/20 rounded-md transition-colors">
      <div className="flex items-center gap-2 w-[140px] shrink-0 text-muted-foreground text-xs font-medium pt-0.5">
        {icon && <span className="w-3.5 h-3.5 shrink-0 opacity-70">{icon}</span>}
        {label}
      </div>
      <div className="flex-1 min-w-0">
        {link && displayValue !== "—" ? (
          <a
            href={displayValue}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm text-blue-400 hover:text-blue-300 hover:underline break-all inline-flex items-center gap-1 ${
              mono ? "font-mono text-xs" : ""
            }`}
          >
            {displayValue.length > 60 ? displayValue.slice(0, 60) + "…" : displayValue}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <span
            className={`text-sm text-foreground break-all ${
              mono ? "font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded border border-border/30" : ""
            } ${displayValue === "—" ? "text-muted-foreground/40 italic" : ""}`}
          >
            {displayValue}
          </span>
        )}
      </div>
      {copyable && displayValue !== "—" && (
        <button
          onClick={handleCopy}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
}

/* ── Bbox visual box ─────────────────────────────────────────────── */
function BboxVisual({ bbox }: { bbox: number[] }) {
  const [minX, minY, maxX, maxY] = bbox;
  const centerLat = (minY + maxY) / 2;
  const centerLng = (minX + maxX) / 2;
  const width = Math.abs(maxX - minX);
  const height = Math.abs(maxY - minY);

  const formatLat = (lat: number) => `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
  const formatLng = (lng: number) => `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}`;

  return (
    <div className="relative rounded-lg overflow-hidden border border-border/60 bg-gradient-to-br from-blue-950/30 via-slate-900/40 to-cyan-950/30 p-5">
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-10">
        {[...Array(6)].map((_, i) => (
          <div key={`h${i}`} className="absolute w-full border-t border-cyan-500" style={{ top: `${(i + 1) * 16.66}%` }} />
        ))}
        {[...Array(6)].map((_, i) => (
          <div key={`v${i}`} className="absolute h-full border-l border-cyan-500" style={{ left: `${(i + 1) * 16.66}%` }} />
        ))}
      </div>

      {/* Bounding box rectangle with clean cardinal labels */}
      <div className="relative mx-auto my-1" style={{ width: "85%", maxWidth: 320 }}>
        {/* Top (North) */}
        <div className="text-[10px] font-mono text-cyan-300 font-semibold text-center mb-1.5 flex items-center justify-center gap-1">
          <span>▲ North:</span>
          <span>{formatLat(maxY)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Left (West) */}
          <div className="text-[10px] font-mono text-cyan-300 font-semibold shrink-0 text-right">
            <div>◄ West</div>
            <div className="text-cyan-200/90">{formatLng(minX)}</div>
          </div>

          {/* Box area */}
          <div className="flex-1 border-2 border-cyan-400/70 bg-cyan-400/10 rounded-md p-3 relative flex flex-col items-center justify-center min-h-[95px]">
            {/* Corner dots */}
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-cyan-400 rounded-full shadow-xs" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full shadow-xs" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-400 rounded-full shadow-xs" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full shadow-xs" />

            <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/40 mb-1.5" />
            <div className="text-[11px] font-mono text-cyan-200 font-bold">
              {formatLat(centerLat)}, {formatLng(centerLng)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 font-mono">
              {(width * 111.32).toFixed(1)} × {(height * 110.57).toFixed(1)} km
            </div>
          </div>

          {/* Right (East) */}
          <div className="text-[10px] font-mono text-cyan-300 font-semibold shrink-0 text-left">
            <div>East ►</div>
            <div className="text-cyan-200/90">{formatLng(maxX)}</div>
          </div>
        </div>

        {/* Bottom (South) */}
        <div className="text-[10px] font-mono text-cyan-300 font-semibold text-center mt-1.5 flex items-center justify-center gap-1">
          <span>▼ South:</span>
          <span>{formatLat(minY)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── File type descriptions ──────────────────────────────────────── */
const FILE_TYPE_INFO: Record<string, { fullName: string; description: string }> = {
  tiff: {
    fullName: "GeoTIFF Raster Dataset",
    description: "Tagged Image File Format with embedded georeferencing. Stores pixel-based imagery, elevation models, or classified surfaces with coordinate system metadata.",
  },
  shapefile: {
    fullName: "Esri Shapefile (Zipped)",
    description: "Industry-standard vector format containing geometry (.shp), attributes (.dbf), spatial index (.shx), and projection (.prj) files bundled in a ZIP archive.",
  },
  csv: {
    fullName: "Comma-Separated Values Table",
    description: "Tabular data with rows and columns. May contain spatial coordinates (lat/lon) for point-based mapping.",
  },
  geojson: {
    fullName: "GeoJSON Feature Collection",
    description: "Open-standard JSON-based format for encoding geographic features with geometry and associated properties.",
  },
  gpkg: {
    fullName: "OGC GeoPackage",
    description: "Open, standards-based SQLite database container for vector features, tile matrices, and raster imagery.",
  },
  kml: {
    fullName: "Keyhole Markup Language",
    description: "XML-based geographic annotation format. Supports points, lines, polygons, overlays, and 3D models.",
  },
  parquet: {
    fullName: "Apache Parquet Columnar Storage",
    description: "Columnar storage format optimized for analytics workloads with efficient compression.",
  },
  other: {
    fullName: "Generic Dataset File",
    description: "Unrecognized or specialized format. May require specific software or plugins.",
  },
};

type PropTab = "general" | "operations" | "spatial" | "source" | "metadata";

/* ── Main Export ──────────────────────────────────────────────────── */
export function DatasetPropertiesDialog({
  dataset: d,
  source = "admin",
  onClose,
  onOpenPreview,
  onOpenClip,
  onOpenColab,
  onOpenEdit,
  onDelete,
  canEdit = false,
}: DatasetPropertiesDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<PropTab>("general");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const ft = (d.file_type || "other").toLowerCase();
  const typeInfo = FILE_TYPE_INFO[ft] ?? FILE_TYPE_INFO.other;
  const hasBbox = !!(
    d.bbox &&
    Array.isArray(d.bbox) &&
    d.bbox.length === 4 &&
    d.bbox.every((v) => typeof v === "number" && !isNaN(v))
  );

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Storage info
  const storageDisplay = (() => {
    const k = d.storage_key ?? "";
    if (k.startsWith("r2://")) return "Cloudflare R2 Object Storage";
    if (k.startsWith("hf://")) return "Hugging Face Datasets Hub";
    if (k.startsWith("local://")) return "Local Server Storage";
    if (k.startsWith("url::")) return "External URL (Linked)";
    return k ? "File Storage" : "Unknown";
  })();

  const storageProtocol = (() => {
    const k = d.storage_key ?? "";
    if (k.startsWith("r2://")) return "S3-Compatible (Cloudflare R2)";
    if (k.startsWith("hf://")) return "Hugging Face API";
    if (k.startsWith("local://")) return "Local Filesystem";
    if (k.startsWith("url::")) return "HTTP/HTTPS";
    return "—";
  })();

  const handleCopyDownloadLink = () => {
    const origin = window.location.origin;
    const url = `${origin}${BASE}/datasets/${d.id}/download?source=${d.source ?? source}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast({
      title: "Direct Download Link Copied",
      description: `URL for "${d.name}" copied to clipboard.`,
    });
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const tabs: { key: PropTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { key: "general", label: "General", icon: <FileText className="w-3.5 h-3.5" /> },
    { key: "operations", label: "Operations & Tools", icon: <Wrench className="w-3.5 h-3.5 text-primary" />, badge: "Actions" },
    { key: "spatial", label: "Spatial", icon: <Globe2 className="w-3.5 h-3.5" /> },
    { key: "source", label: "Source", icon: <HardDrive className="w-3.5 h-3.5" /> },
    { key: "metadata", label: "Metadata", icon: <Tag className="w-3.5 h-3.5" /> },
  ];

  const dialog = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[650px] max-h-[88vh] bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Title Bar ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-muted/60 via-muted/40 to-muted/20 border-b border-border/60 shrink-0">
          <DatasetTypeIcon fileType={d.file_type || "other"} status={d.status} size={34} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{d.name || "Dataset Details"}</h2>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              {typeInfo.fullName} — Item Properties & Tools
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
            aria-label="Close properties"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tab Bar ────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-3 bg-muted/15 border-b border-border/40 shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                tab === t.key
                  ? "border-primary text-primary bg-card/60 font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 custom-scrollbar">
          {/* ═══ GENERAL ═══ */}
          {tab === "general" && (
            <div className="space-y-0">
              <PropRow label="Dataset Name" value={d.name} icon={<FileText className="w-3.5 h-3.5" />} copyable />
              <PropRow label="Description" value={d.description || "No description provided"} icon={<FileText className="w-3.5 h-3.5" />} />
              <div className="border-t border-border/30 my-2" />
              <PropRow label="File Format" value={typeInfo.fullName} icon={<Database className="w-3.5 h-3.5" />} />
              <div className="ml-[156px] text-[10px] text-muted-foreground/60 -mt-1 mb-2 leading-relaxed">
                {typeInfo.description}
              </div>
              <PropRow
                label="File Size"
                value={
                  d.file_size_mb != null
                    ? d.file_size_mb >= 1
                      ? `${d.file_size_mb.toFixed(2)} MB (${(d.file_size_mb * 1024 * 1024).toLocaleString()} bytes)`
                      : `${(d.file_size_mb * 1024).toFixed(1)} KB (${(d.file_size_mb * 1024 * 1024).toLocaleString()} bytes)`
                    : null
                }
                icon={<HardDrive className="w-3.5 h-3.5" />}
              />
              <div className="border-t border-border/30 my-2" />
              <PropRow
                label="Status"
                value={d.status === "ok" || d.status === "ready" ? "Ready" : d.status === "error" ? "Error" : d.status}
                icon={
                  d.status === "ready" || d.status === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : d.status === "error" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )
                }
              />
              {d.error_message && (
                <div className="ml-[156px] text-[11px] text-rose-400/80 bg-rose-500/8 border border-rose-500/20 rounded-lg px-2.5 py-1.5 -mt-0.5 mb-1">
                  Warning: {d.error_message}
                </div>
              )}
              <PropRow label="Contributor" value={d.contributor || "Unknown"} icon={<User className="w-3.5 h-3.5" />} />
              <PropRow
                label="Upload Date"
                value={d.upload_date ? new Date(d.upload_date).toLocaleString() : null}
                icon={<Clock className="w-3.5 h-3.5" />}
              />

              {/* Quick Jump to Operations */}
              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Operations & Actions:</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 hover:border-primary hover:text-primary font-medium"
                  onClick={() => setTab("operations")}
                >
                  <Wrench className="w-3 h-3 text-primary" />
                  View All Operational Tools &rarr;
                </Button>
              </div>
            </div>
          )}

          {/* ═══ OPERATIONS & TOOLS (ALL DATASET ACTIONS MOVED HERE) ═══ */}
          {tab === "operations" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">
                All operational tools, spatial extractors, code generators, and file management for <strong>{d.name}</strong>:
              </div>

              {/* 1. Spatial Preview Modal */}
              {onOpenPreview && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                        Interactive Spatial Preview
                        <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.2 rounded font-medium">Map & Attributes</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Inspect live layer on interactive map, test colormaps, and examine tabular attribute rows.
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0 ml-3"
                    onClick={() => {
                      onClose();
                      onOpenPreview(d);
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open Preview
                  </Button>
                </div>
              )}

              {/* 2. District & AOI Slicer / Clip */}
              {hasBbox && onOpenClip && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-emerald-500/50 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20">
                      <Scissors className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground group-hover:text-emerald-500 transition-colors flex items-center gap-1.5">
                        Clip by District / Custom AOI
                        <span className="text-[9px] bg-emerald-500/15 text-emerald-500 px-1.5 py-0.2 rounded font-medium">Spatial Clip</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Crop and download dataset by any of Rwanda's 30 districts or a custom polygon geometry.
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0 ml-3 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => {
                      onClose();
                      onOpenClip(d);
                    }}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Clip by AOI
                  </Button>
                </div>
              )}

              {/* 3. Colab / Python / GEE */}
              {onOpenColab && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-indigo-500/50 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <Code2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                        Google Colab & GEE Code Generator
                        <span className="text-[9px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.2 rounded font-medium">Python / GEE</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Generate ready-to-run Python, Rasterio, GEE, or Hugging Face streaming scripts.
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0 ml-3 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                    onClick={() => {
                      onClose();
                      onOpenColab(d);
                    }}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Colab Snippet
                  </Button>
                </div>
              )}

              {/* 4. Edit Metadata */}
              {canEdit && onOpenEdit && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-amber-500/50 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
                      <Edit3 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground group-hover:text-amber-500 transition-colors">
                        Edit Metadata & Domain Tags
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Modify dataset title, description, domain category, and classification tags.
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0 ml-3 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => {
                      onClose();
                      onOpenEdit(d);
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Metadata
                  </Button>
                </div>
              )}

              {/* 5. Direct Download Raw File */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-blue-500/50 transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-foreground group-hover:text-blue-500 transition-colors flex items-center gap-1.5">
                      Download File ({(d.file_type || "RAW").toUpperCase()})
                      <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.2 rounded font-medium">
                        {d.file_size_mb ? `${d.file_size_mb.toFixed(2)} MB` : "Raw Bytes"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      Download original dataset file directly to your local computer.
                    </div>
                  </div>
                </div>
                <a
                  href={`${BASE}/datasets/${d.id}/download?source=${d.source ?? source}`}
                  download
                  className="shrink-0 ml-3"
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download File
                  </Button>
                </a>
              </div>

              {/* 6. Copy Direct Link */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-cyan-500/50 transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
                    <Copy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-foreground group-hover:text-cyan-400 transition-colors">
                      Copy Permanent Download URL
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      REST API endpoint URL for Python scripts, QGIS, or ArcGIS Pro connections.
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5 shrink-0 ml-3 border border-border/60 hover:bg-muted"
                  onClick={handleCopyDownloadLink}
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? "Copied" : "Copy Link"}
                </Button>
              </div>

              {/* 7. Delete Dataset */}
              {onDelete && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60 transition-all group mt-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 border border-rose-500/30">
                      <Trash2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-rose-500">
                        Delete Dataset
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Permanently remove dataset and delete files from storage.
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0 ml-3"
                    onClick={() => {
                      onClose();
                      onDelete(d.id, d.source ?? source);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ═══ SPATIAL ═══ */}
          {tab === "spatial" && (
            <div className="space-y-3">
              {hasBbox ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Georeferenced Dataset</span>
                    <span className="text-muted-foreground/50">— EPSG:4326 (WGS 84)</span>
                  </div>

                  <BboxVisual bbox={d.bbox!} />

                  <div className="space-y-0 mt-1">
                    <PropRow label="Bounding Box" value={d.bbox!.map((v) => v.toFixed(6)).join(", ")} icon={<Ruler className="w-3.5 h-3.5" />} mono copyable />
                    <div className="border-t border-border/30 my-2" />
                    <PropRow label="West (Min Lng)" value={`${d.bbox![0].toFixed(6)}°`} icon={<Globe2 className="w-3.5 h-3.5" />} />
                    <PropRow label="South (Min Lat)" value={`${d.bbox![1].toFixed(6)}°`} icon={<Globe2 className="w-3.5 h-3.5" />} />
                    <PropRow label="East (Max Lng)" value={`${d.bbox![2].toFixed(6)}°`} icon={<Globe2 className="w-3.5 h-3.5" />} />
                    <PropRow label="North (Max Lat)" value={`${d.bbox![3].toFixed(6)}°`} icon={<Globe2 className="w-3.5 h-3.5" />} />
                    <div className="border-t border-border/30 my-2" />
                    <PropRow
                      label="Width"
                      value={`${Math.abs(d.bbox![2] - d.bbox![0]).toFixed(4)}° (~${(Math.abs(d.bbox![2] - d.bbox![0]) * 111.32).toFixed(1)} km)`}
                      icon={<Ruler className="w-3.5 h-3.5" />}
                    />
                    <PropRow
                      label="Height"
                      value={`${Math.abs(d.bbox![3] - d.bbox![1]).toFixed(4)}° (~${(Math.abs(d.bbox![3] - d.bbox![1]) * 110.57).toFixed(1)} km)`}
                      icon={<Ruler className="w-3.5 h-3.5" />}
                    />
                    <PropRow
                      label="Approx Area"
                      value={`~${(
                        Math.abs(d.bbox![2] - d.bbox![0]) * 111.32 *
                        Math.abs(d.bbox![3] - d.bbox![1]) * 110.57
                      ).toLocaleString(undefined, { maximumFractionDigits: 0 })} km²`}
                      icon={<Layers className="w-3.5 h-3.5" />}
                    />
                    <PropRow label="Coordinate System" value="WGS 84 (EPSG:4326)" icon={<Globe2 className="w-3.5 h-3.5" />} />
                    <PropRow label="Datum" value="World Geodetic System 1984" icon={<Globe2 className="w-3.5 h-3.5" />} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Globe2 className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">No Spatial Information</p>
                  <p className="text-xs mt-1.5 max-w-[320px] text-muted-foreground/60 leading-relaxed">
                    This dataset does not have bounding box coordinates. It may be a non-spatial table,
                    or the spatial extent could not be extracted during upload.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══ SOURCE ═══ */}
          {tab === "source" && (
            <div className="space-y-0">
              <PropRow label="Original Filename" value={d.original_filename} icon={<FileText className="w-3.5 h-3.5" />} mono copyable />
              <PropRow label="Dataset ID" value={d.id} icon={<Hash className="w-3.5 h-3.5" />} mono copyable />
              <div className="border-t border-border/30 my-2" />
              <PropRow label="Storage Location" value={storageDisplay} icon={<HardDrive className="w-3.5 h-3.5" />} />
              <PropRow label="Storage Protocol" value={storageProtocol} icon={<Layers className="w-3.5 h-3.5" />} />
              <PropRow label="Storage Key" value={d.storage_key} icon={<Hash className="w-3.5 h-3.5" />} mono copyable />
              <div className="border-t border-border/30 my-2" />
              <PropRow label="Source URL" value={d.source_url} icon={<LinkIcon className="w-3.5 h-3.5" />} mono copyable link />
              <PropRow label="Source Partition" value={d.source ?? source} icon={<Database className="w-3.5 h-3.5" />} />
              <div className="border-t border-border/30 my-2" />
              <div className="text-[11px] text-muted-foreground/50 px-1 flex items-center gap-1.5">
                <Info className="w-3 h-3 shrink-0" />
                Detected format: <strong className="text-foreground/70">{(d.file_type || "OTHER").toUpperCase()}</strong> — from file extension of "{d.original_filename || d.name || "dataset"}"
              </div>
            </div>
          )}

          {/* ═══ METADATA ═══ */}
          {tab === "metadata" && (
            <div className="space-y-0">
              <PropRow label="Category" value={d.category || "Uncategorized"} icon={<Tag className="w-3.5 h-3.5" />} />

              {/* Tags */}
              <div className="flex items-start gap-3 py-[6px] px-1">
                <div className="flex items-center gap-2 w-[140px] shrink-0 text-muted-foreground text-xs font-medium pt-0.5">
                  <Tag className="w-3.5 h-3.5 opacity-70" />
                  Tags
                </div>
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {d.tags && d.tags.length > 0 ? (
                    d.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium"
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground/40 italic">No tags assigned</span>
                  )}
                </div>
              </div>

              <div className="border-t border-border/30 my-2" />
              <PropRow label="Internal ID" value={d.id} icon={<Hash className="w-3.5 h-3.5" />} mono copyable />
              <PropRow label="Source Partition" value={d.source ?? source} icon={<Database className="w-3.5 h-3.5" />} />
              <PropRow label="File Type Code" value={(d.file_type || "OTHER").toUpperCase()} icon={<FileText className="w-3.5 h-3.5" />} />
              <PropRow label="Has Spatial Ref" value={hasBbox ? "Yes — WGS 84 (EPSG:4326)" : "No"} icon={<MapPin className="w-3.5 h-3.5" />} />

              <div className="border-t border-border/30 my-3" />

              {/* Raw JSON */}
              <div className="text-[11px] text-muted-foreground/60 font-medium mb-1.5 flex items-center gap-1.5 px-1">
                <Hash className="w-3 h-3" />
                Raw Record (JSON)
              </div>
              <pre className="text-[10px] font-mono bg-muted/30 border border-border/30 rounded-lg p-3 overflow-x-auto max-h-[200px] overflow-y-auto text-foreground/60 leading-relaxed select-all">
                {JSON.stringify(d, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* ── Footer with Quick Operational Buttons ─────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-border/50 bg-muted/15 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
            <span>ID: {(d.id || "—").slice(0, 8)}…</span>
            <span>•</span>
            <span className="uppercase font-semibold text-foreground/70">{(d.file_type || "DATASET")}</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPreview && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 hover:border-primary hover:text-primary cursor-pointer"
                onClick={() => {
                  onClose();
                  onOpenPreview(d);
                }}
              >
                <Eye className="w-3 h-3" /> Preview
              </Button>
            )}

            <a
              href={`${BASE}/datasets/${d.id}/download?source=${d.source ?? source}`}
              download
            >
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Download
              </Button>
            </a>

            <Button
              onClick={onClose}
              className="h-7 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : null;
}
