import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Loader2, 
  Trash2, 
  Download, 
  Upload, 
  Link as LinkIcon, 
  Database, 
  Lock, 
  Code2, 
  Eye, 
  Copy, 
  Check, 
  Search, 
  MapPin, 
  Layers, 
  Archive, 
  Scissors, 
  Edit3,
  ExternalLink,
  Tag,
  Settings2,
  FolderOpen,
  ChevronDown,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, BASE, type DatasetRecord } from "@/lib/api";
import { DatasetColabDialog } from "@/components/DatasetColabDialog";
import { DatasetPreviewDialog } from "@/components/DatasetPreviewDialog";
import { DatasetClipDialog } from "@/components/DatasetClipDialog";
import { DatasetEditDialog } from "@/components/DatasetEditDialog";
import { DatasetTypeIcon } from "@/components/DatasetTypeIcon";
import { useDatasetContextMenu, type ContextMenuItem } from "@/components/DatasetContextMenu";
import { DatasetPropertiesDialog } from "@/components/DatasetPropertiesDialog";

const FILE_TYPE_COLORS: Record<string, string> = {
  tiff: "#ef4444",
  shapefile: "#3b82f6",
  csv: "#10b981",
  geojson: "#06b6d4",
  other: "#a855f7",
};

const CATEGORIES = [
  "All",
  "Topography & Elevation",
  "Agriculture & Crops",
  "Forestry & Vegetation",
  "Hydrology & Water",
  "Climate & Hazards",
  "Urban & Infrastructure",
  "Other / General",
];

const DEFAULT_OFFICIAL_DATASETS: DatasetRecord[] = [
  {
    id: "aa8596b0-9f5f-4e98-bb98-e7c0abb1daed",
    name: "demm",
    description: "High-accuracy Digital Elevation Model (DEM) for Nyagisozi watershed, formatted for hydrological modeling (HEC-HMS).",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/aa8596b0-9f5f-4e98-bb98-e7c0abb1daed_DEM_Nyagisozi_for HEC-HMS.tif",
    original_filename: "DEM_Nyagisozi_for HEC-HMS.tif",
    bbox: [29.252916255265344, -2.584775519671997, 29.788772106341245, -2.1526466101905712],
    upload_date: "2026-08-21T12:59:12.308265+00:00",
    file_size_mb: 54.331,
    status: "ok",
    source: "admin",
    contributor: "SPETRO Admin",
    category: "Topography & Elevation",
    tags: ["Rwanda", "Admin", "GeoTIFF", "Elevation"]
  },
  {
    id: "4fedd6f7-19c1-4bbe-8283-a78c205f0998",
    name: "tree",
    description: "Baseline Tree Cover Year 2000 raster layer for Rwanda national forest monitoring.",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/4fedd6f7-19c1-4bbe-8283-a78c205f0998_TreeCover2000.tif",
    original_filename: "TreeCover2000.tif",
    bbox: [28.52520825043726, -2.865542541247325, 31.074357532183225, -0.9540174481693953],
    upload_date: "2026-08-21T13:11:23.247871+00:00",
    file_size_mb: 28.133,
    status: "ok",
    source: "admin",
    contributor: "SPETRO Admin",
    category: "Forestry & Vegetation",
    tags: ["Rwanda", "Admin", "GeoTIFF", "Forestry"]
  },
  {
    id: "6943d7ef-4a08-4afb-a485-c98ba8efe6f4",
    name: "LOSS",
    description: "Hansen Global Forest Change annual tree loss year raster layer for Rwanda.",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/6943d7ef-4a08-4afb-a485-c98ba8efe6f4_TreeLossYear.tif",
    original_filename: "TreeLossYear.tif",
    bbox: [28.52520825043726, -2.865542541247325, 31.074357532183225, -0.9540174481693953],
    upload_date: "2026-08-21T14:46:44.980639+00:00",
    file_size_mb: 3.395,
    status: "ok",
    source: "admin",
    contributor: "SPETRO Admin",
    category: "Forestry & Vegetation",
    tags: ["Rwanda", "Admin", "GeoTIFF", "Tree Loss"]
  }
];

