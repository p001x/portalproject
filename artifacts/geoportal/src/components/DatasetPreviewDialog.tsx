import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  Code2, 
  Loader2, 
  AlertCircle, 
  MapPin, 
  Database,
  Calendar,
  User,
  HardDrive,
  Table,
  Layers,
  Scissors,
  Search,
  FileSpreadsheet,
  Palette
} from "lucide-react";
import { MapContainer, TileLayer, ImageOverlay, GeoJSON, Rectangle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, BASE, type DatasetRecord } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface DatasetPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: DatasetRecord | null;
  source: string;
  onOpenColab?: (dataset: DatasetRecord) => void;
  onOpenClip?: (dataset: DatasetRecord) => void;
}

function PreviewMapBounds({ bounds }: { bounds: any }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && Array.isArray(bounds) && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [20, 20], animate: true });
    }
  }, [bounds, map]);
  return null;
}

export function DatasetPreviewDialog({
  isOpen,
  onClose,
  dataset,
  source,
  onOpenColab,
  onOpenClip,
}: DatasetPreviewDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"map" | "table">("map");

  // Raster Styling Controls
  const [rasterOpacity, setRasterOpacity] = useState<number>(85);

  // Table Search & Pagination
  const [tableSearch, setTableSearch] = useState<string>("");
  const [tablePage, setTablePage] = useState<number>(0);
  const pageSize = 15;

  useEffect(() => {
    if (!isOpen || !dataset) {
      setPreviewData(null);
      setError(null);
      setActiveTab("map");
      setTableSearch("");
      setTablePage(0);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.datasets
      .preview(dataset.id, dataset.source || source)
      .then((data) => {
        if (isMounted) {
          setPreviewData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn("Full dataset preview fetch warning:", err);
          setError(err.message || "Failed to load live map layer. Showing bounding box overview.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, dataset, source]);

  // Extract Vector / Tabular Attribute Table Rows & Columns (Unconditional hook)
  const { tableColumns, tableRows } = useMemo(() => {
    if (!previewData) return { tableColumns: [], tableRows: [] };

    let features: any[] = [];
    if (previewData.type === "FeatureCollection" && Array.isArray(previewData.features)) {
      features = previewData.features;
    } else if (Array.isArray(previewData.features)) {
      features = previewData.features;
    } else if (previewData.type === "Feature" && previewData.properties) {
      features = [previewData];
    }

    if (features.length === 0) return { tableColumns: [], tableRows: [] };

    // Extract property keys from all features
    const keySet = new Set<string>();
    features.forEach((f) => {
      if (f.properties && typeof f.properties === "object") {
        Object.keys(f.properties).forEach((k) => keySet.add(k));
      }
    });

    const columns = Array.from(keySet);
    const rows = features.map((f, idx) => ({
      _id: idx,
      ...f.properties,
    }));

    return { tableColumns: columns, tableRows: rows };
  }, [previewData]);

  // Filtered rows for attribute table (Unconditional hook)
  const filteredRows = useMemo(() => {
    if (!tableSearch.trim()) return tableRows;
    const q = tableSearch.toLowerCase();
    return tableRows.filter((r) =>
      Object.values(r).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [tableRows, tableSearch]);

  // Paged rows for attribute table (Unconditional hook)
  const pagedRows = useMemo(() => {
    const start = tablePage * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, tablePage]);

  // Guard after all React hooks have run
  if (!isOpen || !dataset) return null;

  const downloadUrl = `${BASE}/datasets/${dataset.id}/download?source=${dataset.source || source}`;
  const origin = window.location.origin;
  const directDownloadFullUrl = `${origin}${downloadUrl}`;

  const copyDirectLink = () => {
    navigator.clipboard.writeText(directDownloadFullUrl);
    setCopied(true);
    toast({
      title: "Link Copied!",
      description: "Direct dataset download URL copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine bounds for map
  let mapBounds: [[number, number], [number, number]] | null = null;
  if (previewData?.bounds && Array.isArray(previewData.bounds)) {
    mapBounds = previewData.bounds;
  } else if (dataset.bbox && dataset.bbox.length === 4) {
    const [minx, miny, maxx, maxy] = dataset.bbox;
    mapBounds = [
      [miny, minx],
      [maxy, maxx],
    ];
  }

  const defaultCenter: [number, number] = mapBounds
    ? [(mapBounds[0][0] + mapBounds[1][0]) / 2, (mapBounds[0][1] + mapBounds[1][1]) / 2]
    : [-1.94, 29.87];

  const exportTableAsCsv = () => {
    if (tableRows.length === 0) return;
    const header = tableColumns.join(",");
    const csvContent = [
      header,
      ...tableRows.map((row) =>
        tableColumns
          .map((col) => {
            const val = row[col] ?? "";
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name}_attribute_table.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasVectorData = tableColumns.length > 0;
  const isRaster = dataset.file_type === "tiff" || dataset.file_type === "raster";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                  <Database className="w-5 h-5 text-primary" />
                  {dataset.name}
                </DialogTitle>
                {dataset.category && (
                  <Badge variant="secondary" className="text-[11px] font-medium">
                    {dataset.category}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {dataset.description || dataset.original_filename || "Dataset preview, spatial extent & attribute inspection"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="uppercase font-semibold text-xs px-2.5 py-0.5">
                {dataset.file_type}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* View Mode Tabs (Map Layer vs Attribute Table) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === "map" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("map")}
                className="h-8 text-xs gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                Map View
              </Button>

              {hasVectorData && (
                <Button
                  variant={activeTab === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab("table")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Table className="w-3.5 h-3.5" />
                  Attribute Table ({tableRows.length})
                </Button>
              )}
            </div>

            {/* Quick Clip Trigger */}
            {dataset.bbox && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  if (onOpenClip) onOpenClip(dataset);
                }}
                className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <Scissors className="w-3.5 h-3.5" />
                Clip by District
              </Button>
            )}
          </div>

          {/* TAB 1: Live Interactive Map */}
          {activeTab === "map" && (
            <div className="space-y-2">
              <div className="relative rounded-xl border border-border/80 overflow-hidden h-[340px] w-full bg-muted/20 shadow-xs">
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-xs z-20 gap-2">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground font-medium">
                      Generating spatial preview…
                    </span>
                  </div>
                ) : null}

                {mapBounds ? (
                  <MapContainer
                    key={dataset.id}
                    center={defaultCenter}
                    zoom={9}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, USGS"
                    />

                    <PreviewMapBounds bounds={mapBounds} />

                    {/* Raster Image Overlay with dynamic opacity */}
                    {previewData?.type === "image" && previewData?.data ? (
                      <ImageOverlay
                        url={previewData.data}
                        bounds={mapBounds}
                        opacity={rasterOpacity / 100}
                      />
                    ) : null}

                    {/* GeoJSON Vector Layer */}
                    {previewData?.type === "FeatureCollection" ||
                    previewData?.type === "Feature" ||
                    previewData?.features ? (
                      <GeoJSON
                        key={`geojson-${dataset.id}`}
                        data={previewData}
                        style={{
                          color: "#3b82f6",
                          weight: 2,
                          fillColor: "#60a5fa",
                          fillOpacity: 0.35,
                        }}
                      />
                    ) : null}

                    {/* Fallback Bounding Box Rectangle */}
                    {(!previewData || previewData.type === "bbox" || previewData.type === "metadata") && (
                      <Rectangle
                        bounds={mapBounds}
                        pathOptions={{
                          color: "#f59e0b",
                          weight: 2,
                          fillColor: "#f59e0b",
                          fillOpacity: 0.2,
                        }}
                      />
                    )}
                  </MapContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
                    <MapPin className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">Non-spatial / Tabular Dataset</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This dataset does not define a geographic bounding box extent.
                    </p>
                  </div>
                )}
              </div>

              {/* Raster Opacity Slider Bar */}
              {isRaster && previewData?.type === "image" && (
                <div className="flex items-center gap-4 px-3 py-2 bg-muted/30 border border-border/60 rounded-lg text-xs">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5 shrink-0">
                    <Palette className="w-3.5 h-3.5" /> Layer Opacity:
                  </span>
                  <div className="flex-1 max-w-xs">
                    <Slider
                      value={[rasterOpacity]}
                      min={10}
                      max={100}
                      step={5}
                      onValueChange={(vals) => setRasterOpacity(vals[0])}
                    />
                  </div>
                  <span className="font-semibold text-foreground tabular-nums">{rasterOpacity}%</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Vector / CSV Attribute Table Inspector */}
          {activeTab === "table" && hasVectorData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setTablePage(0);
                    }}
                    placeholder="Search attributes & rows..."
                    className="pl-8 h-8 text-xs bg-background"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportTableAsCsv}
                  className="h-8 text-xs gap-1.5 shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  Export Table as CSV
                </Button>
              </div>

              <div className="rounded-xl border border-border/80 overflow-hidden max-h-[300px] overflow-y-auto bg-card shadow-2xs">
                <table className="w-full text-xs">
                  <thead className="bg-muted/70 sticky top-0 border-b border-border/80 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left w-12 font-mono">#</th>
                      {tableColumns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pagedRows.map((row, i) => (
                      <tr key={row._id} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {tablePage * pageSize + i + 1}
                        </td>
                        {tableColumns.map((col) => (
                          <td key={col} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                            {row[col] != null ? String(row[col]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>
                  {filteredRows.length === 0
                    ? "No records match your search"
                    : `Showing ${tablePage * pageSize + 1} to ${Math.min((tablePage + 1) * pageSize, filteredRows.length)} of ${filteredRows.length} records`}
                </span>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tablePage === 0}
                    onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                    className="h-7 px-2 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(tablePage + 1) * pageSize >= filteredRows.length}
                    onClick={() => setTablePage((p) => p + 1)}
                    className="h-7 px-2 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2.5 rounded-md flex items-center gap-2 border border-amber-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dataset Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/60 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1 font-medium text-[11px]">
              <HardDrive className="w-3.5 h-3.5" /> File Size
            </span>
            <p className="font-semibold text-foreground">
              {dataset.file_size_mb ? `${dataset.file_size_mb.toFixed(2)} MB` : "—"}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1 font-medium text-[11px]">
              <User className="w-3.5 h-3.5" /> Contributor
            </span>
            <p className="font-semibold text-foreground truncate">
              {dataset.contributor || "Official (Admin)"}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1 font-medium text-[11px]">
              <Calendar className="w-3.5 h-3.5" /> Uploaded
            </span>
            <p className="font-semibold text-foreground">
              {dataset.upload_date ? new Date(dataset.upload_date).toLocaleDateString() : "—"}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1 font-medium text-[11px]">
              Status
            </span>
            <p className={`font-semibold capitalize ${dataset.status === "ok" || dataset.status === "ready" ? "text-emerald-500" : "text-amber-500"}`}>
              {dataset.status === "ok" ? "Ready" : dataset.status}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyDirectLink}
              className="gap-1.5 text-xs h-8"
              title="Copy direct file download URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Direct Link"}
            </Button>

            {onOpenColab && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenColab(dataset);
                }}
                className="gap-1.5 text-xs h-8 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
              >
                <Code2 className="w-3.5 h-3.5" />
                Colab / GEE Code
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">
              Close
            </Button>

            <a href={downloadUrl} download>
              <Button size="sm" className="gap-1.5 text-xs h-8">
                <Download className="w-3.5 h-3.5" />
                Download Dataset
              </Button>
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
