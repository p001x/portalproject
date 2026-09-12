import React, { useMemo, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  Database,
  Cloud,
  Eye,
  PlusCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Layers,
  FileCode,
  Archive,
  Table,
  Satellite,
  Compass,
  Link as LinkIcon,
  Sparkles,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  Check,
  Square,
  Trash2,
  Code2,
  Globe2,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapContainer, TileLayer, ImageOverlay, GeoJSON, Rectangle as LeafletRectangle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import { api, BASE } from "@/lib/api";
import { useHarvesterStore, HarvesterItem } from "@/lib/harvesterStore";
import { DatasetColabDialog } from "@/components/DatasetColabDialog";

function HarvesterMapBoundsController({ bbox }: { bbox?: number[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bbox && bbox.length === 4) {
      const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ];
      try {
        map.fitBounds(bounds, { padding: [40, 40] });
      } catch (e) {}
    }
  }, [bbox, map]);
  return null;
}

interface DatasetHarvesterProps {
  onPreviewRaster?: (url: string, name?: string) => void;
  onPreviewGeoJSON?: (geojson: any) => void;
  onImportVectorSamples?: (url: string, classLabel: string) => void;
  defaultClassLabel?: string;
}

export function DatasetHarvester({
  onPreviewRaster,
  onPreviewGeoJSON,
  onImportVectorSamples,
  defaultClassLabel = "Harvested_Class",
}: DatasetHarvesterProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedColabDataset, setSelectedColabDataset] = useState<any | null>(null);

  // Embedded Map Preview Modal State
  const [modalPreviewItem, setModalPreviewItem] = useState<HarvesterItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalGeoJSON, setModalGeoJSON] = useState<any | null>(null);
  const [modalImage, setModalImage] = useState<{ url: string; bounds: [[number, number], [number, number]] } | null>(null);
  const [modalRasterUrl, setModalRasterUrl] = useState<string | null>(null);
  const [modalBbox, setModalBbox] = useState<number[] | null>(null);

  const {
    inputUrl,
    scanResult,
    activeFilter,
    searchQuery,
    customClassLabel,
    geeTasks,
    setInputUrl,
    setScanResult,
    setActiveFilter,
    setSearchQuery,
    setCustomClassLabel,
    setGeeTask,
    removeGeeTask,
    cancelGeeTask,
    startPollingGeeTask,
  } = useHarvesterStore();

  const [savingItemIds, setSavingItemIds] = useState<Record<string, boolean>>({});
  const [savingProgressIds, setSavingProgressIds] = useState<Record<string, number>>({});
  const [savedItemIds, setSavedItemIds] = useState<Record<string, string>>({});

  // ── Preset Quick Demo Feeds ────────────────────────────────────────────────
  const QUICK_SOURCES = [
    {
      label: "🇷🇼 Rwanda Water Portal (RWB)",
      url: "https://waterportal.rwb.rw/",
      type: "govt",
    },
    {
      label: "Mapbox GeoTIFF Sample",
      url: "https://github.com/mapbox/rasterio/raw/master/tests/data/RGB.byte.tif",
      type: "raster",
    },
    {
      label: "Sentinel-2 COG (AWS)",
      url: "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/M/BE/2024/1/S2A_36MBE_20240115_0_L2A/B04.tif",
      type: "raster",
    },
    {
      label: "Sentinel-2 STAC Item",
      url: "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_36MBE_20240115_0_L2A",
      type: "stac",
    },
    {
      label: "USGS Elevation 3DEP COG",
      url: "https://s3.amazonaws.com/elevation-tiles-prod/geotiff/12/2340/1600.tif",
      type: "usgs",
    },
    {
      label: "GDAL Zipped Shapefiles",
      url: "https://github.com/OSGeo/gdal/raw/master/autotest/gdrivers/data/small_world.zip",
      type: "archive",
    },
  ];

  // ── Scan Mutation ──────────────────────────────────────────────────────────
  const scanMut = useMutation({
    mutationFn: (urlToScan: string) => api.harvester.scan(urlToScan),
    onSuccess: (data) => {
      setScanResult(data);
      toast({
        title: `Scan Complete: ${data.count} Datasets Found!`,
        description: `Source: ${data.title} (${data.source_type})`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: err.message || "Could not read data from this URL.",
      });
    },
  });

  // ── Save to Portal Storage ────────────────────────────────────────────────
  // ── Save to Portal Storage ────────────────────────────────────────────────
  const handleSaveToPortal = async (item: HarvesterItem) => {
    setSavingItemIds((prev) => ({ ...prev, [item.id]: true }));
    setSavingProgressIds((prev) => ({ ...prev, [item.id]: 0 }));

    try {
      const res = await api.harvester.saveToPortal({
        url: item.url,
        name: item.name,
        class_label: customClassLabel || defaultClassLabel,
        internal_path: item.internal_path,
      });

      const taskId = res.task_id;
      if (!taskId) {
        // Fallback for immediate response (e.g. if the backend changes)
        qc.invalidateQueries({ queryKey: ["datasets"] });
        setSavedItemIds((prev) => ({ ...prev, [item.id]: res.dataset_id || "fallback_id" }));
        setSavingProgressIds((prev) => ({ ...prev, [item.id]: 100 }));
        toast({ title: "Saved to Portal! 🌐", description: res.message });
        setTimeout(() => {
          setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
          setSavingProgressIds((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        }, 1000);
        return;
      }

      // Poll task status
      const pollTimer = setInterval(async () => {
        try {
          const statusRes = await api.harvester.getTaskStatus(taskId);
          if (statusRes.status === "completed") {
            clearInterval(pollTimer);
            setSavingProgressIds((prev) => ({ ...prev, [item.id]: 100 }));
            qc.invalidateQueries({ queryKey: ["datasets"] });
            
            // Use the actual dataset_id returned from the backend if available, so that
            // Colab/GEE snippet paths exactly match the HF repo path.
            const savedId = statusRes.result_data?.dataset_id || "saved_dataset";
            setSavedItemIds((prev) => ({ ...prev, [item.id]: savedId }));
            
            toast({ title: "Saved to Portal! 🌐", description: statusRes.message });
            setTimeout(() => {
              setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
              setSavingProgressIds((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
            }, 1000);
          } else if (statusRes.status === "failed") {
            clearInterval(pollTimer);
            throw new Error(statusRes.message);
          } else {
            setSavingProgressIds((prev) => ({ ...prev, [item.id]: statusRes.progress || 10 }));
          }
        } catch (e: any) {
          clearInterval(pollTimer);
          setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
          setSavingProgressIds((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
          toast({ variant: "destructive", title: "Save to Portal Failed", description: e.message });
        }
      }, 3500);

    } catch (err: any) {
      setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
      setSavingProgressIds((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
      toast({
        variant: "destructive",
        title: "Save to Portal Failed",
        description: err.message,
      });
    }
  };

  const handleDeleteFromPortal = async (item: HarvesterItem) => {
    const datasetId = savedItemIds[item.id];
    if (!datasetId) return;
    
    try {
      await api.datasets.delete(datasetId, "all");
      setSavedItemIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast({
        title: "Deleted from Portal! 🗑️",
      });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message,
      });
    }
  };


  // ── Push to GEE Assets ────────────────────────────────────────────────────
  const handlePushToGee = async (item: HarvesterItem) => {
    try {
      const res = await api.harvester.pushToGee({
        url: item.url,
      });
      setGeeTask(item.id, {
        taskId: res.task_id,
        progress: 10,
        status: "in_progress",
        message: "Connecting to server...",
      });
      toast({
        title: "GEE Ingestion Task Started! ☁️",
        description: res.message,
      });
      startPollingGeeTask(
        item.id,
        res.task_id,
        (msg) => {
          toast({
            title: "GEE Ingestion Finished! 🛰️",
            description: msg,
          });
        },
        (errMsg) => {
          toast({
            variant: "destructive",
            title: "GEE Ingestion Failed",
            description: errMsg,
          });
        }
      );
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "GEE Upload Failed",
        description: err.message || "Please make sure you are authenticated with GEE.",
      });
    }
  };

  const handleCancelGeeTask = async (itemId: string, taskId: string) => {
    await cancelGeeTask(itemId, taskId);
    toast({
      title: "GEE Task Stopped 🛑",
      description: "The upload process was cancelled.",
    });
  };

  const handleRemoveGeeTask = async (itemId: string, taskId?: string) => {
    await removeGeeTask(itemId, taskId);
    toast({
      title: "Task Removed 🗑️",
      description: "Cleared from your workspace.",
    });
  };

  // ── Direct Map Preview ────────────────────────────────────────────────────
  const handlePreview = async (item: HarvesterItem) => {
    const datasetId = savedItemIds[item.id] || geeTasks[item.id]?.dataset_id;

    // 1. Delegate to parent page callbacks if supplied (e.g. Sample Digitizer)
    if (onPreviewRaster && datasetId && item.category === "raster") {
      onPreviewRaster(datasetId, item.name);
      toast({
        title: "Streaming Raster Map Overlay 🗺️",
        description: `Loaded '${item.name}' natively onto Leaflet.`,
      });
      return;
    }
    if (onPreviewGeoJSON && datasetId && item.category !== "raster") {
      try {
        const resp = await api.datasets.preview(datasetId, "admin");
        if (resp.type === "geojson" || resp.features || resp.type === "FeatureCollection") {
          onPreviewGeoJSON(resp.geojson || resp);
          toast({
            title: "Vector Features Rendered! 📍",
            description: `Loaded GeoJSON '${item.name}' onto map.`,
          });
          return;
        }
      } catch (e) {}
    }

    // 2. Otherwise open built-in interactive Map Preview Modal
    setModalPreviewItem(item);
    setModalGeoJSON(null);
    setModalImage(null);
    setModalRasterUrl(null);
    setModalBbox(null);
    setModalLoading(true);

    try {
      if (datasetId) {
        const resp = await api.datasets.preview(datasetId, "admin");
        
        if (resp.bbox && resp.bbox.length === 4) {
          setModalBbox(resp.bbox);
        } else if (resp.bounds && Array.isArray(resp.bounds) && resp.bounds.length === 2) {
          const [[s, w], [n, e]] = resp.bounds;
          setModalBbox([w, s, e, n]);
        }

        if (resp.type === "FeatureCollection" || resp.features || resp.type === "Feature") {
          setModalGeoJSON(resp);
        } else if (resp.geojson) {
          setModalGeoJSON(resp.geojson);
        } else if (resp.type === "image" && resp.data && resp.bounds) {
          setModalImage({ url: resp.data, bounds: resp.bounds });
        } else if (item.category === "raster" || resp.type === "url") {
          setModalRasterUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(datasetId)}`);
        }
      } else {
        // Preview direct from URL before saving if available
        if (item.format === "geojson" || item.url.toLowerCase().endsWith(".geojson")) {
          const r = await fetch(item.url);
          const gj = await r.json();
          setModalGeoJSON(gj);
          try {
            setModalBbox(turf.bbox(gj));
          } catch (e) {}
        } else if (item.category === "raster" || item.format === "tif" || item.format === "cog") {
          setModalRasterUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(item.url)}`);
          fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(item.url)}`)
            .then((r) => r.json())
            .then((b) => {
              if (b.bbox) setModalBbox(b.bbox);
            })
            .catch(() => {});
        } else {
          toast({
            title: "Preview Information",
            description: "Click 'Save to Portal' first to parse archive into full spatial layers.",
          });
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Preview Error",
        description: err.message || "Save dataset to portal first to view full map layer.",
      });
    } finally {
      setModalLoading(false);
    }
  };

  // ── Filtered Datasets ─────────────────────────────────────────────────────
  const filteredDatasets = useMemo(() => {
    if (!scanResult) return [];
    return scanResult.datasets.filter((d) => {
      const matchFilter = activeFilter === "all" || d.category === activeFilter;
      const matchSearch =
        searchQuery === "" ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.format.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [scanResult, activeFilter, searchQuery]);

  const getBadgeColor = (category: string) => {
    switch (category) {
      case "raster":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "vector":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "archive":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "tabular":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "raster":
        return <Satellite className="w-4 h-4 text-emerald-500" />;
      case "vector":
        return <Compass className="w-4 h-4 text-blue-500" />;
      case "archive":
        return <Archive className="w-4 h-4 text-amber-500" />;
      case "tabular":
        return <Table className="w-4 h-4 text-purple-500" />;
      default:
        return <FileCode className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="border rounded-xl p-5 bg-card/60 backdrop-blur-md shadow-sm space-y-5 border-border/80">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2 font-bold text-lg text-foreground">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            Universal Spatial Data Harvester
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deep scan any web page, STAC catalog, GitHub folder, or cloud link. Extract and acquire all spatial datasets with server-to-server speed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/30 text-xs px-2.5 py-1">
            ⚡ High-Speed Server Pipeline
          </Badge>
        </div>
      </div>

      {/* URL Input & Quick Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste any web page, STAC catalog, cloud link, or GeoTIFF/GeoJSON URL..."
              className="pl-9 font-mono text-xs bg-background/80"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputUrl) {
                  scanMut.mutate(inputUrl);
                }
              }}
            />
          </div>
          <Button
            onClick={() => scanMut.mutate(inputUrl)}
            disabled={scanMut.isPending || !inputUrl.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium px-5"
          >
            {scanMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Deep Scan Page
          </Button>
        </div>

        {/* Quick Demo Feeds */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-muted-foreground font-medium mr-1">Quick Demo Sources:</span>
          {QUICK_SOURCES.map((source, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setInputUrl(source.url);
                scanMut.mutate(source.url);
              }}
              className="px-2 py-0.5 rounded-full border border-border/70 hover:border-indigo-500/50 bg-background/50 hover:bg-indigo-500/10 text-muted-foreground hover:text-indigo-400 transition-colors"
            >
              {source.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Container */}
      {scanResult && (
        <div className="space-y-4 pt-2 border-t border-border/60 animate-in fade-in duration-300">
          {/* Summary & Filters Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-indigo-400" />
                <span className="text-indigo-400 font-semibold">{scanResult.title}</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {scanResult.count} dataset(s)
                </Badge>
                {scanResult.source_type && (
                  <Badge variant="outline" className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                    {scanResult.source_type.replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate max-w-md font-mono">{scanResult.url}</p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {["all", "raster", "vector", "archive", "tabular"].map((cat) => (
                <Button
                  key={cat}
                  variant={activeFilter === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter(cat)}
                  className={`h-7 px-2.5 text-xs capitalize ${
                    activeFilter === cat
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "border-border/60 hover:bg-muted"
                  }`}
                >
                  {cat === "all" ? "All Formats" : cat}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Sub-filter & Class Label setting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search within discovered datasets..."
                className="pl-8 h-8 text-xs bg-background/80"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Class Label for Vector Imports:</Label>
              <Input
                value={customClassLabel}
                onChange={(e) => setCustomClassLabel(e.target.value)}
                placeholder="e.g. Wetland, Forest"
                className="h-8 text-xs bg-background/80"
              />
            </div>
          </div>

          {/* Dataset Cards / Table List */}
          <div className="border border-border/70 rounded-lg overflow-hidden bg-background/70 divide-y divide-border/60 max-h-[480px] overflow-y-auto">
            {filteredDatasets.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                <AlertCircle className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
                <p className="font-semibold text-foreground">No datasets matched your filter.</p>
                <p>Try selecting 'All Formats' or clearing your search term.</p>
              </div>
            ) : (
              filteredDatasets.map((item) => {
                const geeTask = geeTasks[item.id];
                const isSaving = savingItemIds[item.id];

                return (
                  <div
                    key={item.id}
                    className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    {/* Item Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(item.category)}
                        <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                        <Badge variant="outline" className={`text-[10px] uppercase px-1.5 py-0 ${getBadgeColor(item.category)}`}>
                          {item.format}
                        </Badge>
                        {item.size_mb !== null && item.size_mb !== undefined && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {item.size_mb > 0 ? `${item.size_mb} MB` : "< 1 MB"}
                          </span>
                        )}
                        {item.feature_count !== undefined && (
                          <span className="text-[10px] text-blue-400 font-mono">
                            {item.feature_count} features
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted-foreground truncate font-mono flex items-center gap-2">
                        <span className="truncate">{item.url}</span>
                        {item.internal_path && (
                          <Badge variant="secondary" className="text-[9px] font-mono">
                            ZIP: {item.internal_path}
                          </Badge>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-muted-foreground/80">{item.description}</p>
                      )}

                      {/* Real-time GEE Progress & Speed Dashboard */}
                      {geeTask && (
                        <div className="mt-2.5 p-3 rounded-lg border border-border/80 bg-background/90 backdrop-blur space-y-2 shadow-sm">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              {geeTask.status === "in_progress" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                              ) : geeTask.status === "completed" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : geeTask.status === "cancelled" ? (
                                <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              )}
                              <span className="font-semibold text-foreground">
                                {geeTask.status === "completed"
                                  ? "Ingestion Complete"
                                  : geeTask.status === "cancelled"
                                  ? "Upload Cancelled"
                                  : geeTask.status === "failed"
                                  ? "Ingestion Failed"
                                  : "Transferring to GEE"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {geeTask.speed_mbps && geeTask.status === "in_progress" && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20"
                                >
                                  ⚡ {geeTask.speed_mbps} MB/s
                                </Badge>
                              )}
                              <span className="font-bold text-purple-400">{geeTask.progress}%</span>

                              {/* Stop or Remove Action */}
                              {geeTask.status === "in_progress" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] font-mono gap-1 text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
                                  onClick={() => handleCancelGeeTask(item.id, geeTask.taskId)}
                                  title="Stop and cancel GEE transfer"
                                >
                                  <Square className="w-2.5 h-2.5 fill-current" /> Stop
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] font-mono gap-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                  onClick={() => handleRemoveGeeTask(item.id, geeTask.taskId)}
                                  title="Remove and dismiss task"
                                >
                                  <Trash2 className="w-2.5 h-2.5" /> Remove
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Animated Progress Bar */}
                          <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${
                                geeTask.status === "completed"
                                  ? "bg-emerald-500"
                                  : geeTask.status === "cancelled"
                                  ? "bg-amber-500/80"
                                  : geeTask.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"
                              }`}
                              style={{ width: `${Math.max(geeTask.progress, 5)}%` }}
                            />
                          </div>

                          {/* Live Message and Metrics */}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span className="truncate max-w-[380px]">{geeTask.message || "Streaming dataset..."}</span>
                            {geeTask.downloaded_mb !== undefined && (
                              <span className="shrink-0 text-[10px] text-purple-300 font-semibold">
                                {geeTask.downloaded_mb} MB {geeTask.total_mb ? `/ ${geeTask.total_mb} MB` : ""}
                              </span>
                            )}
                          </div>

                          {/* Ready Asset Info & Copy Button */}
                          {geeTask.asset_id && geeTask.status === "completed" && (
                            <div className="pt-1 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded p-1.5 text-[11px] font-mono text-emerald-300">
                              <span className="truncate">Asset: {geeTask.asset_id}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-2 text-[10px] text-emerald-400 hover:bg-emerald-500/20"
                                onClick={() => {
                                  navigator.clipboard.writeText(geeTask.asset_id!);
                                  toast({ title: "Copied Asset ID!", description: geeTask.asset_id });
                                }}
                              >
                                Copy ID
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Matrix */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {/* 1. Direct Download */}
                      <a
                        href={api.harvester.getDownloadUrl(item.url, item.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-border/70 hover:bg-muted h-7 px-2.5 gap-1.5 transition-colors text-foreground"
                        title="Download file directly to your computer"
                      >
                        <Download className="w-3 h-3 text-emerald-500" />
                        Download
                      </a>

                      {/* 2. Instant Map Preview (Always available for spatial datasets) */}
                      {(item.category === "raster" || item.category === "vector" || item.category === "archive" || savedItemIds[item.id] || geeTasks[item.id]?.dataset_id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(item)}
                          className="h-7 px-2.5 text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
                          title="Preview dataset on interactive map"
                        >
                          <Eye className="w-3 h-3 text-amber-400" />
                          Preview on Map
                        </Button>
                      )}

                      {/* 3. Add to Training Samples (if Vector) */}
                      {item.category === "vector" && onImportVectorSamples && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onImportVectorSamples(item.url, customClassLabel)}
                          className="h-7 px-2.5 text-xs gap-1.5 border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                          title="Extract features into current training samples table"
                        >
                          <PlusCircle className="w-3 h-3" />
                          Add to Samples
                        </Button>
                      )}

                      {/* 4. Save/Delete from Portal Storage */}
                      {!savedItemIds[item.id] ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => handleSaveToPortal(item)}
                          className="h-7 px-2.5 text-xs gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                          title="Keep a permanent copy in portal repository"
                        >
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                          {isSaving ? "Archiving to Portal... (this may take a few minutes)" : "Save to Portal"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteFromPortal(item)}
                          className="h-7 px-2.5 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                          title="Delete from portal repository"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete from Portal
                        </Button>
                      )}

                      {/* 5. Use in Google Colab / GEE Code Snippet */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!savedItemIds[item.id]}
                        onClick={() => setSelectedColabDataset({
                          id: savedItemIds[item.id] || item.id,
                          name: item.name,
                          file_type: item.format || item.category,
                          file_size_mb: item.size_mb,
                          original_filename: item.name,
                          url: item.url,
                        })}
                        className={`h-7 px-2.5 text-xs gap-1.5 ${
                          savedItemIds[item.id]
                            ? "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                            : "border-border/30 text-muted-foreground opacity-50 cursor-not-allowed"
                        }`}
                        title={
                          savedItemIds[item.id]
                            ? "Generate ready-to-run Google Colab & Earth Engine Python code"
                            : "You must click 'Save to Portal' first before accessing Colab/GEE code"
                        }
                      >
                        <Code2 className="w-3 h-3" />
                        Colab / GEE
                      </Button>

                      {/* 6. Push to GEE Assets */}
                      {item.category === "raster" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={geeTask?.status === "in_progress"}
                          onClick={() => handlePushToGee(item)}
                          className="h-7 px-2.5 text-xs gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          title="Push to Google Earth Engine asset storage"
                        >
                          {geeTask?.status === "in_progress" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Cloud className="w-3 h-3" />
                          )}
                          Push to GEE
                        </Button>
                      )}
                    </div>
                    {/* Fake Progress Bar for Save to Portal */}
                    {savingProgressIds[item.id] !== undefined && (
                      <div className="w-full mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-indigo-400 font-medium">Archiving to Portal & Hugging Face...</span>
                          <span className="text-indigo-400">{savingProgressIds[item.id]}%</span>
                        </div>
                        <div className="w-full bg-indigo-500/10 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full transition-all duration-300 ease-out"
                            style={{ width: `${savingProgressIds[item.id]}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Embedded Map Preview Modal */}
      <Dialog open={!!modalPreviewItem} onOpenChange={(open) => !open && setModalPreviewItem(null)}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-background border-border shadow-2xl">
          <DialogHeader className="p-4 pb-2 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Map Preview: {modalPreviewItem?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Live spatial footprint and data layer preview.
            </DialogDescription>
          </DialogHeader>
          
          <div className="h-[480px] w-full relative bg-muted/20">
            {modalLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm z-[1000] gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <span className="text-xs font-medium text-foreground">Rendering spatial layer onto map...</span>
              </div>
            )}
            
            <MapContainer center={[-1.94, 29.87]} zoom={8} className="w-full h-full z-0">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
              
              {modalBbox && <HarvesterMapBoundsController bbox={modalBbox} />}

              {modalGeoJSON && (
                <GeoJSON
                  key={modalPreviewItem?.id + JSON.stringify(modalGeoJSON).substring(0, 40)}
                  data={modalGeoJSON}
                  style={{ color: "#00E5FF", fillColor: "#00E5FF", weight: 2.5, fillOpacity: 0.25 }}
                />
              )}

              {modalImage && (
                <ImageOverlay url={modalImage.url} bounds={modalImage.bounds} opacity={0.85} />
              )}

              {modalRasterUrl && (
                <TileLayer url={modalRasterUrl} maxNativeZoom={19} maxZoom={22} zIndex={10} />
              )}

              {!modalGeoJSON && !modalImage && !modalRasterUrl && modalBbox && modalBbox.length === 4 && (
                <LeafletRectangle
                  bounds={[
                    [modalBbox[1], modalBbox[0]],
                    [modalBbox[3], modalBbox[2]],
                  ]}
                  pathOptions={{ color: "#ec4899", fillColor: "#ec4899", fillOpacity: 0.15, weight: 2, dashArray: "5, 5" }}
                />
              )}
            </MapContainer>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Colab & Earth Engine Dialog */}
      <DatasetColabDialog
        isOpen={!!selectedColabDataset}
        onClose={() => setSelectedColabDataset(null)}
        dataset={selectedColabDataset}
      />
    </div>
  );
}