const DEFAULT_COMMUNITY_DATASETS: DatasetRecord[] = [
  {
    id: "7520b287-1a74-4d58-9f1d-d7bcec391b7f",
    name: "SoilLoss_t_ha_yr.tif",
    description: "High-resolution geospatial raster dataset: SoilLoss_t_ha_yr.tif covering Rwanda.",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/7520b287-1a74-4d58-9f1d-d7bcec391b7f_SoilLoss_t_ha_yr.tif",
    original_filename: "SoilLoss_t_ha_yr.tif",
    bbox: [28.86, -2.84, 30.9, -1.05],
    upload_date: "2026-08-21T13:20:37.684029+00:00",
    file_size_mb: 0.122,
    status: "ok",
    source: "community",
    contributor: "SPETRO Community",
    category: "Agriculture & Crops",
    tags: ["Rwanda", "Raster", "GeoTIFF"]
  },
  {
    id: "f07bf960-d17f-47f6-9fbd-a18c6056e343",
    name: "Landsat9_LST_Mean_2025.tif",
    description: "High-resolution geospatial raster dataset: Landsat9_LST_Mean_2025.tif covering Rwanda.",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/f07bf960-d17f-47f6-9fbd-a18c6056e343_Landsat9_LST_Mean_2025.tif",
    original_filename: "Landsat9_LST_Mean_2025.tif",
    bbox: [28.86, -2.84, 30.9, -1.05],
    upload_date: "2026-08-21T13:35:24.061053+00:00",
    file_size_mb: 0.123,
    status: "ok",
    source: "community",
    contributor: "SPETRO Community",
    category: "Climate & Hazards",
    tags: ["Rwanda", "Raster", "GeoTIFF"]
  },
  {
    id: "b47671da-2ba0-4d44-9c70-b5ab1e87343b",
    name: "LandCover_Landsat8_2014_7Classes.tif",
    description: "High-resolution geospatial raster dataset: LandCover_Landsat8_2014_7Classes.tif covering Rwanda.",
    file_type: "tiff",
    storage_key: "kaggle://petrovih/blacportal-datasets/b47671da-2ba0-4d44-9c70-b5ab1e87343b_LandCover_Landsat8_2014_7Classes.tif",
    original_filename: "LandCover_Landsat8_2014_7Classes.tif",
    bbox: [28.86, -2.84, 30.9, -1.05],
    upload_date: "2026-08-21T14:22:31.246271+00:00",
    file_size_mb: 0.123,
    status: "ok",
    source: "community",
    contributor: "SPETRO Community",
    category: "Agriculture & Crops",
    tags: ["Rwanda", "Raster", "GeoTIFF"]
  },
  {
    id: "82dd959c-fc26-480f-9438-6aae4b6cb909",
    name: "Rwanda_Base_Map_2014-0000000000-0000005376.tif",
    description: "High-resolution geospatial raster dataset: Rwanda_Base_Map_2014 covering Rwanda.",
    file_type: "tiff",
    storage_key: "local://rare_data/community_files/82dd959c-fc26-480f-9438-6aae4b6cb909_Rwanda_Base_Map_2014-0000000000-0000005376.tif",
    original_filename: "Rwanda_Base_Map_2014-0000000000-0000005376.tif",
    bbox: [30.310594990647246, -2.4965978376249742, 30.89971015397283, -1.04779494739701],
    upload_date: "2026-09-05T17:34:18.500745+00:00",
    file_size_mb: 353.843,
    status: "ok",
    source: "community",
    contributor: "SPETRO Community",
    category: "Topography & Elevation",
    tags: ["Rwanda", "Raster", "GeoTIFF"]
  }
];

function TypeBadge({ type }: { type: string }) {
  const color = FILE_TYPE_COLORS[type.toLowerCase()] ?? FILE_TYPE_COLORS.other;
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded text-white uppercase tracking-wider shadow-2xs"
      style={{ backgroundColor: color }}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const isReady = status === "ready" || status === "ok";
  const isError = status === "error";

  if (isReady) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Ready
      </span>
    );
  }

  if (isError) {
    return (
      <span 
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-500 cursor-help"
        title={errorMessage || "Processing or upload error occurred"}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Error
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
      {status}
    </span>
  );
}

