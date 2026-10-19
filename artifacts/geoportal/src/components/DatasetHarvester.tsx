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
  Key,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Copy,
  FileText,
  Terminal,
  Activity,
  HardDriveDownload,
  Info,
  CheckSquare,
  Server,
  Zap,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapContainer, TileLayer, ImageOverlay, GeoJSON, Rectangle as LeafletRectangle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import { api } from "@/lib/api";
import { BASE } from "@/lib/api";
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

  // Source Protocol & Security Options
  const [selectedSourceType, setSelectedSourceType] = useState<string>("auto");
  const [authToken, setAuthToken] = useState<string>("");
  const [allowInsecureSsl, setAllowInsecureSsl] = useState<boolean>(false);
  const [showAuthDrawer, setShowAuthDrawer] = useState<boolean>(false);

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

  // ── Multi-Select, Workstation & Batch Operations State ────────────────────
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [batchIngesting, setBatchIngesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
  const [expandedMetaIds, setExpandedMetaIds] = useState<Set<string>>(new Set());
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false);
  const [selectedScriptTab, setSelectedScriptTab] = useState<"python" | "curl">("python");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [activeInspectedId, setActiveInspectedId] = useState<string | null>(null);

  // ── Real-time Provider Intelligence Detector ──────────────────────────────
  const detectedProvider = useMemo(() => {
    const u = inputUrl.toLowerCase().trim();
    if (!u) return null;
    if (u.includes("drive.google.com") || u.includes("drive.usercontent")) {
      return {
        name: "Google Drive Cloud Storage",
        icon: Cloud,
        badge: "Google Drive",
        color: "text-blue-400 bg-blue-500/15 border-blue-500/30",
        desc: "Direct Google Drive file stream detected. Ready for server-to-server ingestion.",
      };
    }
    if (u.includes("s3.") || u.startsWith("s3://") || u.includes("amazonaws.com")) {
      return {
        name: "Amazon S3 Open Cloud Bucket",
        icon: Cloud,
        badge: "AWS S3",
        color: "text-amber-400 bg-amber-500/15 border-amber-500/30",
        desc: "Public or presigned AWS S3 object stream.",
      };
    }
    if (u.includes("storage.googleapis.com") || u.startsWith("gs://")) {
      return {
        name: "Google Cloud Storage (GCS)",
        icon: Cloud,
        badge: "GCS Bucket",
        color: "text-red-400 bg-red-500/15 border-red-500/30",
        desc: "Google Cloud Storage bucket spatial asset.",
      };
    }
    if (u.includes("arcgis.com") || u.includes("/rest/services") || u.includes("featureserver") || u.includes("mapserver")) {
      return {
        name: "ArcGIS REST Enterprise Service",
        icon: Compass,
        badge: "Esri REST",
        color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
        desc: "Esri MapServer or FeatureServer spatial service.",
      };
    }
    if (u.includes("stac") || u.includes("earth-search")) {
      return {
        name: "STAC v1.0 SpatioTemporal Asset",
        icon: Layers,
        badge: "STAC Catalog",
        color: "text-purple-400 bg-purple-500/15 border-purple-500/30",
        desc: "Standard STAC Item/Catalog with multispectral cloud assets.",
      };
    }
    if (u.endsWith(".tif") || u.endsWith(".tiff") || u.endsWith(".cog")) {
      return {
        name: "Cloud-Optimized GeoTIFF (COG)",
        icon: Satellite,
        badge: "COG Raster",
        color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
        desc: "Cloud raster with internal tiling and overviews.",
      };
    }
    if (u.endsWith(".geojson") || u.endsWith(".shp") || u.endsWith(".kml") || u.endsWith(".gpkg")) {
      return {
        name: "Vector GIS Feature Layer",
        icon: Compass,
        badge: "Vector GIS",
        color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
        desc: "Standard spatial geometries and attribute tables.",
      };
    }
    if (u.endsWith(".zip") || u.endsWith(".tar.gz")) {
      return {
        name: "Zipped Multi-Layer GIS Archive",
        icon: Archive,
        badge: "GIS Archive",
        color: "text-amber-400 bg-amber-500/15 border-amber-500/30",
        desc: "Compressed spatial package with multiple shapefiles or rasters.",
      };
    }
    return null;
  }, [inputUrl]);

  // ── Verified Enterprise Endpoints ──────────────────────────────────────────
  const QUICK_SOURCES = [
    {
      label: "Sentinel-2 COG (AWS S3)",
      badge: "Cloud Raster",
      url: "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/M/BE/2024/1/S2A_36MBE_20240115_0_L2A/B04.tif",
      type: "file",
    },
    {
      label: "USGS 3DEP Elevation 10m",
      badge: "Global DEM",
      url: "https://s3.amazonaws.com/elevation-tiles-prod/geotiff/12/2340/1600.tif",
      type: "file",
    },
    {
      label: "Element84 Earth Search",
      badge: "STAC Item",
      url: "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_36MBE_20240115_0_L2A",
      type: "stac",
    },
    {
      label: "Rwanda Water Portal (RWB)",
      badge: "National SDI",
      url: "https://waterportal.rwb.rw/",
      type: "auto",
    },
    {
      label: "OSGeo Multi-layer GIS",
      badge: "Zipped Shapefiles",
      url: "https://github.com/OSGeo/gdal/raw/master/autotest/gdrivers/data/small_world.zip",
      type: "file",
    },
    {
      label: "Mapbox Multi-band GeoTIFF",
      badge: "COG GeoTIFF",
      url: "https://github.com/mapbox/rasterio/raw/master/tests/data/RGB.byte.tif",
      type: "file",
    },
  ];

  // ── Scan Mutation ──────────────────────────────────────────────────────────
  const scanMut = useMutation({
    mutationFn: (urlToScan: string) =>
      api.harvester.scan(urlToScan, {
        sourceType: selectedSourceType,
        authToken: authToken.trim() || undefined,
        allowInsecureSsl,
      }),
    onSuccess: (data) => {
      setScanResult(data);
      setSelectedItemIds(new Set());
      toast({
        title: "Scan Completed",
        description: `Discovered ${data.count} spatial dataset(s) from ${data.title}`,
      });
    },
    onError: (err: Error) => {
      let desc = err.message || "Could not read data from this URL.";
      if (desc.includes("Google Drive download quota has been exceeded") || desc.includes("Quota exceeded")) {
        desc = "Google Drive download quota exceeded for today. You can still download directly via your browser if signed into Google Drive.";
      }
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: desc,
      });
    },
  });

  // ── Save to Portal Storage (Promise-based for Batch & Single) ───────────────
  const handleSaveToPortal = (item: HarvesterItem): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      setSavingItemIds((prev) => ({ ...prev, [item.id]: true }));
      setSavingProgressIds((prev) => ({ ...prev, [item.id]: 10 }));

      api.harvester
        .saveToPortal({
          url: item.url,
          name: item.name,
          class_label: customClassLabel || defaultClassLabel,
          internal_path: item.internal_path,
        })
        .then((res) => {
          const taskId = res.task_id;
          if (!taskId) {
            qc.invalidateQueries({ queryKey: ["datasets"] });
            setSavedItemIds((prev) => ({ ...prev, [item.id]: res.dataset_id || "fallback_id" }));
            setSavingProgressIds((prev) => ({ ...prev, [item.id]: 100 }));
            toast({ title: "Dataset Ingested", description: `Archived ${item.name} into repository.` });
            setTimeout(() => {
              setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
              setSavingProgressIds((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });
            }, 1000);
            resolve(true);
            return;
          }

          const pollTimer = setInterval(async () => {
            try {
              const statusRes = await api.harvester.getTaskStatus(taskId);
              if (statusRes.status === "completed") {
                clearInterval(pollTimer);
                setSavingProgressIds((prev) => ({ ...prev, [item.id]: 100 }));
                qc.invalidateQueries({ queryKey: ["datasets"] });
                const savedId = statusRes.result_data?.dataset_id || "saved_dataset";
                setSavedItemIds((prev) => ({ ...prev, [item.id]: savedId }));
                toast({ title: "Dataset Ingested", description: `Saved ${item.name} successfully.` });
                setTimeout(() => {
                  setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
                  setSavingProgressIds((prev) => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                  });
                }, 1000);
                resolve(true);
              } else if (statusRes.status === "failed") {
                clearInterval(pollTimer);
                setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
                setSavingProgressIds((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                });
                reject(new Error(statusRes.message));
              } else {
                setSavingProgressIds((prev) => ({ ...prev, [item.id]: statusRes.progress || 20 }));
              }
            } catch (e: any) {
              clearInterval(pollTimer);
              setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
              setSavingProgressIds((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });
              reject(e);
            }
          }, 2000);
        })
        .catch((err: any) => {
          setSavingItemIds((prev) => ({ ...prev, [item.id]: false }));
          setSavingProgressIds((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
          toast({
            variant: "destructive",
            title: "Ingestion Failed",
            description: err.message,
          });
          reject(err);
        });
    });
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
        title: "Dataset Removed",
        description: `Removed ${item.name} from repository.`,
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

  // ── Multi-select Handlers ──────────────────────────────────────────────────
  const toggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: HarvesterItem[]) => {
    if (selectedItemIds.size === items.length && items.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map((d) => d.id)));
    }
  };

  const toggleMetaExpand = (id: string) => {
    setExpandedMetaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Batch Ingest Operation ─────────────────────────────────────────────────
  const handleBatchSaveToPortal = async (items: HarvesterItem[]) => {
    const itemsToSave = items.filter((d) => selectedItemIds.has(d.id) && !savedItemIds[d.id]);
    if (itemsToSave.length === 0) {
      toast({
        title: "No Datasets to Ingest",
        description: "All selected datasets are already saved in the repository.",
      });
      return;
    }

    setBatchIngesting(true);
    let success = 0;
    for (let i = 0; i < itemsToSave.length; i++) {
      const item = itemsToSave[i];
      setBatchProgress({
        current: i + 1,
        total: itemsToSave.length,
        currentName: item.name,
      });
      try {
        await handleSaveToPortal(item);
        success++;
      } catch (e) {
        console.error("Batch save failed for item", item.name, e);
      }
    }
    setBatchIngesting(false);
    setBatchProgress(null);
    toast({
      title: "Batch Ingestion Finished",
      description: `Successfully ingested ${success} of ${itemsToSave.length} spatial datasets.`,
    });
  };

  // ── Export Manifest (GeoJSON / STAC FeatureCollection) ─────────────────────
  const handleBatchExportManifest = (items: HarvesterItem[]) => {
    const exportItems = items.filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id));
    const manifest = {
      type: "FeatureCollection",
      metadata: {
        generated_by: "Universal Spatial Data Harvester Enterprise",
        timestamp: new Date().toISOString(),
        source_url: scanResult?.url,
        source_title: scanResult?.title,
        total_items: exportItems.length,
      },
      features: exportItems.map((d) => ({
        type: "Feature",
        geometry:
          d.bbox && d.bbox.length === 4
            ? {
                type: "Polygon",
                coordinates: [
                  [
                    [d.bbox[0], d.bbox[1]],
                    [d.bbox[2], d.bbox[1]],
                    [d.bbox[2], d.bbox[3]],
                    [d.bbox[0], d.bbox[3]],
                    [d.bbox[0], d.bbox[1]],
                  ],
                ],
              }
            : null,
        properties: {
          id: d.id,
          name: d.name,
          category: d.category,
          format: d.format,
          size_mb: d.size_mb,
          feature_count: d.feature_count,
          url: d.url,
          internal_path: d.internal_path,
          has_prj: d.has_prj,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spatial_manifest_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Manifest Exported",
      description: `Exported ${exportItems.length} dataset metadata entries to GeoJSON.`,
    });
  };

  const handleBatchCopyUrls = (items: HarvesterItem[]) => {
    const exportItems = items.filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id));
    const text = exportItems.map((d) => d.url).join("\n");
    navigator.clipboard.writeText(text);
    toast({
      title: "URLs Copied",
      description: `Copied ${exportItems.length} dataset URLs to clipboard.`,
    });
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
          const feats = resp.features || (resp.type === "Feature" ? [resp] : []);
          if (feats.length > 1500) {
            setModalGeoJSON({ ...resp, features: feats.slice(0, 300) });
            toast({
              title: `Large Vector Layer (${feats.length.toLocaleString()} features)`,
              description: "Displaying bounding footprint & first 300 features for fast preview.",
            });
          } else {
            setModalGeoJSON(resp);
          }
        } else if (resp.geojson) {
          const feats = resp.geojson.features || [];
          if (feats.length > 1500) {
            setModalGeoJSON({ ...resp.geojson, features: feats.slice(0, 300) });
            toast({
              title: `Large Vector Layer (${feats.length.toLocaleString()} features)`,
              description: "Displaying bounding footprint & first 300 features for fast preview.",
            });
          } else {
            setModalGeoJSON(resp.geojson);
          }
        } else if (resp.type === "image" && resp.data && resp.bounds) {
          setModalImage({ url: resp.data, bounds: resp.bounds });
        } else if (item.category === "raster" || resp.type === "url") {
          setModalRasterUrl(`${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(datasetId)}`);
        }
      } else {
        // Preview direct from URL before saving if available
        if (item.format === "geojson" || item.url.toLowerCase().endsWith(".geojson")) {
          const r = await fetch(item.url);
          const gj = await r.json();
          const feats = gj.features || [];
          if (feats.length > 1500) {
            setModalGeoJSON({ ...gj, features: feats.slice(0, 300) });
            toast({
              title: `Large Vector Layer (${feats.length.toLocaleString()} features)`,
              description: "Displaying bounding footprint & first 300 features for fast preview.",
            });
          } else {
            setModalGeoJSON(gj);
          }
          try {
            setModalBbox(turf.bbox(gj));
          } catch (e) {}
        } else if (item.category === "raster" || item.format === "tif" || item.format === "cog") {
          setModalRasterUrl(`${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(item.url)}`);
          fetch(`${BASE}/native/imagery/bounds?url=${encodeURIComponent(item.url)}`)
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

  const activeInspectedItem = useMemo(() => {
    if (!filteredDatasets.length) return null;
    if (activeInspectedId) {
      const found = filteredDatasets.find((d) => d.id === activeInspectedId);
      if (found) return found;
    }
    return filteredDatasets[0];
  }, [filteredDatasets, activeInspectedId]);

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
    <div className="space-y-5">
      {/* Inline animation styles */}
      <style>{`
        @keyframes harvester-scan-pulse {
          0%, 100% { opacity: 0.5; transform: scaleX(0.4); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes harvester-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes harvester-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
          50% { box-shadow: 0 0 20px 2px rgba(99, 102, 241, 0.15); }
        }
        .harvester-card-hover {
          transition: all 0.2s ease;
        }
        .harvester-card-hover:hover {
          background: hsl(var(--muted) / 0.5);
          box-shadow: 0 2px 12px -2px rgba(99, 102, 241, 0.08);
        }
      `}</style>

      {/* ── Minimalist Search & Ingestion Input ──────────────────────────────── */}
      <div className="border border-border/50 rounded-xl bg-card/60 backdrop-blur-md p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter dataset URL (GeoTIFF, GeoJSON, STAC, Shapefile, Google Drive, Esri)..."
              className="pl-10 pr-24 h-11 text-xs font-mono bg-background/80 border-border/60 focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputUrl) {
                  scanMut.mutate(inputUrl);
                }
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {detectedProvider && (
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-5 text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
                  {detectedProvider.badge}
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAuthDrawer(!showAuthDrawer)}
                className={`h-7 w-7 p-0 rounded text-xs ${
                  authToken || allowInsecureSsl ? "text-indigo-400 bg-indigo-500/15" : "text-muted-foreground hover:text-foreground"
                }`}
                title="Authentication & Key"
              >
                <Key className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <Button
            onClick={() => scanMut.mutate(inputUrl)}
            disabled={scanMut.isPending || !inputUrl.trim()}
            className="h-11 px-6 font-medium text-xs shadow-xs shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
          >
            {scanMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scanMut.isPending ? "Scanning..." : "Scan Source"}
          </Button>
        </div>

        {/* Collapsible Auth Drawer (clean & quiet) */}
        {showAuthDrawer && (
          <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2.5 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 w-full space-y-1">
                <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-indigo-400" />
                  API Key or Bearer Token (Optional)
                </Label>
                <Input
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Optional token for private STAC or ArcGIS servers"
                  className="h-8 font-mono text-xs bg-background/80"
                />
              </div>
              <div className="flex items-center gap-2 pt-4 sm:pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={allowInsecureSsl}
                    onChange={(e) => setAllowInsecureSsl(e.target.checked)}
                    className="rounded border-border text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Allow Insecure SSL</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Muted Example Links */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground/70">Examples:</span>
          {QUICK_SOURCES.map((source, idx) => (
            <React.Fragment key={idx}>
              <button
                type="button"
                onClick={() => {
                  setInputUrl(source.url);
                  setSelectedSourceType(source.type || "auto");
                  scanMut.mutate(source.url);
                }}
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline text-xs"
              >
                {source.label}
              </button>
              {idx < QUICK_SOURCES.length - 1 && <span className="text-border">·</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Results Dashboard ──────────────────────────────────────────── */}
      {scanResult && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* ── Clean Result Summary Bar ───────────────────────────────── */}
          <div className="border border-border/50 rounded-xl bg-card/60 backdrop-blur-md px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Globe2 className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{scanResult.title}</span>
                  {scanResult.source_type && (
                    <Badge variant="outline" className="text-[10px] font-mono capitalize border-border/60 text-muted-foreground">
                      {scanResult.source_type.replace('_', ' ')}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ({scanResult.datasets.length} {scanResult.datasets.length === 1 ? "layer" : "layers"})
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 truncate font-mono">{scanResult.url}</p>
              </div>
            </div>

            {/* Filter pills & search */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
                {[
                  { key: "all", label: "All" },
                  { key: "raster", label: "Raster" },
                  { key: "vector", label: "Vector" },
                  { key: "archive", label: "Archive" },
                  { key: "tabular", label: "Tabular" },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveFilter(cat.key)}
                    className={`h-6 px-2.5 rounded text-xs font-medium transition-all ${
                      activeFilter === cat.key
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {scanResult.datasets.length > 2 && (
                <div className="relative w-40">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter layers..."
                    className="pl-7 h-7 text-xs bg-background/80 border-border/50"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Multi-select Batch Toolbar with View Mode Switcher ─────────── */}
          <div className="px-4 py-2.5 bg-muted/30 border border-border/50 rounded-xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => toggleSelectAll(filteredDatasets)}
              >
                <Checkbox
                  checked={
                    filteredDatasets.length > 0 && selectedItemIds.size === filteredDatasets.length
                  }
                  onCheckedChange={() => toggleSelectAll(filteredDatasets)}
                  className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                />
                <span className="text-xs font-semibold text-foreground">
                  Select All ({filteredDatasets.length})
                </span>
              </div>
              {selectedItemIds.size > 0 && (
                <Badge variant="secondary" className="text-xs bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 font-mono">
                  {selectedItemIds.size} Selected
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Batch Ingest Button */}
              <Button
                size="sm"
                variant="default"
                disabled={batchIngesting || selectedItemIds.size === 0}
                onClick={() => handleBatchSaveToPortal(filteredDatasets)}
                className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm transition-all"
              >
                {batchIngesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5" />
                )}
                {batchIngesting
                  ? `Ingesting (${batchProgress?.current || 1}/${batchProgress?.total || selectedItemIds.size})...`
                  : `Batch Ingest (${selectedItemIds.size || 0})`}
              </Button>

              {/* Export Manifest Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border/60">
                    <HardDriveDownload className="w-3.5 h-3.5 text-muted-foreground" />
                    Export
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-[10px] uppercase font-mono text-muted-foreground">
                    Manifest & Automation
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleBatchExportManifest(filteredDatasets)} className="gap-2 text-xs">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    GeoJSON Manifest
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedScriptTab("python");
                      setShowScriptModal(true);
                    }}
                    className="gap-2 text-xs"
                  >
                    <Code2 className="w-3.5 h-3.5 text-amber-400" />
                    Python Automation Script
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedScriptTab("curl");
                      setShowScriptModal(true);
                    }}
                    className="gap-2 text-xs"
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    cURL Download Script
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleBatchCopyUrls(filteredDatasets)} className="gap-2 text-xs">
                    <Copy className="w-3.5 h-3.5 text-purple-400" />
                    Copy URLs ({selectedItemIds.size || filteredDatasets.length})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View Mode Switcher: Table vs Cards */}
              <div className="flex items-center rounded-lg border border-border/60 bg-background/60 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className={`h-7 px-2.5 text-xs gap-1.5 rounded-md ${
                    viewMode === "table"
                      ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-600 hover:text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="High-density enterprise data table"
                >
                  <Table className="w-3.5 h-3.5" />
                  Table
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className={`h-7 px-2.5 text-xs gap-1.5 rounded-md ${
                    viewMode === "cards"
                      ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-600 hover:text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Visual geospatial cards"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Cards
                </Button>
              </div>
            </div>
          </div>

          {/* Active Batch Ingestion Progress Banner */}
          {batchIngesting && batchProgress && (
            <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-950/30 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-indigo-300 font-medium flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  Batch Ingesting {batchProgress.current} of {batchProgress.total}:
                  <span className="font-semibold text-foreground truncate max-w-sm">{batchProgress.currentName}</span>
                </span>
                <span className="font-mono text-indigo-400 font-bold">
                  {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-indigo-500/20 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Main Dual-Pane Workstation Grid ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Pane (7 cols / 8 cols xl): Datasets Data Table OR Cards */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3">
              {filteredDatasets.length === 0 ? (
                <div className="p-12 text-center space-y-2 border border-border/50 rounded-xl bg-card/50">
                  <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">No datasets matched your filter</p>
                  <p className="text-xs text-muted-foreground">Try selecting 'All Formats' or clearing your search term.</p>
                </div>
              ) : viewMode === "table" ? (
                /* Enterprise Data Table */
                <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 backdrop-blur-sm shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/40 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                          <th className="py-2.5 px-3 w-8">
                            <Checkbox
                              checked={filteredDatasets.length > 0 && selectedItemIds.size === filteredDatasets.length}
                              onCheckedChange={() => toggleSelectAll(filteredDatasets)}
                              className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                          </th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Dataset / Spatial Layer</th>
                          <th className="py-2.5 px-3">Driver / Format</th>
                          <th className="py-2.5 px-3">CRS / Footprint</th>
                          <th className="py-2.5 px-3 text-right">Size</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {filteredDatasets.map((item) => {
                          const isInspected = activeInspectedItem?.id === item.id;
                          const geeTask = geeTasks[item.id];
                          const isSaving = savingItemIds[item.id];
                          const isIngested = !!savedItemIds[item.id];
                          return (
                            <tr
                              key={item.id}
                              onClick={() => setActiveInspectedId(item.id)}
                              className={`cursor-pointer transition-colors duration-150 ${
                                isInspected
                                  ? "bg-indigo-500/10 font-medium border-l-2 border-indigo-500"
                                  : "hover:bg-muted/30"
                              }`}
                            >
                              <td className="py-3 px-3 w-8" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedItemIds.has(item.id)}
                                  onCheckedChange={() => toggleSelectItem(item.id)}
                                  className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                              </td>
                              <td className="py-3 px-3">
                                {isIngested ? (
                                  <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                                    Ingested
                                  </Badge>
                                ) : geeTask?.status === "completed" ? (
                                  <Badge variant="outline" className="text-[9px] font-mono border-purple-500/40 text-purple-400 bg-purple-500/10">
                                    GEE Asset
                                  </Badge>
                                ) : geeTask?.status === "in_progress" || isSaving ? (
                                  <Badge variant="outline" className="text-[9px] font-mono border-indigo-500/40 text-indigo-400 bg-indigo-500/10 animate-pulse">
                                    Streaming
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] font-mono border-border text-muted-foreground">
                                    Stream Ready
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2 max-w-xs sm:max-w-md">
                                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-muted/60">
                                    {getCategoryIcon(item.category)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                                      <span>{item.name}</span>
                                      {(item as any).provider && (
                                        <span className="text-[9px] text-muted-foreground font-mono">
                                          [{(item as any).provider_label || (item as any).provider}]
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate font-mono">{item.url}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <Badge variant="outline" className={`text-[9px] font-mono uppercase px-1.5 py-0 ${getBadgeColor(item.category)}`}>
                                  {item.format}
                                </Badge>
                              </td>
                              <td className="py-3 px-3 font-mono text-[10px] text-muted-foreground">
                                {(item as any).crs || (item.bbox ? `[${item.bbox.map((n: number) => n.toFixed(1)).join(", ")}]` : "EPSG:4326")}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                                {item.size_mb !== null && item.size_mb !== undefined && item.size_mb > 0
                                  ? `${item.size_mb} MB`
                                  : "< 1 MB"}
                              </td>
                              <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreview(item)}
                                    className="h-6 px-2 text-[10px] gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                    title="Preview spatial layer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Preview
                                  </Button>
                                  {!isIngested ? (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      disabled={isSaving}
                                      onClick={() => handleSaveToPortal(item)}
                                      className="h-6 px-2 text-[10px] gap-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                                    >
                                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                                      Ingest
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/10">✓ Saved</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Cards View */
                <div className="space-y-3">
                  {filteredDatasets.map((item) => {
                    const isInspected = activeInspectedItem?.id === item.id;
                    const geeTask = geeTasks[item.id];
                    const isSaving = savingItemIds[item.id];
                    const accentColor = item.category === "raster" ? "#10b981" : item.category === "vector" ? "#3b82f6" : item.category === "archive" ? "#f59e0b" : "#a855f7";

                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveInspectedId(item.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isInspected
                            ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30"
                            : "border-border/50 bg-card/60 hover:bg-muted/40"
                        }`}
                      >
                        {/* Card Top */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => toggleSelectItem(item.id)}
                                className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                              />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div
                                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${accentColor}15` }}
                                >
                                  {getCategoryIcon(item.category)}
                                </div>
                                <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                                <Badge variant="outline" className={`text-[9px] uppercase font-mono px-1.5 py-0 ${getBadgeColor(item.category)}`}>
                                  {item.format}
                                </Badge>
                                {(item as any).provider && (
                                  <Badge variant="secondary" className="text-[9px] font-mono">
                                    {(item as any).provider_label || (item as any).provider}
                                  </Badge>
                                )}
                                {item.size_mb !== null && item.size_mb !== undefined && (
                                  <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded">
                                    {item.size_mb > 0 ? `${item.size_mb} MB` : "< 1 MB"}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate font-mono">{item.url}</p>
                              {item.description && !item.description.toLowerCase().startsWith("direct ") && !item.description.toLowerCase().includes("spatial file") && (
                                <p className="text-[11px] text-muted-foreground/80 line-clamp-2">{item.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreview(item)}
                              className="h-7 px-2.5 text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            >
                              <Eye className="w-3 h-3" />
                              Preview
                            </Button>
                            {!savedItemIds[item.id] ? (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={isSaving}
                                onClick={() => handleSaveToPortal(item)}
                                className="h-7 px-2.5 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white"
                              >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                                Ingest
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Ingested
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Pane (5 cols / 4 cols xl): Persistent Spatial Inspector & Mini Map */}
            <div className="lg:col-span-5 xl:col-span-4 sticky top-4 space-y-3">
              {activeInspectedItem ? (
                <div className="rounded-xl border border-border/70 bg-card/80 backdrop-blur-md overflow-hidden shadow-lg space-y-0 animate-in fade-in duration-200">
                  {/* Inspector Header */}
                  <div className="px-3.5 py-2.5 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs font-semibold text-foreground">
                        Layer Details
                      </span>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 uppercase ${getBadgeColor(activeInspectedItem.category)}`}>
                      {activeInspectedItem.format}
                    </Badge>
                  </div>

                  {/* Interactive Leaflet Mini-Map */}
                  <div className="h-48 w-full relative border-b border-border/50 bg-background">
                    <MapContainer
                      center={
                        activeInspectedItem.bbox && activeInspectedItem.bbox.length === 4
                          ? [(activeInspectedItem.bbox[1] + activeInspectedItem.bbox[3]) / 2, (activeInspectedItem.bbox[0] + activeInspectedItem.bbox[2]) / 2]
                          : [-1.9403, 29.8739]
                      }
                      zoom={8}
                      className="h-full w-full z-0"
                      attributionControl={false}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        maxZoom={19}
                      />
                      <HarvesterMapBoundsController bbox={activeInspectedItem.bbox} />
                      {activeInspectedItem.bbox && activeInspectedItem.bbox.length === 4 && (
                        <LeafletRectangle
                          bounds={[
                            [activeInspectedItem.bbox[1], activeInspectedItem.bbox[0]],
                            [activeInspectedItem.bbox[3], activeInspectedItem.bbox[2]],
                          ]}
                          pathOptions={{
                            color: "#6366f1",
                            weight: 2,
                            fillColor: "#818cf8",
                            fillOpacity: 0.25,
                          }}
                        />
                      )}
                    </MapContainer>
                    <div className="absolute bottom-2 left-2 right-2 z-[1000] bg-background/90 backdrop-blur-md rounded px-2 py-1 text-[10px] font-mono text-muted-foreground border border-border/50 flex items-center justify-between">
                      <span className="truncate">
                        {activeInspectedItem.bbox
                          ? `BBox: [${activeInspectedItem.bbox.map((n: number) => n.toFixed(2)).join(", ")}]`
                          : "Extent: Global / Projected Stream"}
                      </span>
                      {activeInspectedItem.bbox && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 px-1 text-[9px] text-indigo-400"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(activeInspectedItem.bbox));
                            toast({ title: "BBox Copied" });
                          }}
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Inspector Metadata Details */}
                  <div className="p-3.5 space-y-3 text-xs">
                    <div>
                      <div className="text-xs font-semibold text-foreground truncate">{activeInspectedItem.name}</div>
                      <p className="text-[10px] text-muted-foreground truncate font-mono">{activeInspectedItem.url}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40 font-mono">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Source</span>
                        <span className="text-foreground font-medium truncate block">
                          {(activeInspectedItem as any).provider_label || (activeInspectedItem as any).provider || "Direct URL"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">CRS</span>
                        <span className="text-foreground font-medium truncate block">
                          {(activeInspectedItem as any).crs || "EPSG:4326"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Type</span>
                        <span className="text-foreground font-medium capitalize block">
                          {activeInspectedItem.category === "raster" ? "Raster / Imagery" : "Vector Features"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Size</span>
                        <span className="text-foreground font-medium block">
                          {activeInspectedItem.size_mb ? `${activeInspectedItem.size_mb} MB` : "< 1 MB"}
                        </span>
                      </div>
                    </div>

                    {/* Python Quickload Snippet */}
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono"><Code2 className="w-3 h-3 text-amber-400" /> Python Quickload</span>
                        <button
                          type="button"
                          onClick={() => {
                            const snippet = activeInspectedItem.category === "raster"
                              ? `import rasterio\nds = rasterio.open("${activeInspectedItem.url}")\nprint(ds.profile)`
                              : `import geopandas as gpd\ngdf = gpd.read_file("${activeInspectedItem.url}")\nprint(gdf.head())`;
                            navigator.clipboard.writeText(snippet);
                            toast({ title: "Python Snippet Copied" });
                          }}
                          className="text-indigo-400 hover:text-indigo-300 font-medium font-mono"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="text-[10px] text-foreground block bg-background/80 p-1.5 rounded border border-border/40 truncate font-mono">
                        {activeInspectedItem.category === "raster"
                          ? `import rasterio; ds = rasterio.open("${activeInspectedItem.url}")`
                          : `import geopandas as gpd; gdf = gpd.read_file("${activeInspectedItem.url}")`}
                      </code>
                    </div>

                    {/* Quick Ingress Action Buttons */}
                    <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={savingItemIds[activeInspectedItem.id]}
                        onClick={() => handleSaveToPortal(activeInspectedItem)}
                        className="w-full h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-xs"
                      >
                        {savingItemIds[activeInspectedItem.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Database className="w-3.5 h-3.5" />
                        )}
                        {savedItemIds[activeInspectedItem.id] ? "Saved to Vault" : "Ingest into Vault"}
                      </Button>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreview(activeInspectedItem)}
                          className="flex-1 h-7 text-[11px] gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </Button>
                        {activeInspectedItem.category === "raster" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePushToGee(activeInspectedItem)}
                            className="flex-1 h-7 text-[11px] gap-1 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                          >
                            <Cloud className="w-3 h-3" />
                            Earth Engine
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-border/50 rounded-xl bg-card/40 text-center text-xs text-muted-foreground">
                  Select a layer to view details.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────────────── */}
      {!scanResult && !scanMut.isPending && (
        <div className="border border-border/40 border-dashed rounded-xl bg-card/20 p-8 text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
            <Globe2 className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-foreground">No data source scanned</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Enter a cloud URL or select an example above to inspect layers.
          </p>
        </div>
      )}

      {/* ── Embedded Map Preview Modal ─────────────────────────────────── */}
      <Dialog open={!!modalPreviewItem} onOpenChange={(open) => !open && setModalPreviewItem(null)}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-background border-border/60 shadow-2xl rounded-xl">
          <DialogHeader className="px-5 py-3.5 border-b border-border/40 bg-muted/20">
            <DialogTitle className="flex items-center gap-2.5 text-sm font-semibold">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <span className="text-foreground">Map Preview</span>
                <span className="text-muted-foreground font-normal ml-2">{modalPreviewItem?.name}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="h-[500px] w-full relative bg-muted/10">
            {modalLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-[1000] gap-3">
                <div className="relative">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <div className="absolute inset-0 rounded-full blur-lg opacity-30 bg-indigo-500" />
                </div>
                <span className="text-xs font-medium text-foreground">Rendering spatial layer...</span>
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
                  style={{ color: "#38bdf8", fillColor: "#38bdf8", weight: 1.5, fillOpacity: 0.15, dashArray: "3,3" }}
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
                  pathOptions={{ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.08, weight: 1.5, dashArray: "4,4" }}
                />
              )}
            </MapContainer>
          </div>

          {/* Map footer status */}
          {modalBbox && (
            <div className="px-4 py-2 border-t border-border/40 bg-muted/10 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Bounds: [{modalBbox.map(b => b.toFixed(4)).join(", ")}]</span>
              <span className="text-emerald-400 font-semibold">● Live</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Google Colab & Earth Engine Dialog */}
      <DatasetColabDialog
        isOpen={!!selectedColabDataset}
        onClose={() => setSelectedColabDataset(null)}
        dataset={selectedColabDataset}
      />

      {/* ── Headless Automation Script Modal ────────────────────────────── */}
      <Dialog open={showScriptModal} onOpenChange={setShowScriptModal}>
        <DialogContent className="max-w-3xl w-full p-0 overflow-hidden bg-background border-border/60 shadow-2xl rounded-xl">
          <DialogHeader className="px-5 py-4 border-b border-border/40 bg-muted/20">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span>Ingestion Script</span>
              </DialogTitle>
              <div className="flex items-center gap-1.5 mr-6">
                <button
                  type="button"
                  onClick={() => setSelectedScriptTab("python")}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    selectedScriptTab === "python"
                      ? "bg-indigo-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Python
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScriptTab("curl")}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    selectedScriptTab === "curl"
                      ? "bg-indigo-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  cURL
                </button>
              </div>
            </div>
          </DialogHeader>

          <div className="p-4 bg-muted/10">
            <div className="relative">
              <pre className="p-4 rounded-lg bg-card border border-border/50 text-[11px] font-mono text-foreground/90 max-h-96 overflow-y-auto leading-relaxed select-all whitespace-pre-wrap break-all">
                {selectedScriptTab === "python"
                  ? `"""
Universal Spatial Harvester - Automation Pipeline
Generated: ${new Date().toISOString()}
Target: ${scanResult?.title || "Spatial Portal"} (${scanResult?.url || ""})
"""
import os
import requests

DATASETS = ${JSON.stringify(
                      filteredDatasets
                        .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
                        .map((d) => ({
                          name: d.name,
                          format: d.format,
                          category: d.category,
                          size_mb: d.size_mb,
                          url: d.url,
                        })),
                      null,
                      2
                    )}

def download_datasets(dest_dir="harvested_spatial_data"):
    os.makedirs(dest_dir, exist_ok=True)
    print(f"Starting batch ingestion of {len(DATASETS)} datasets into '{dest_dir}'...")
    for idx, ds in enumerate(DATASETS, 1):
        dest_path = os.path.join(dest_dir, ds["name"])
        print(f"[{idx}/{len(DATASETS)}] Ingesting {ds['name']} [{ds['format'].upper()}]...")
        with requests.get(ds["url"], stream=True) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        print(f"✓ Saved to {dest_path}")

if __name__ == "__main__":
    download_datasets()`
                  : `#!/usr/bin/env bash
# Universal Spatial Harvester - cURL Batch Pipeline
# Generated: ${new Date().toISOString()}

mkdir -p harvested_spatial_data
${filteredDatasets
  .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
  .map((d) => `curl -L -o "harvested_spatial_data/${d.name}" "${d.url}"`)
  .join("\n")}`}
              </pre>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const content =
                      selectedScriptTab === "python"
                        ? `import os\nimport requests\n\nDATASETS = ${JSON.stringify(
                            filteredDatasets
                              .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
                              .map((d) => ({
                                name: d.name,
                                format: d.format,
                                url: d.url,
                              })),
                            null,
                            2
                          )}\n\nos.makedirs("harvested_spatial_data", exist_ok=True)\nfor ds in DATASETS:\n    r = requests.get(ds["url"], stream=True)\n    with open(f"harvested_spatial_data/{ds['name']}", "wb") as f:\n        for chunk in r.iter_content(1024*1024):\n            if chunk: f.write(chunk)\n    print(f"Saved {ds['name']}")`
                        : `mkdir -p harvested_spatial_data\n${filteredDatasets
                            .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
                            .map((d) => `curl -L -o "harvested_spatial_data/${d.name}" "${d.url}"`)
                            .join("\n")}`;
                    navigator.clipboard.writeText(content);
                    toast({ title: "Script Copied", description: "Copied automation code to clipboard." });
                  }}
                  className="h-8 text-xs gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Script
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    const content =
                      selectedScriptTab === "python"
                        ? `import os\nimport requests\n\nDATASETS = ${JSON.stringify(
                            filteredDatasets
                              .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
                              .map((d) => ({
                                name: d.name,
                                format: d.format,
                                url: d.url,
                              })),
                            null,
                            2
                          )}\n\nos.makedirs("harvested_spatial_data", exist_ok=True)\nfor ds in DATASETS:\n    r = requests.get(ds["url"], stream=True)\n    with open(f"harvested_spatial_data/{ds['name']}", "wb") as f:\n        for chunk in r.iter_content(1024*1024):\n            if chunk: f.write(chunk)\n    print(f"Saved {ds['name']}")`
                        : `#!/usr/bin/env bash\nmkdir -p harvested_spatial_data\n${filteredDatasets
                            .filter((d) => selectedItemIds.size === 0 || selectedItemIds.has(d.id))
                            .map((d) => `curl -L -o "harvested_spatial_data/${d.name}" "${d.url}"`)
                            .join("\n")}`;
                    const ext = selectedScriptTab === "python" ? "py" : "sh";
                    const blob = new Blob([content], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `spatial_harvester_pipeline.${ext}`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Script Downloaded" });
                  }}
                  className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .{selectedScriptTab === "python" ? "py" : "sh"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


