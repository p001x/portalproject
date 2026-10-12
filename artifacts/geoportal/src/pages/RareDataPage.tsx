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
  Tag
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
import { DatasetSpatialMap } from "@/components/DatasetSpatialMap";

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
  showMap,
  onToggleMap,
}: { 
  records: DatasetRecord[]; 
  source: string;
  showMap: boolean;
  onToggleMap: () => void;
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
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleMap}
          className={`h-8 text-xs gap-1.5 transition-all ${showMap ? "bg-primary/10 border-primary text-primary" : ""}`}
        >
          <Layers className="w-3.5 h-3.5" />
          {showMap ? "Hide Extents Map" : "Show Extents Map"}
        </Button>

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
                <th className="text-left px-4 py-3 font-semibold text-xs">Dataset Name & Metadata</th>
                <th className="text-left px-4 py-3 font-semibold text-xs">Format</th>
                <th className="text-right px-4 py-3 font-semibold text-xs">Size (MB)</th>
                <th className="text-left px-4 py-3 font-semibold text-xs">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-xs pr-6">Operational Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRecords.map((r, i) => {
                const isSelected = r.id === selectedId;
                return (
                  <tr 
                    key={r.id} 
                    className={`transition-colors group hover:bg-muted/40 ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}
                    onClick={() => onSelect && onSelect(r)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.name}
                        </span>
                        {r.category && (
                          <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.2 rounded font-medium">
                            {r.category}
                          </span>
                        )}
                        {r.bbox && r.bbox.length === 4 && (
                          <span title="Has spatial coordinates" className="inline-flex text-[10px] items-center text-primary bg-primary/10 px-1.5 py-0.2 rounded font-medium">
                            <MapPin className="w-2.5 h-2.5 mr-0.5" /> Spatial
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

                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} errorMessage={r.error_message} />
                    </td>

                    <td className="px-4 py-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1. Preview Modal */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 hover:border-primary hover:text-primary"
                          onClick={() => setPreviewDataset(r)}
                          title="Preview dataset on interactive map & inspect attribute table"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </Button>

                        {/* 2. District & AOI Slicer / Clip */}
                        {r.bbox && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => setClipDataset(r)}
                            title="Clip and extract dataset by Rwanda district or custom AOI"
                          >
                            <Scissors className="w-3 h-3" />
                            Clip
                          </Button>
                        )}

                        {/* 3. Colab / GEE Integration Snippet */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                          onClick={() => setColabDataset(r)}
                          title="Generate Python, GEE & Google Colab code snippet"
                        >
                          <Code2 className="w-3 h-3" />
                          Colab
                        </Button>

                        {/* 4. Edit Metadata (Admin or Logged-in Contributor) */}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditDataset(r)}
                            title="Edit dataset name, description, tags"
                            aria-label="Edit dataset details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {/* 5. Copy Link */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => copyDownloadLink(r)}
                          title="Copy direct download URL"
                          aria-label="Copy direct download URL"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>

                        {/* 6. Direct Download */}
                        <a
                          href={`${BASE}/datasets/${r.id}/download?source=${r.source ?? source}`}
                          download
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title="Download dataset file"
                            aria-label="Download dataset file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </a>

                        {/* 7. Delete (with confirmation dialog) */}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(r)}
                            title="Delete dataset"
                            aria-label="Delete dataset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
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

  const { data, isLoading } = useQuery({
    queryKey: ["datasets", "admin"],
    queryFn: () => api.datasets.list("admin"),
  });
  const records = data?.records ?? [];

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading official repository…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryRow
        records={records}
        source="admin"
        showMap={showMap}
        onToggleMap={() => setShowMap(!showMap)}
      />

      {showMap && (
        <DatasetSpatialMap
          records={records}
          selectedId={selectedDataset?.id}
          onSelect={(r) => setSelectedDataset(r)}
        />
      )}

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

function CommunityTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showMap, setShowMap] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["datasets", "community"],
    queryFn: () => api.datasets.list("community"),
  });
  const records = data?.records ?? [];

  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadContrib, setUploadContrib] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Other / General");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkContrib, setLinkContrib] = useState("");

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("name", uploadName);
      fd.append("description", uploadDesc);
      fd.append("contributor", uploadContrib);
      fd.append("category", uploadCategory);
      fd.append("source", "community");
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
        description: "Your dataset has been added to the community repository.",
      });
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
        source: "community",
      }),
    onSuccess: () => {
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
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Link Failed",
        description: err.message || "Could not link dataset from URL.",
      });
    },
  });

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading community uploads…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryRow
        records={records}
        source="community"
        showMap={showMap}
        onToggleMap={() => setShowMap(!showMap)}
      />

      {showMap && (
        <DatasetSpatialMap
          records={records}
          selectedId={selectedDataset?.id}
          onSelect={(r) => setSelectedDataset(r)}
        />
      )}

      <DatasetList
        records={records}
        source="community"
        selectedId={selectedDataset?.id}
        onSelect={(r) => setSelectedDataset(r)}
        onRefresh={() => qc.invalidateQueries({ queryKey: ["datasets", "community"] })}
        onDelete={user ? (id, src) => deleteMut.mutate({ id, source: src }) : undefined}
      />

      {/* Contribution Forms Tabs */}
      <div className="border border-border/80 rounded-2xl p-5 bg-card/60 shadow-xs space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
          <Upload className="w-4 h-4 text-primary" />
          Contribute a Dataset to the Community
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a GeoTIFF, Shapefile (.zip), GeoJSON or CSV file, or link an existing dataset hosted on GitHub / Cloud.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* File Upload Box */}
          <div className="border border-border/70 rounded-xl p-4 bg-background space-y-3">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <Upload className="w-3.5 h-3.5" /> Option 1: Direct File Upload
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
                className="w-full gap-2 text-xs h-8.5 mt-2"
              >
                {uploadMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload to Community Vault
              </Button>

              {uploadProgress !== null && (
                <div className="w-full mt-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      {uploadProgress < 100 ? (
                        <>Uploading dataset bytes…</>
                      ) : (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          Processing & extracting metadata on server…
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
          </div>

          {/* Remote URL / GitHub Link Box */}
          <div className="border border-border/70 rounded-xl p-4 bg-background space-y-3">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <LinkIcon className="w-3.5 h-3.5" /> Option 2: Link from GitHub / Remote URL
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
                className="w-full gap-2 text-xs h-8.5 mt-2 hover:bg-primary/5 hover:border-primary"
              >
                {linkMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                Register Remote Dataset
              </Button>
            </div>
          </div>
        </div>
      </div>
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

  const { data, isLoading } = useQuery({
    queryKey: ["datasets", "all"],
    queryFn: () => api.datasets.list("all"),
  });
  const records = data?.records ?? [];

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
          Publish to Official Repository
        </Button>

        {uploadProgress !== null && (
          <div className="w-full mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                {uploadProgress < 100 ? (
                  <>Uploading dataset bytes…</>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                    Processing & extracting metadata on server…
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
        showMap={showMap}
        onToggleMap={() => setShowMap(!showMap)}
      />

      {showMap && (
        <DatasetSpatialMap
          records={records}
          selectedId={selectedDataset?.id}
          onSelect={(r) => setSelectedDataset(r)}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading all datasets…
        </div>
      ) : (
        <DatasetList
          records={records}
          source="all"
          selectedId={selectedDataset?.id}
          onSelect={(r) => setSelectedDataset(r)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["datasets", "all"] })}
          onDelete={(id, src) => deleteMut.mutate({ id, source: src })}
        />
      )}
    </div>
  );
}

export function RareDataPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

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
              RARE DATA — Dataset Repository
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Curated repository for high-resolution satellite rasters, shapefiles, digital elevation models, and ground truth data across Rwanda.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card px-3 py-1.5 rounded-lg border border-border">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Dataset Repository</span>
          </div>
        </div>

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