function SummaryRow({ 
  records, 
  source,
}: { 
  records: DatasetRecord[]; 
  source: string;
}) {
  const totalMb = records.reduce((s, r) => s + (r.file_size_mb ?? 0), 0);
  const spatial = records.filter((r) => r.bbox && r.bbox.length === 4).length;
  const downloadAllUrl = `${BASE}/datasets/download-all?source=${source}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground mb-4 p-3 bg-card border border-border/80 rounded-xl shadow-2xs">
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs sm:text-sm">
        <span>
          <strong className="text-foreground font-semibold">{records.length}</strong> datasets
        </span>
        <span className="text-border">•</span>
        <span>
          <strong className="text-foreground font-semibold">{totalMb.toFixed(1)}</strong> MB total
        </span>
        <span className="text-border">•</span>
        <span>
          <strong className="text-foreground font-semibold">{spatial}</strong> with spatial extents
        </span>
      </div>

      <div className="flex items-center gap-2">
        {records.length > 0 && (
          <a href={downloadAllUrl} download>
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 shadow-2xs">
              <Archive className="w-3.5 h-3.5" />
              Download All (.ZIP)
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function DatasetList({
  records,
  source,
  onDelete,
  selectedId,
  onSelect,
  onRefresh,
}: {
  records: DatasetRecord[];
  source: string;
  onDelete?: (id: string, source: string) => void;
  selectedId?: string | null;
  onSelect?: (r: DatasetRecord) => void;
  onRefresh?: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEdit = !!user;

  const [colabDataset, setColabDataset] = useState<DatasetRecord | null>(null);
  const [previewDataset, setPreviewDataset] = useState<DatasetRecord | null>(null);
  const [clipDataset, setClipDataset] = useState<DatasetRecord | null>(null);
  const [editDataset, setEditDataset] = useState<DatasetRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatasetRecord | null>(null);
  const [propertiesDataset, setPropertiesDataset] = useState<DatasetRecord | null>(null);

  // Hook-based right-click context menu (renders via Portal, no DOM nesting issues)
  const contextMenu = useDatasetContextMenu();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [onlySpatial, setOnlySpatial] = useState(false);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let list = [...records];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.contributor?.toLowerCase().includes(q) ||
          r.file_type.toLowerCase().includes(q) ||
          (r.tags && r.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (filterType !== "all") {
      list = list.filter((r) => r.file_type.toLowerCase() === filterType.toLowerCase());
    }

    if (filterCategory !== "All") {
      list = list.filter((r) => r.category === filterCategory);
    }

    if (onlySpatial) {
      list = list.filter((r) => r.bbox && r.bbox.length === 4);
    }

    list.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "size") {
        return (b.file_size_mb ?? 0) - (a.file_size_mb ?? 0);
      }
      const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
      const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
      return dateB - dateA;
    });

    return list;
  }, [records, search, filterType, filterCategory, onlySpatial, sortBy]);

  const handleDirectDownload = async (r: DatasetRecord) => {
    const url = `${BASE}/datasets/${r.id}/download?source=${r.source ?? source}`;
    const presignUrl = `${BASE}/datasets/${r.id}/presign?source=${r.source ?? source}`;
    const filename = r.original_filename || `${r.name}.tif`;

    toast({
      title: "Download Initiated",
      description: `Preparing "${r.name}" (${(r.file_type || "RAW").toUpperCase()})...`,
    });

    try {
      // 1. Try presigned R2 CDN direct download first (zero proxy overhead, fastest)
      try {
        const presignResp = await fetch(presignUrl, { method: "GET" });
        if (presignResp.ok) {
          const presignData = await presignResp.json();
          if (presignData && presignData.presigned_url) {
            const a = document.createElement("a");
            a.href = presignData.presigned_url;
            a.setAttribute("download", filename);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast({
              title: "CDN Download Started",
              description: `"${r.name}" is downloading directly from Cloudflare R2 storage.`,
            });
            return;
          }
        }
      } catch (_) {
        // Presign failed or not configured — fall through to streaming link
      }

      // 2. Direct browser streaming download (streams directly to Downloads folder, no JS heap memory)
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", filename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Download Started",
        description: `"${r.name}" stream started. Check your browser downloads.`,
      });
    } catch (err: any) {
      console.error("Direct download failed:", err);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: `Could not start download for "${r.name}". Try copying the link or refreshing.`,
      });
    }
  };

  const copyDownloadLink = (r: DatasetRecord) => {
    const origin = window.location.origin;
    const url = `${origin}${BASE}/datasets/${r.id}/download?source=${r.source ?? source}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Direct URL Copied",
      description: `Download link for "${r.name}" copied to clipboard.`,
    });
  };

  return (
    <div className="space-y-3">
      {/* Search, Filter & Sort Controls */}
      <div className="space-y-2 bg-card border border-border/70 p-3 rounded-xl shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, tags, contributor..."
              className="pl-9 h-8 text-xs bg-background"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Filter Buttons */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/40 text-xs">
              {["all", "tiff", "shapefile", "csv", "geojson"].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-1 rounded-md font-medium text-[11px] transition-colors capitalize ${
                    filterType === type
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "all" ? "All Formats" : type.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:outline-hidden"
            >
              <option value="date">Newest First</option>
              <option value="name">Name (A-Z)</option>
              <option value="size">Size (Largest)</option>
            </select>
          </div>
        </div>

        {/* Domain Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
          <span className="text-[11px] text-muted-foreground font-semibold shrink-0 mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3" /> Categories:
          </span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all border ${
                filterCategory === cat
                  ? "bg-primary text-primary-foreground border-primary shadow-2xs font-semibold"
                  : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Dataset Table */}
      <div className="rounded-xl border border-border/80 overflow-hidden shadow-2xs bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 border-b border-border/80 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-xs">
                  Dataset Name & Metadata
                  <span className="hidden sm:inline font-normal text-muted-foreground/70 text-[10px] ml-2">
                    (Right-click for options, double-click for properties)
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs">Format</th>
                <th className="text-right px-4 py-3 font-semibold text-xs">Size (MB)</th>
                <th className="text-right px-4 py-3 font-semibold text-xs pr-6">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRecords.map((r, i) => {
                const isSelected = r.id === selectedId;
                return (
                  <tr 
                    key={r.id}
                    className={`transition-colors group hover:bg-muted/40 cursor-context-menu ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}
                    onClick={() => onSelect && onSelect(r)}
                    onDoubleClick={() => setPropertiesDataset(r)}
                    title="Right-click for dataset options, double-click for Properties"
                    onContextMenu={contextMenu.open([
                      { label: "Open (Preview)", icon: <FolderOpen className="w-4 h-4" />, onClick: () => setPreviewDataset(r), dividerAfter: false },
                      { label: "Properties", icon: <Settings2 className="w-4 h-4" />, onClick: () => setPropertiesDataset(r), dividerAfter: true },
                      ...(r.bbox && r.bbox.length === 4 ? [{ label: "Clip by District / AOI", icon: <Scissors className="w-4 h-4" />, onClick: () => setClipDataset(r) }] : []),
                      { label: "Colab / GEE Snippet", icon: <Code2 className="w-4 h-4" />, onClick: () => setColabDataset(r) },
                      { label: "Edit Metadata", icon: <Edit3 className="w-4 h-4" />, onClick: () => setEditDataset(r), disabled: !canEdit, dividerAfter: true },
                      { label: "Copy Download Link", icon: <Copy className="w-4 h-4" />, onClick: () => copyDownloadLink(r) },
                      { label: "Download File", icon: <Download className="w-4 h-4" />, onClick: () => handleDirectDownload(r) },
                      ...(onDelete ? [{ label: "Delete Dataset", icon: <Trash2 className="w-4 h-4" />, onClick: () => setDeleteTarget(r), variant: "danger" as const }] : []),
                    ], r)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <DatasetTypeIcon fileType={r.file_type} status={r.status} size={30} />
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.name}
                        </span>
                        {r.category && (
                          <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.2 rounded font-medium">
                            {r.category}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {r.description}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/80 mt-1">
                        {r.contributor && <span>By {r.contributor}</span>}
                        {r.upload_date && (
                          <span>
                            {new Date(r.upload_date).toLocaleDateString()}
                          </span>
                        )}
                        {r.tags && r.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {r.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.2 rounded font-mono">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {r.source_url && (
                          <a 
                            href={r.source_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-0.5 text-blue-500 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Source Link <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <TypeBadge type={r.file_type} />
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-xs font-medium text-foreground">
                      {r.file_size_mb != null ? r.file_size_mb.toFixed(2) : "—"}
                    </td>

                    {/* Action buttons: Direct Download + Properties */}
                    <td className="px-4 py-3 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1 font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800 transition-all shadow-2xs cursor-pointer"
                          onClick={() => handleDirectDownload(r)}
                          title={`Download ${r.name} (${(r.file_type || 'RAW').toUpperCase()})`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1 font-medium border-border/80 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all shadow-2xs cursor-pointer"
                          onClick={() => setPropertiesDataset(r)}
                          title="Open dataset properties, operations & tools"
                        >
                          <Settings2 className="w-3.5 h-3.5 text-primary" />
                          Properties
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No datasets found matching your criteria.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {search || filterCategory !== "All" || filterType !== "all"
                        ? "Try clearing your search or category filters."
                        : "Upload or link a new geospatial dataset to get started."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Spatial Preview Dialog (with Attribute Table & Colormap Opacity) */}
      <DatasetPreviewDialog
        isOpen={!!previewDataset}
        onClose={() => setPreviewDataset(null)}
        dataset={previewDataset}
        source={source}
        onOpenColab={(ds) => setColabDataset(ds)}
        onOpenClip={(ds) => setClipDataset(ds)}
      />

      {/* District & AOI Slicer Dialog */}
      <DatasetClipDialog
        isOpen={!!clipDataset}
        onClose={() => setClipDataset(null)}
        dataset={clipDataset}
        source={source}
      />

      {/* Metadata & Tagging Editor Dialog */}
      <DatasetEditDialog
        isOpen={!!editDataset}
        onClose={() => setEditDataset(null)}
        dataset={editDataset}
        source={source}
        onUpdated={() => onRefresh && onRefresh()}
      />

      {/* Colab / GEE Modal */}
      <DatasetColabDialog
        isOpen={!!colabDataset}
        onClose={() => setColabDataset(null)}
        dataset={colabDataset}
      />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Delete Dataset?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>?
              This action removes the dataset files and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget && onDelete) {
                  onDelete(deleteTarget.id, deleteTarget.source ?? source);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete Dataset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {propertiesDataset && (
        <DatasetPropertiesDialog
          dataset={propertiesDataset}
          source={propertiesDataset.source ?? source}
          onClose={() => setPropertiesDataset(null)}
          onOpenPreview={(ds) => {
            setPropertiesDataset(null);
            setPreviewDataset(ds);
          }}
          onOpenClip={(ds) => {
            setPropertiesDataset(null);
            setClipDataset(ds);
          }}
          onOpenColab={(ds) => {
            setPropertiesDataset(null);
            setColabDataset(ds);
          }}
          onOpenEdit={(ds) => {
            setPropertiesDataset(null);
            setEditDataset(ds);
          }}
          onDelete={onDelete ? () => {
            setPropertiesDataset(null);
            setDeleteTarget(propertiesDataset);
          } : undefined}
          canEdit={canEdit}
        />
      )}

      {/* Right-click context menu portal */}
      {contextMenu.render()}
    </div>
  );
}

function OfficialTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showMap, setShowMap] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(null);

  const { data } = useQuery({
    queryKey: ["datasets", "admin"],
    queryFn: () => api.datasets.list("admin"),
    initialData: { records: DEFAULT_OFFICIAL_DATASETS },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const records = (data?.records && data.records.length > 0) ? data.records : DEFAULT_OFFICIAL_DATASETS;

  const deleteMut = useMutation({
    mutationFn: ({ id, source }: { id: string; source: string }) => api.datasets.delete(id, source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "admin"] });
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      toast({ title: "Dataset deleted successfully." });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message || "Failed to delete dataset",
      });
    },
  });

  return (
    <div className="space-y-4">
      <SummaryRow
        records={records}
        source="admin"
      />

      <DatasetList
        records={records}
        source="admin"
        selectedId={selectedDataset?.id}
        onSelect={(r) => setSelectedDataset(r)}
        onRefresh={() => qc.invalidateQueries({ queryKey: ["datasets", "admin"] })}
        onDelete={isAdmin ? (id, src) => deleteMut.mutate({ id, source: src }) : undefined}
      />
    </div>
  );
}

/* ── Standalone Unfoldable Contribute Panel ───────────────────────── */
function ContributePanel({
  onClose,
  defaultSource = "community",
}: {
  onClose?: () => void;
  defaultSource?: string;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [targetSource, setTargetSource] = useState(defaultSource);
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadContrib, setUploadContrib] = useState(user?.username || "");
  const [uploadCategory, setUploadCategory] = useState("Other / General");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkContrib, setLinkContrib] = useState(user?.username || "");

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("name", uploadName);
      fd.append("description", uploadDesc);
      fd.append("contributor", uploadContrib);
      fd.append("category", uploadCategory);
      fd.append("source", targetSource);
      setUploadProgress(0);
      return api.datasets.uploadWithProgress(fd, (pct) => {
        setUploadProgress(pct);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "admin"] });
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      setFile(null);
      setUploadName("");
      setUploadDesc("");
      setUploadContrib("");
      setUploadProgress(null);
      toast({
        title: "Upload Completed",
        description: `Your dataset has been published to the ${targetSource === "admin" ? "Official" : "Community"} repository.`,
      });
      if (onClose) onClose();
    },
    onError: (err: any) => {
      setUploadProgress(null);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message || "Failed to upload file.",
      });
    },
  });

  const linkMut = useMutation({
    mutationFn: () =>
      api.datasets.addLink({
        url: linkUrl,
        name: linkName,
        description: linkDesc,
        contributor: linkContrib,
        category: uploadCategory,
        source: targetSource,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "admin"] });
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      setLinkUrl("");
      setLinkName("");
      setLinkDesc("");
      setLinkContrib("");
      toast({
        title: "Dataset Linked",
        description: "Dataset metadata extracted and registered successfully.",
      });
      if (onClose) onClose();
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Link Failed",
        description: err.message || "Could not link dataset from URL.",
      });
    },
  });

  return (
    <div className="border border-border/80 rounded-2xl p-5 bg-card/95 backdrop-blur-md shadow-xl space-y-4 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <Upload className="w-4 h-4 text-primary" />
            Contribute Dataset to Data Vault
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a GeoTIFF, Shapefile (.zip), GeoJSON or CSV file, or link an existing dataset hosted on GitHub / Cloud.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <div className="flex items-center gap-1.5 text-xs bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60">
              <span className="text-muted-foreground text-[11px] font-medium">Destination:</span>
              <select
                value={targetSource}
                onChange={(e) => setTargetSource(e.target.value)}
                className="h-6 text-xs bg-background border border-input rounded px-1.5 font-medium cursor-pointer"
              >
                <option value="community">Community Vault</option>
                <option value="admin">Official Vault</option>
              </select>
            </div>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
              onClick={onClose}
              title="Close contribute panel"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
        {/* Option 1: Direct File Upload */}
        <div className="border border-border/70 rounded-xl p-4 bg-background space-y-3">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
            <Upload className="w-3.5 h-3.5 text-primary" /> Option 1: Direct File Upload
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Geospatial File (.tif, .zip, .csv, .geojson)</Label>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !uploadName) {
                    setUploadName(f.name.replace(/\.[^/.]+$/, ""));
                  }
                }}
                className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
              {file && file.size > 50 * 1024 * 1024 && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>Large file detected ({(file.size / (1024 * 1024)).toFixed(1)} MB):</strong> High-speed direct Cloudflare R2 Vault acceleration enabled (up to 50 GB supported).
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dataset Name *</Label>
                <Input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Rwanda Land Cover 2024"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contributor Name / Org</Label>
                <Input
                  value={uploadContrib}
                  onChange={(e) => setUploadContrib(e.target.value)}
                  placeholder="e.g. REMA, GIS Lab"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs"
              >
                {CATEGORIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Key details, methodology, resolution..."
                className="h-8 text-xs"
              />
            </div>

            <Button
              onClick={() => uploadMut.mutate()}
              disabled={uploadMut.isPending || !file || !uploadName}
              className="w-full gap-2 text-xs h-8.5 mt-2 cursor-pointer"
            >
              {uploadMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Publish to {targetSource === "admin" ? "Official Vault" : "Community Vault"}
            </Button>

            {uploadProgress !== null && (
              <div className="w-full mt-2 space-y-1.5 animate-in fade-in duration-200">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    {uploadProgress < 100 ? (
                      <>
                        <Upload className="w-3.5 h-3.5 animate-pulse text-primary" />
                        Uploading to High-Speed Vault ({uploadProgress}%)…
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                        Finalizing and publishing to vault…
                      </>
                    )}
                  </span>
                  <span className="font-bold text-primary">
                    {uploadProgress < 100 ? `${uploadProgress}%` : "Finalizing"}
                  </span>
                </div>
                <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      uploadProgress >= 100 ? "bg-gradient-to-r from-emerald-500 to-teal-500 animate-pulse w-full" : "bg-gradient-to-r from-primary to-emerald-500"
                    }`}
                    style={{ width: uploadProgress >= 100 ? "100%" : `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Option 2: Remote URL / GitHub Link Box */}
        <div className="border border-border/70 rounded-xl p-4 bg-background space-y-3">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
            <LinkIcon className="w-3.5 h-3.5 text-primary" /> Option 2: Link from GitHub / Remote URL
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Remote URL *</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://github.com/.../raw/main/data.geojson or raw direct link"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dataset Name *</Label>
                <Input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="e.g. Rwanda Hydrography Network"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contributor Name / Org</Label>
                <Input
                  value={linkContrib}
                  onChange={(e) => setLinkContrib(e.target.value)}
                  placeholder="e.g. OpenStreetMap, RCMRD"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={linkDesc}
                onChange={(e) => setLinkDesc(e.target.value)}
                placeholder="Short description or source citation"
                className="h-8 text-xs"
              />
            </div>

            <Button
              onClick={() => linkMut.mutate()}
              disabled={linkMut.isPending || !linkUrl || !linkName}
              variant="outline"
              className="w-full gap-2 text-xs h-8.5 mt-2 hover:bg-primary/5 hover:border-primary cursor-pointer"
            >
              {linkMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              Register Remote Dataset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommunityTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showMap, setShowMap] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(null);

  const { data } = useQuery({
    queryKey: ["datasets", "community"],
    queryFn: () => api.datasets.list("community"),
    initialData: { records: DEFAULT_COMMUNITY_DATASETS },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const records = (data?.records && data.records.length > 0) ? data.records : DEFAULT_COMMUNITY_DATASETS;

  const deleteMut = useMutation({
    mutationFn: ({ id, source }: { id: string; source: string }) => api.datasets.delete(id, source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      toast({ title: "Dataset removed from community repository." });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message || "Failed to delete dataset",
      });
    },
  });

  return (
    <div className="space-y-6">
      <SummaryRow
        records={records}
        source="community"
      />

      <DatasetList
        records={records}
        source="community"
        selectedId={selectedDataset?.id}
        onSelect={(r) => setSelectedDataset(r)}
        onRefresh={() => qc.invalidateQueries({ queryKey: ["datasets", "community"] })}
        onDelete={user ? (id, src) => deleteMut.mutate({ id, source: src }) : undefined}
      />
    </div>
  );
}

function AdminTab() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Topography & Elevation");
  const [showMap, setShowMap] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const fallbackAll = [...DEFAULT_OFFICIAL_DATASETS, ...DEFAULT_COMMUNITY_DATASETS];
  const { data } = useQuery({
    queryKey: ["datasets", "all"],
    queryFn: () => api.datasets.list("all"),
    initialData: { records: fallbackAll },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const records = (data?.records && data.records.length > 0) ? data.records : fallbackAll;

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("name", uploadName);
      fd.append("description", uploadDesc);
      fd.append("category", uploadCategory);
      fd.append("source", "admin");
      setUploadProgress(0);
      return api.datasets.uploadWithProgress(fd, (pct) => setUploadProgress(pct));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      qc.invalidateQueries({ queryKey: ["datasets", "admin"] });
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      setFile(null);
      setUploadName("");
      setUploadDesc("");
      setUploadProgress(null);
      toast({ title: "Official dataset published successfully!" });
    },
    onError: (err: any) => {
      setUploadProgress(null);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message || "Failed to publish official dataset.",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, source }: { id: string; source: string }) => api.datasets.delete(id, source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "all"] });
      qc.invalidateQueries({ queryKey: ["datasets", "admin"] });
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      toast({ title: "Dataset deleted from all repositories." });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message || "Failed to delete dataset",
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Official Upload Admin Form */}
      <div className="border border-primary/30 rounded-2xl p-5 bg-card shadow-xs space-y-3">
        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
          <Upload className="w-4 h-4 text-primary" />
          Publish Official System Dataset
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">File (.tif, .zip, .csv, .geojson)</Label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !uploadName) setUploadName(f.name.replace(/\.[^/.]+$/, ""));
              }}
              className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
            />
            {file && file.size > 50 * 1024 * 1024 && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] mt-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  <strong>Large file ({(file.size / (1024 * 1024)).toFixed(1)} MB):</strong> High-speed direct Cloudflare R2 Vault acceleration active.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Official Name *</Label>
            <Input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. Rwanda DEM 30m"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
            >
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Official Description</Label>
            <Input
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="Administrative dataset description"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <Button
          onClick={() => uploadMut.mutate()}
          disabled={uploadMut.isPending || !file || !uploadName}
          className="gap-2 text-xs h-8 mt-1"
        >
          {uploadMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Publish to Official Vault
        </Button>

        {uploadProgress !== null && (
          <div className="w-full mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                {uploadProgress < 100 ? (
                  <>Uploading dataset bytes…</>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                    Finalizing dataset registration…
                  </>
                )}
              </span>
              <span className="font-semibold text-primary">
                {uploadProgress < 100 ? `${uploadProgress}%` : "Processing"}
              </span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  uploadProgress >= 100 ? "bg-amber-500 animate-pulse w-full" : "bg-primary"
                }`}
                style={{ width: uploadProgress >= 100 ? "100%" : `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <SummaryRow
        records={records}
        source="admin"
      />

      <DatasetList
        records={records}
        source="all"
        selectedId={selectedDataset?.id}
        onSelect={(r) => setSelectedDataset(r)}
        onRefresh={() => qc.invalidateQueries({ queryKey: ["datasets", "all"] })}
        onDelete={(id, src) => deleteMut.mutate({ id, source: src })}
      />
    </div>
  );
}

export function RareDataPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [isContributeOpen, setIsContributeOpen] = useState(false);

  return (
    <div className="flex h-full overflow-y-auto bg-background/50">
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
          <div>
            <div className="flex items-center gap-2.5 text-foreground font-extrabold text-2xl tracking-tight">
              <div className="p-2 bg-primary/10 rounded-xl text-primary border border-primary/20 shadow-2xs">
                <Database className="w-6 h-6" />
              </div>
              Data Vault
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Curated repository for high-resolution satellite rasters, shapefiles, digital elevation models, and ground truth datasets across Rwanda.
            </p>
          </div>

          {/* Unfoldable Contribute Icon Button */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={isContributeOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setIsContributeOpen((v) => !v)}
              className={`gap-2 h-9 px-3.5 text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer ${
                isContributeOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                  : "hover:border-primary hover:text-primary hover:bg-primary/5 bg-card"
              }`}
              title={isContributeOpen ? "Collapse contribution options" : "Upload or link a new dataset to repository"}
            >
              <Upload className="w-4 h-4" />
              <span>Contribute Dataset</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isContributeOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>
        </div>

        {/* Unfolded Contribution & Upload Panel */}
        {isContributeOpen && (
          <div className="animate-in fade-in-0 slide-in-from-top-3 duration-200">
            <ContributePanel onClose={() => setIsContributeOpen(false)} />
          </div>
        )}

        {/* Tabbed Repository Interface */}
        <Tabs defaultValue="official" className="space-y-6">
          <TabsList className="bg-muted/70 p-1 rounded-xl border border-border/80 h-10">
            <TabsTrigger value="official" className="rounded-lg text-xs font-semibold px-4">
              Official Datasets
            </TabsTrigger>
            <TabsTrigger value="community" className="rounded-lg text-xs font-semibold px-4">
              Community Vault
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="rounded-lg text-xs font-semibold px-4 gap-1.5 text-purple-600 dark:text-purple-400">
                <Lock className="w-3 h-3" /> Admin Console
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="official" className="focus-visible:outline-hidden">
            <OfficialTab />
          </TabsContent>

          <TabsContent value="community" className="focus-visible:outline-hidden">
            <CommunityTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="focus-visible:outline-hidden">
              <AdminTab />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
