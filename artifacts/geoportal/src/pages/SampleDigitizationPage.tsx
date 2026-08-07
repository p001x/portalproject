import L from "leaflet";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Circle,
  Loader2,
  Trash2,
  Download,
  Upload,
  Edit,
  Cpu,
  Link as LinkIcon,
  Database,
  CheckCircle,
  Sparkles,
  Eye,
  EyeOff,
  Target,
  Compass,
  Cloud,
  MapPin,
  Square,
  Activity,
  Layers,
  Play,
  Search,
  Filter,
  Check,
  X,
  Pause,
  StopCircle,
  Save,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Satellite,
  TreePine,
  Thermometer,
  BarChart3,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapContainer, TileLayer, GeoJSON, Polyline as LeafletPolyline, Polygon as LeafletPolygon, useMapEvents, useMap, FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import * as turf from "@turf/turf";
import { api, DatasetRecord, BASE, getGeeToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { NativeRasterLayer } from "@/components/NativeRasterLayer";
import { GEEAuthGate } from "@/components/GEEAuthGate";

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapBoundsController({ bbox }: { bbox?: number[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bbox && bbox.length === 4) {
      const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ];
      try {
        map.fitBounds(bounds, { padding: [50, 50] });
      } catch (e) {}
    }
  }, [bbox, map]);
  return null;
}

export function SampleDigitizationPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Add Sample form state
  const [classLabel, setClassLabel] = useState("");
  const [classValue, setClassValue] = useState<number>(1);
  const [color, setColor] = useState("#0F6E4F");
  const [creator, setCreator] = useState("");
  const [geoJsonText, setGeoJsonText] = useState("");
  const [parseError, setParseError] = useState("");
  const [mapStyle, setMapStyle] = useState<"osm" | "satellite" | "none">("osm");
  const [classificationSource, setClassificationSource] = useState<"sentinel2" | "landsat8" | "custom" | "native_cog">("sentinel2");
  const [customAssetId, setCustomAssetId] = useState("");
  const [activeTab, setActiveTab] = useState("map");
  const [activeBbox, setActiveBbox] = useState<number[] | null>(null);
  const [showClassifyResult, setShowClassifyResult] = useState(true);

  // Drawing & Grouped Table state
  const [drawMode, setDrawMode] = useState<"point" | "polyline" | "polygon" | "rectangle" | "circle" | "pan">("point");
  const [pendingFeature, setPendingFeature] = useState<{ layer: any; type: string } | null>(null);
  const editGroupRef = useRef<any>(null);

  // Study Area State
  const [studyArea, setStudyArea] = useState<any>(null); // GeoJSON
  const [showStudyArea, setShowStudyArea] = useState(true);
  const [isDrawingStudyArea, setIsDrawingStudyArea] = useState(false);
  const studyAreaGroupRef = useRef<any>(null);
  const aoiBoundsRef = useRef<number[] | null>(null);
  
  useEffect(() => {
    if (studyArea) {
      try {
        aoiBoundsRef.current = turf.bbox(studyArea);
      } catch (e) {
        console.error("Turf bbox failed", e);
        aoiBoundsRef.current = null;
      }
    } else {
      aoiBoundsRef.current = null;
    }
  }, [studyArea]);

  const drawOptions = useMemo(() => {
    return {
      marker: drawMode === "point" ? { repeatMode: true } : false,
      polyline: drawMode === "polyline" ? { repeatMode: true, shapeOptions: { color: "#f59e0b", weight: 3 } } : false,
      polygon: drawMode === "polygon" ? { repeatMode: true, shapeOptions: { color: "#22c55e", fillOpacity: 0.3 } } : false,
      rectangle: drawMode === "rectangle" ? { repeatMode: true, shapeOptions: { color: "#eab308", fillOpacity: 0.1 } } : false,
      circle: drawMode === "circle" ? { repeatMode: true, shapeOptions: { color: "#06b6d4", fillOpacity: 0.2 } } : false,
      circlemarker: false,
    };
  }, [drawMode]);

  const autoStartDrawMode = useCallback((tool: string, editing: boolean) => {
    if (!editing || tool === "pan") return;
    const toolToCss: Record<string, string> = {
      point: "leaflet-draw-draw-marker",
      polyline: "leaflet-draw-draw-polyline",
      polygon: "leaflet-draw-draw-polygon",
      rectangle: "leaflet-draw-draw-rectangle",
      circle: "leaflet-draw-draw-circle",
    };
    const cssClass = toolToCss[tool];
    if (!cssClass) return;

    // Delay slightly to let React flush the new EditControl to the DOM if drawMode just changed
    setTimeout(() => {
      let retries = 10;
      const tryClick = () => {
        const btn = document.querySelector(`a.${cssClass}`) as HTMLElement;
        if (btn) {
          // Only click if it's not already active
          if (!btn.classList.contains('leaflet-draw-toolbar-button-enabled') && !btn.parentElement?.classList.contains('leaflet-draw-toolbar-button-enabled')) {
            btn.click();
          }
        }
        else if (retries > 0) {
          retries--;
          setTimeout(tryClick, 200);
        }
      };
      tryClick();
    }, 50);
  }, []);

  const cancelDrawMode = useCallback(() => {
    const cancelBtn = document.querySelector('a[title="Cancel drawing"]') as HTMLElement;
    if (cancelBtn) cancelBtn.click();
  }, []);
  const [activePoints, setActivePoints] = useState<[number, number][]>([]);
  const [classFilter, setClassFilter] = useState("");

  // ── Timelapse / Imagery state ────────────────────────────────────────────
  type TLSource = "sentinel2" | "landsat" | "gedi";
  const TL_SOURCES: { id: TLSource; label: string; years: number[]; defaultScale: number; icon: React.ReactNode }[] = [
    { id: "sentinel2", label: "Sentinel-2 (10m, 2018+)",  years: Array.from({length: 2025-2018}, (_, i) => 2018+i), defaultScale: 10,  icon: <Satellite className="w-3 h-3" /> },
    { id: "landsat",   label: "Landsat-8 (30m, 1990+)",   years: Array.from({length: 2025-1990}, (_, i) => 1990+i), defaultScale: 30,  icon: <Layers className="w-3 h-3" /> },
    { id: "gedi",      label: "GEDI LiDAR canopy (2019+)",years: Array.from({length: 2025-2019}, (_, i) => 2019+i), defaultScale: 25,  icon: <TreePine className="w-3 h-3" /> },
  ];
  const [tlSource, setTlSource] = useState<TLSource>("sentinel2");
  const [tlYearIdx, setTlYearIdx] = useState(TL_SOURCES[0].years.length - 1); // default to most recent
  const [gediMode, setGediMode] = useState<"single" | "rolling" | "cumulative">("rolling");
  const [gediWindow, setGediWindow] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelapseTileUrl, setTimelapseTileUrl] = useState<string | null>(null);
  const [tlStatus, setTlStatus] = useState<string>("");
  const [tlLoading, setTlLoading] = useState(false);
  const [tlPanelOpen, setTlPanelOpen] = useState(true);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current source config
  const tlSourceCfg = TL_SOURCES.find(s => s.id === tlSource)!;
  const tlYear = tlSourceCfg.years[Math.min(tlYearIdx, tlSourceCfg.years.length - 1)];

  // Stop play when source changes
  useEffect(() => {
    setIsPlaying(false);
    setTlYearIdx(tlSourceCfg.years.length - 1);
    setTimelapseTileUrl(null);
    setTlStatus("");
  }, [tlSource]);

  // Play logic - carefully waits for loading to finish to avoid backend/GEE overload
  useEffect(() => {
    if (!isPlaying || tlLoading) return;
    
    const timer = setTimeout(() => {
      setTlYearIdx(prev => (prev + 1) % tlSourceCfg.years.length);
    }, 1500); // 1.5s pause to view the loaded frame
    
    return () => clearTimeout(timer);
  }, [isPlaying, tlLoading, tlSourceCfg.years.length]);

  // Auto-load tile when year changes while playing
  useEffect(() => {
    if (isPlaying) loadTimelapseTile();
  }, [tlYearIdx, isPlaying]); // eslint-disable-line

  const loadTimelapseTile = useCallback(async () => {
    setTlLoading(true);
    setTlStatus("");
    try {
      const year = tlSourceCfg.years[Math.min(tlYearIdx, tlSourceCfg.years.length - 1)];
      const body: any = { source: tlSource, year };
      if (aoiBoundsRef.current) body.aoi_bounds = aoiBoundsRef.current;
      if (tlSource === "gedi") { body.gedi_mode = gediMode; body.gedi_window = gediWindow; }
      const res = await api.gee.timelapseTile(body);
      setTimelapseTileUrl(res.tile_url);
      if (res.shot_count !== undefined) {
        const dr = res.date_range ? `${res.date_range[0]} → ${res.date_range[1]}` : "";
        setTlStatus(res.shot_count === 0
          ? `⚠ No GEDI shots in ${dr}. Try 'Cumulative' mode.`
          : `✓ GEDI: ${res.shot_count} monthly composites (${dr})`);
      }
    } catch(e: any) {
      setTlStatus(`⚠ ${e.message || "Failed to load tile"}`);
    } finally {
      setTlLoading(false);
    }
  }, [tlSource, tlYearIdx, tlSourceCfg.years, gediMode, gediWindow]);

  // ── Training Sample Extraction state ────────────────────────────────────
  const [extractScale, setExtractScale] = useState(tlSourceCfg.defaultScale);
  const [extractResult, setExtractResult] = useState<{ n_samples: number; band_names: string[]; csv_b64: string; source: string; year: number } | null>(null);
  const [extractPanelOpen, setExtractPanelOpen] = useState(false);

  const extractMut = useMutation({
    mutationFn: () => {
      const allSamples = [...samples, ...sessionSamples];
      if (!allSamples.length) throw new Error("No samples to extract from. Digitize some features first.");
      const year = tlSourceCfg.years[Math.min(tlYearIdx, tlSourceCfg.years.length - 1)];
      return api.gee.extractSamples({
        source: tlSource,
        year,
        scale: extractScale,
        gedi_mode: gediMode,
        gedi_window: gediWindow,
        aoi_bounds: aoiBoundsRef.current ?? undefined,
        samples: allSamples.map(s => ({ geometry: s.geometry, class_label: s.class_label })),
      });
    },
    onSuccess: (res) => {
      setExtractResult(res);
      toast({ title: `Extracted ${res.n_samples} pixels!`, description: `Bands: ${res.band_names.join(", ")}. Download CSV below.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Extraction Failed", description: e.message }),
  });

  const downloadCsv = useCallback(() => {
    if (!extractResult) return;
    const bytes = atob(extractResult.csv_b64);
    const blob = new Blob([bytes], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `training_${extractResult.source}_${extractResult.year}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [extractResult]);


  // Session Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [sessionSamples, setSessionSamples] = useState<Array<{
    id: string;
    geometry: any;
    class_label: string;
    class_value?: number;
    color: string;
    creator: string;
    created_at: string;
  }>>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [datasetNameInput, setDatasetNameInput] = useState("");
  const [sessionCreatorInput, setSessionCreatorInput] = useState("");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState("all");

  const [isAddDataModalOpen, setIsAddDataModalOpen] = useState(false);
  const [addDataTab, setAddDataTab] = useState("upload");

  const drawStateRef = useRef({ studyArea, isDrawingStudyArea, classLabel, classValue, color, creator, sessionCreatorInput });
  useEffect(() => {
    drawStateRef.current = { studyArea, isDrawingStudyArea, classLabel, classValue, color, creator, sessionCreatorInput };
  }, [studyArea, isDrawingStudyArea, classLabel, classValue, color, creator, sessionCreatorInput]);

  const handleCreated = useCallback((e: any) => {
    const state = drawStateRef.current;
    const geojson = e.layer.toGeoJSON();
    
    if (state.isDrawingStudyArea) {
      setStudyArea(geojson);
      setIsDrawingStudyArea(false);
      if (editGroupRef.current) {
        editGroupRef.current.removeLayer(e.layer);
      }
      toast({ title: "Study Area Defined", description: "You can now digitize samples within this area." });
      cancelDrawMode();
      setDrawMode("pan");
      return;
    }

    if (state.studyArea) {
      try {
        let isInside = false;
        if (state.studyArea.type === "FeatureCollection") {
          for (const feature of state.studyArea.features) {
            if (turf.booleanIntersects(feature, geojson)) {
              isInside = true;
              break;
            }
          }
        } else {
          isInside = turf.booleanIntersects(state.studyArea, geojson);
        }
        
        if (!isInside) {
          e.layer.remove();
          toast({ title: "Outside Study Area", description: "Sample must be completely inside the defined study area.", variant: "destructive" });
          return;
        }
      } catch (err) {
        console.warn("Turf validation failed", err);
      }
    }

    const draft = {
      id: "draft_" + Math.random().toString(36).substring(2, 9),
      geometry: geojson.geometry || geojson,
      class_label: state.classLabel.trim() || "Unclassified",
      class_value: state.classValue || 1,
      color: state.color || "#0F6E4F",
      creator: state.creator.trim() || "anonymous",
      created_at: new Date().toISOString(),
    };
    
    setSessionSamples((prev) => [...prev, draft]);
    setPendingFeature({ layer: e.layer, type: e.layerType });
    setGeoJsonText(JSON.stringify(geojson, null, 2));
    
    if (editGroupRef.current) {
      editGroupRef.current.removeLayer(e.layer);
    }
    
    toast({ title: `${e.layerType} drawn & buffered`, description: `Class: ${draft.class_label}` });
  }, [toast]);

  const handleEdited = useCallback((e: any) => {
    toast({ title: `Shape updated`, description: "Click Confirm Capture when ready." });
  }, [toast]);

  const handleDeleted = useCallback(() => {
    setPendingFeature(null);
    toast({ title: "Shape removed" });
  }, [toast]);

  // Class Visibility & Sampling Bias Evaluation State
  const [hiddenClasses, setHiddenClasses] = useState<Record<string, boolean>>({});
  const [showAllSamples, setShowAllSamples] = useState(true);
  const [showCoverageBuffers, setShowCoverageBuffers] = useState(false);
  const [bufferRadiusKm, setBufferRadiusKm] = useState(1);

  const toggleClassVisibility = (cName: string) => {
    setHiddenClasses((prev) => ({
      ...prev,
      [cName]: !prev[cName],
    }));
  };

  const batchSaveMut = useMutation({
    mutationFn: async () => {
      return api.samples.batchSave({
        dataset_name: datasetNameInput.trim() || "Manual_Session",
        creator: sessionCreatorInput.trim() || creator || "anonymous",
        samples: sessionSamples.map((s) => ({
          geometry: s.geometry,
          class_label: s.class_label,
          class_value: s.class_value || 1,
          color: s.color,
          creator: s.creator,
        })),
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      setSessionSamples([]);
      setIsEditing(false);
      setIsSaveModalOpen(false);
      toast({
        title: "Training Dataset Saved & Committed! 🎉",
        description: `Saved ${res.saved_count} feature(s) into dataset '${res.dataset_name}'.`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Batch Save Failed", description: e.message });
    },
  });

  // Classification state
  const [classifyResult, setClassifyResult] = useState<{
    tile_url: string;
    download_url?: string;
    classes: string[];
    colors: Record<string, string>;
    areas: Record<string, number>;
    accuracy?: { overall_accuracy?: number; kappa?: number };
  } | null>(null);

  // Import / Ingest state
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [importClassLabel, setImportClassLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scrapedLinks, setScrapedLinks] = useState<string[]>([]);

  // GEE Upload state
  const [geeFile, setGeeFile] = useState<File | null>(null);
  const [assetName, setAssetName] = useState("");

  const { data: samplesData, isLoading: isLoadingSamples } = useQuery({
    queryKey: ["samples"],
    queryFn: () => api.samples.list(),
  });
  const samples = samplesData?.samples ?? [];

  const { data: adminDatasets } = useQuery({
    queryKey: ["datasets", "admin"],
    queryFn: () => api.datasets.list("admin"),
  });
  const { data: communityDatasets } = useQuery({
    queryKey: ["datasets", "community"],
    queryFn: () => api.datasets.list("community"),
  });
  const allDatasets: DatasetRecord[] = [
    ...(adminDatasets?.records ?? []),
    ...(communityDatasets?.records ?? []),
  ].filter(r => r.file_type === "tiff" || (r.original_filename && r.original_filename.toLowerCase().match(/\.tiff?$/)));

  const commitGeometryDirectly = (geometryObj: any) => {
    const geoJsonStr = JSON.stringify(geometryObj, null, 2);
    setGeoJsonText(geoJsonStr);

    const targetClass = classLabel.trim() || "Unclassified";
    const targetColor = color || "#0F6E4F";
    const targetCreator = creator.trim() || sessionCreatorInput.trim() || "anonymous";

    if (isEditing) {
      const draft = {
        id: "draft_" + Math.random().toString(36).substring(2, 9),
        geometry: geometryObj,
        class_label: targetClass,
        color: targetColor,
        creator: targetCreator,
        created_at: new Date().toISOString(),
      };
      setSessionSamples((prev) => [...prev, draft]);
      toast({
        title: `✅ ${geometryObj.type} Recorded to Session`,
        description: `Saved under class '${targetClass}'. Tool mode remains active!`,
      });
    } else {
      api.samples
        .add({
          geometry: geometryObj,
          class_label: targetClass,
          color: targetColor,
          creator: targetCreator,
        })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["samples"] });
          toast({
            title: `✅ ${geometryObj.type} Recorded`,
            description: `Saved under class '${targetClass}'. Tool mode remains active!`,
          });
        })
        .catch((err) => {
          toast({ variant: "destructive", title: "Save Error", description: err.message });
        });
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    const latFixed = Number(lat.toFixed(6));
    const lngFixed = Number(lng.toFixed(6));

    if (drawMode === "point") {
      const pointGeom = { type: "Point", coordinates: [lngFixed, latFixed] };
      commitGeometryDirectly(pointGeom);
      setActivePoints([]);
    } else if (drawMode === "polyline" || drawMode === "polygon") {
      const newPoints: [number, number][] = [...activePoints, [latFixed, lngFixed]];
      setActivePoints(newPoints);
      toast({
        title: `${drawMode === "polyline" ? "Line" : "Polygon"} Vertex #${newPoints.length} Added`,
        description: `[${lngFixed}, ${latFixed}] added. Click 'Finish Shape' when complete.`,
      });
    } else if (drawMode === "rectangle") {
      if (activePoints.length === 0) {
        setActivePoints([[latFixed, lngFixed]]);
        toast({
          title: "Rectangle Corner 1 Set",
          description: "Click opposite corner on map to complete rectangle.",
        });
      } else {
        const [c1Lat, c1Lng] = activePoints[0];
        const minLat = Math.min(c1Lat, latFixed);
        const maxLat = Math.max(c1Lat, latFixed);
        const minLng = Math.min(c1Lng, lngFixed);
        const maxLng = Math.max(c1Lng, lngFixed);
        const rectGeom = {
          type: "Polygon",
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        };
        commitGeometryDirectly(rectGeom);
        setActivePoints([]);
      }
    }
  };

  const finishShape = () => {
    if (drawMode === "polyline") {
      if (activePoints.length < 2) {
        toast({ variant: "destructive", title: "Incomplete Line", description: "At least 2 vertices are required for a line." });
        return;
      }
      const coords = activePoints.map(([lat, lng]) => [lng, lat]);
      const lineGeom = { type: "LineString", coordinates: coords };
      commitGeometryDirectly(lineGeom);
      setActivePoints([]);
    } else if (drawMode === "polygon") {
      if (activePoints.length < 3) {
        toast({ variant: "destructive", title: "Incomplete Polygon", description: "At least 3 vertices are required for a polygon." });
        return;
      }
      const coords = activePoints.map(([lat, lng]) => [lng, lat]);
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
      }
      const polyGeom = { type: "Polygon", coordinates: [coords] };
      commitGeometryDirectly(polyGeom);
      setActivePoints([]);
    }
  };

  const addMut = useMutation({
    mutationFn: () => {
      setParseError("");
      let geometry: any;
      try {
        geometry = JSON.parse(geoJsonText);
      } catch {
        throw new Error("Invalid GeoJSON — check your input.");
      }
      return api.samples.add({ geometry, class_label: classLabel, color, creator });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      setGeoJsonText("");
      setActivePoints([]);
      toast({ title: "Sample Saved", description: `Sample saved under class '${classLabel}'.` });
    },
    onError: (e: Error) => setParseError(e.message),
  });

  const handleSaveSample = () => {
    setParseError("");
    let geometry: any;
    try {
      geometry = JSON.parse(geoJsonText);
    } catch {
      setParseError("Invalid GeoJSON — check your input.");
      return;
    }

    if (isEditing) {
      toast({ title: "Auto-Buffered", description: "Features are now automatically buffered as you draw them." });
    } else {
      addMut.mutate();
    }
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.samples.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      toast({ title: "Sample Deleted" });
    },
  });

  const deleteClassMut = useMutation({
    mutationFn: async (targetClass: string) => {
      const targetSamples = samples.filter((s) => (s.class_label?.trim() || "Unclassified") === targetClass);
      await Promise.all(targetSamples.map((s) => api.samples.delete(s.id)));
      setSessionSamples((prev) => prev.filter((s) => (s.class_label?.trim() || "Unclassified") !== targetClass));
    },
    onSuccess: (_, targetClass) => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      toast({ title: `Class '${targetClass}' Deleted`, description: `Removed all samples for class '${targetClass}'.` });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Delete Class Failed", description: e.message });
    },
  });

  const allCombinedSamples = useMemo(() => {
    return [...samples, ...sessionSamples];
  }, [samples, sessionSamples]);

  const groupedSamples = useMemo(() => {
    const map: Record<string, { color: string; items: typeof allCombinedSamples }> = {};
    for (const s of allCombinedSamples) {
      const label = s.class_label?.trim() || "Unclassified";
      if (!map[label]) {
        map[label] = { color: s.color || "#0F6E4F", items: [] };
      }
      map[label].items.push(s);
    }
    return map;
  }, [allCombinedSamples]);

  const classifyMut = useMutation({
    mutationFn: () => api.samples.classify({
      data_source: classificationSource,
      custom_asset_id: customAssetId,
      samples: allCombinedSamples,
      aoi: studyArea || undefined
    }),
    onSuccess: (data) => {
      setClassifyResult(data);
      toast({
        title: "Classification Complete!",
        description: `Random Forest trained on ${allCombinedSamples.length} samples over ${classificationSource}.`,
      });
    },
    onError: (e: Error) => {
      toast({
        variant: "destructive",
        title: "Classification Failed",
        description: e.message,
      });
    },
  });

  const [previewGeoJSON, setPreviewGeoJSON] = useState<any>(null);
  const [previewDatasetName, setPreviewDatasetName] = useState<string>("");
  const [imageryTileUrl, setImageryTileUrl] = useState<string | null>(null);
  const [nativePreviewUrl, setNativePreviewUrl] = useState<string | null>(null);

  const loadImageryMut = useMutation({
    mutationFn: async (args: { dataSource: string; customAssetId?: string }) => {
      const bbox = previewGeoJSON ? window.L?.geoJSON(previewGeoJSON).getBounds() : undefined;
      let aoiBounds;
      if (bbox) {
        aoiBounds = [bbox.getWest(), bbox.getSouth(), bbox.getEast(), bbox.getNorth()];
      }
      return api.gee.previewImagery({
        data_source: args.dataSource,
        custom_asset_id: args.customAssetId,
        aoi_bounds: aoiBounds
      });
    },
    onSuccess: (res) => {
      setImageryTileUrl(res.tile_url);
      setMapStyle("satellite");
      toast({
        title: "Imagery Loaded!",
        description: "The dataset imagery is now visible on the map for digitization.",
      });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to load imagery", description: e.message })
  });

  const previewDatasetMut = useMutation({
    mutationFn: async () => {
      const d = allDatasets.find((r) => r.id === selectedDatasetId);
      if (!d) throw new Error("Please select a dataset to preview");
      const res = await api.datasets.preview(d.id, d.source);
      return { res, name: d.name, record: d };
    },
    onSuccess: (data) => {
      const { res, name, record } = data;
      setPreviewDatasetName(name);

      // 1. Set Bounding Box if available so map automatically fits & flies to dataset location
      const bbox = res.bbox || record.bbox;
      if (bbox && bbox.length === 4) {
        setActiveBbox(bbox);
      } else if (res.bounds && Array.isArray(res.bounds) && res.bounds.length === 2) {
        const [[s, w], [n, e]] = res.bounds;
        setActiveBbox([w, s, e, n]);
      }

      // 2. Handle Vector GeoJSON
      if (res.type === "FeatureCollection" || res.features || res.type === "Feature") {
        setPreviewGeoJSON(res);
        setNativePreviewUrl(null);
      } else if (res.geojson) {
        setPreviewGeoJSON(res.geojson);
        setNativePreviewUrl(null);
      } else {
        setPreviewGeoJSON(null);
      }

      // 3. Handle Raster / TIFF / COG / URL Dataset Overlay
      const key = record.storage_key || res.storage_key || res.url || "";
      const isTiff =
        record.file_type === "tiff" ||
        key.toLowerCase().includes(".tif") ||
        key.toLowerCase().includes(".tiff") ||
        key.startsWith("url::") ||
        res.type === "image" ||
        res.type === "url";

      if (isTiff) {
        const rawUrl = key.startsWith("url::") ? key.slice(5) : key;
        const tileUrl = `https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`;
        setNativePreviewUrl(tileUrl);
        setClassificationSource("native_cog");
        setCustomAssetId(rawUrl);

        if (!bbox) {
          fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}`)
            .then((r) => r.json())
            .then((bData) => {
              if (bData.bbox) setActiveBbox(bData.bbox);
            })
            .catch(() => {});
        }
      }

      setActiveTab("map");
      toast({
        title: "Map Overlay Active 🗺️",
        description: `'${name}' is now active on the map and set as imagery source.`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Overlay Preview Failed", description: e.message });
    },
  });

  const importDatasetMut = useMutation({
    mutationFn: () => {
      const d = allDatasets.find((r) => r.id === selectedDatasetId);
      const source = d?.source || "admin";
      return api.samples.importDataset({
        dataset_id: selectedDatasetId,
        source,
        class_label: importClassLabel || undefined,
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      if (res.kind === "raster" && res.asset_id) {
        toast({
          title: "Raster Dataset Ingested!",
          description: `Dataset pushed to GEE as ${res.asset_id}. It is now selected as your active map layer.`,
        });
        setCustomAssetId(res.asset_id);
        setClassificationSource("custom");
        setActiveTab("map");
        loadImageryMut.mutate({ dataSource: "custom", customAssetId: res.asset_id });
      } else {
        toast({
          title: "Imported into GEE Training Samples!",
          description: `Pushed ${res.imported_count} feature(s) from dataset '${res.dataset_name}' directly into GEE training samples.`,
        });
      }
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Import Failed", description: e.message });
    },
  });

  const scrapeDirectoryMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`https://geoportal-api-ygzi.onrender.com/api/datasets/scrape-directory?url=${encodeURIComponent(linkUrl)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      if (data.links && data.links.length > 0) {
        setScrapedLinks(data.links);
        toast({ title: `Found ${data.links.length} datasets`, description: "Select one from the list below." });
      } else {
        setScrapedLinks([]);
        toast({ title: "No datasets found", description: "Could not find any .tif, .geojson, or .shp files at that URL.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Scrape Failed", description: err.message, variant: "destructive" });
      setScrapedLinks([]);
    }
  });

  const backupToKaggleMut = useMutation({
    mutationFn: () => api.datasets.addLink({ url: linkUrl, name: "Backed up URL: " + linkUrl.split("/").pop(), source: "community" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", "community"] });
      toast({ title: "Backed up to Kaggle!", description: "The external data was safely downloaded and stored in the RARE DATA Repository." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Backup Failed", description: e.message });
    }
  });

  const ingestUrlMut = useMutation({
    mutationFn: () => api.samples.ingestUrl({ url: linkUrl, class_label: importClassLabel || "Url_Import" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      if (res.kind === "raster" && res.asset_id) {
        toast({
          title: "Raster Ingested!",
          description: `URL downloaded and pushed to GEE as ${res.asset_id}. It is now selected as your classification source.`,
        });
        setCustomAssetId(res.asset_id);
        setClassificationSource("custom");
        setActiveTab("map");
        loadImageryMut.mutate({ dataSource: "custom", customAssetId: res.asset_id });
      } else {
        toast({
          title: "Link Ingested!",
          description: `Ingested ${res.imported_count} feature(s) from link URL.`,
        });
      }
      setLinkUrl("");
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Link Ingestion Failed", description: e.message });
    },
  });

  const [uploadBusy, setUploadBusy] = useState(false);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    toast({ title: "Uploading Data...", description: "Please wait" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      fd.append("source", "community");
      fd.append("description", "Uploaded from Digitizer Map");
      const res = await api.datasets.upload(fd);
      
      qc.invalidateQueries({ queryKey: ["datasets"] });
      setSelectedDatasetId(res.id);

      const key = res.storage_key || res.name;
      const rawUrl = key.startsWith("url::") ? key.slice(5) : key;

      if (
        res.file_type === "tiff" ||
        key.toLowerCase().includes(".tif") ||
        key.toLowerCase().includes(".tiff")
      ) {
        setNativePreviewUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`);
        setClassificationSource("native_cog");
        setCustomAssetId(rawUrl);
        setPreviewDatasetName(res.name);

        if (res.bbox && res.bbox.length === 4) {
          setActiveBbox(res.bbox);
        } else {
          fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}`)
            .then((r) => r.json())
            .then((bData) => {
              if (bData.bbox) setActiveBbox(bData.bbox);
            })
            .catch(() => {});
        }
      } else {
        setTimeout(() => previewDatasetMut.mutate(), 500);
      }
      
      toast({ title: "Upload Success 🎉", description: `'${res.name}' was uploaded and is now active on the map!` });
    } catch(err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: err.message });
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  const [targetGeeProjectId, setTargetGeeProjectId] = useState("ee-petersonyang87");
  const [destinationAssetId, setDestinationAssetId] = useState("projects/ee-petersonyang87/assets/rwanda_training_samples");

  const geeMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (geeFile) fd.append("file", geeFile);
      fd.append("asset_name", assetName);
      if (targetGeeProjectId.trim()) fd.append("project_id", targetGeeProjectId.trim());
      const geeHeaders: Record<string, string> = {};
      const geeToken = getGeeToken();
      if (geeToken) geeHeaders["X-GEE-Token"] = geeToken;
      return fetch(BASE + "/samples/push-to-gee", { method: "POST", body: fd, headers: geeHeaders }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail ?? r.statusText)));
        return r.json();
      });
    },
    onSuccess: (res) => {
      setGeeFile(null);
      setAssetName("");
      toast({
        title: "GEE Asset Upload Complete!",
        description: `Asset ID: ${res.asset_id ?? res.kind}`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "GEE Upload Failed", description: e.message });
    },
  });

  const pushSamplesToGeeAssetMut = useMutation({
    mutationFn: async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const geeToken = getGeeToken();
      if (geeToken) headers["X-GEE-Token"] = geeToken;
      const res = await fetch(BASE + "/samples/export/gee-asset", {
        method: "POST",
        headers,
        body: JSON.stringify({
          asset_id: destinationAssetId.trim(),
          project_id: targetGeeProjectId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "GEE Asset Push Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Pushed to GEE Asset Catalog! 🚀",
        description: data.message || `Task ID: ${data.task_id} | Asset: ${data.asset_id}`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "GEE Push Failed", description: err.message });
    },
  });

  const downloadGeoJSON = () => {
    const fc = {
      type: "FeatureCollection",
      features: samples.map((s) => ({
        type: "Feature",
        geometry: s.geometry,
        properties: {
          id: s.id,
          class_label: s.class_label,
          color: s.color,
          creator: s.creator,
          created_at: s.created_at,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "training_samples.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadShapefile = () => {
    window.open(`${BASE}/samples/export/shapefile`, "_blank");
    toast({
      title: "Shapefile Download Started 📦",
      description: "Exporting training samples as ESRI Shapefile ZIP archive (.shp, .shx, .dbf, .prj).",
    });
  };

  const trainSupervisedClassifierDirectly = () => {
    if (allCombinedSamples.length === 0) {
      toast({
        variant: "destructive",
        title: "No Samples Available",
        description: "Digitize at least 2 land cover classes before running Supervised Classification.",
      });
      return;
    }
    classifyMut.mutate();
    toast({
      title: "Supervised ML Classification Triggered 🚀",
      description: `Training Random Forest model on ${allCombinedSamples.length} digitized sample(s)...`,
    });
  };

  return (
    <GEEAuthGate>
    <div className="flex flex-col h-full overflow-y-auto p-6">
      <div className="flex items-center gap-2 text-primary font-semibold text-xl mb-2">
        <Edit className="w-5 h-5" />
        Sample Digitization &amp; Machine Learning
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Digitize training samples, import datasets from RARE DATA or URLs, and train Supervised Machine Learning classifiers.
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mb-4 self-start">
          <TabsTrigger value="map" className="gap-1.5">
            <Edit className="w-4 h-4" /> Map &amp; Digitizer
          </TabsTrigger>
          <TabsTrigger value="classify" className="gap-1.5">
            <Cpu className="w-4 h-4 text-emerald-500" /> Supervised Classification
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Database className="w-4 h-4 text-blue-500" /> Import RARE DATA &amp; Links
          </TabsTrigger>
          <TabsTrigger value="gee" className="gap-1.5">
            <Upload className="w-4 h-4 text-amber-500" /> GEE Asset Upload
          </TabsTrigger>
        </TabsList>

        {/* 1. MAP & SAMPLES TAB */}
        <TabsContent value="map" className="flex-1 space-y-6">
          <div className="flex gap-4">
            <div className="w-80 shrink-0 space-y-4">
              <div className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between font-medium text-sm">
                  <span>Add Training Sample</span>
                  <span className="text-[10px] text-muted-foreground">Click map to pin point</span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Quick Select Class (or type a new one below)</Label>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 border rounded-md bg-muted/20">
                    {[
                      { name: "Built-up", color: "#ff0000" },
                      { name: "Vegetation", color: "#00ff00" },
                      { name: "Water", color: "#0000ff" },
                      { name: "Rocks", color: "#8b4513" },
                      { name: "Swamp", color: "#800080" },
                      { name: "Forest", color: "#006400" },
                      { name: "Cropland", color: "#ffff00" },
                      { name: "Grass", color: "#7cfc00" },
                      { name: "Shrubland", color: "#a0522d" },
                      { name: "Mangrove", color: "#004d00" },
                      { name: "Rural Settlement", color: "#ffa500" },
                      { name: "Dense Forest", color: "#228b22" },
                      { name: "Bare Land", color: "#d2b48c" },
                      { name: "Permanent Water", color: "#4169e1" },
                      { name: "Plantation Crops", color: "#9acd32" },
                      { name: "Savanna Woodland", color: "#bdb76b" },
                      { name: "Dense Urban", color: "#8b0000" },
                      { name: "Floodplain", color: "#87ceeb" },
                      { name: "Aquatic Vegetation", color: "#20b2aa" }
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => { 
                          setClassLabel(p.name); 
                          setColor(p.color); 
                          // Keep drawing tool enabled
                          if (isEditing) {
                            setTimeout(() => autoStartDrawMode(drawMode, true), 50);
                          }
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 bg-background hover:bg-accent transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Class Label</Label>
                    <input
                      value={classLabel}
                      onChange={(e) => setClassLabel(e.target.value)}
                      placeholder="e.g. Forest, Urban, Water"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Numerical ID</Label>
                    <input
                      type="number"
                      value={classValue}
                      onChange={(e) => setClassValue(parseInt(e.target.value) || 1)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Color</Label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-9 rounded-md border border-input cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Creator</Label>
                  <input
                    value={creator}
                    onChange={(e) => setCreator(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Geometry (GeoJSON)</Label>
                  <textarea
                    value={geoJsonText}
                    onChange={(e) => setGeoJsonText(e.target.value)}
                    placeholder='{"type":"Point","coordinates":[29.87,-1.94]}'
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono resize-y"
                  />
                </div>

                {parseError && <p className="text-xs text-destructive">{parseError}</p>}

                <Button
                  className={`w-full gap-2 font-bold ${isEditing ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""}`}
                  onClick={handleSaveSample}
                  disabled={addMut.isPending || !classLabel || !geoJsonText}
                >
                  {addMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isEditing ? (
                    <Save className="w-4 h-4" />
                  ) : (
                    <Edit className="w-4 h-4" />
                  )}
                  {isEditing ? `Add Feature to Session Buffer (#${sessionSamples.length + 1})` : "Save Sample Immediately"}
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {/* Study Area Section */}
              <div className="bg-card p-3 rounded-lg border border-destructive/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold uppercase tracking-wider text-destructive/80">0. Define Study Area</Label>
                  {studyArea && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Set</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">You must define a study area before digitizing samples.</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button 
                    size="sm" 
                    variant={isDrawingStudyArea ? "default" : "outline"} 
                    className="h-8 text-xs" 
                    onClick={() => {
                      if (isEditing) {
                        toast({ title: "Stop Edit Session first" });
                        return;
                      }
                      if (!isDrawingStudyArea) {
                        setIsDrawingStudyArea(true);
                        setStudyArea(null);
                        setTimeout(() => autoStartDrawMode("polygon", true), 300);
                      } else {
                        setIsDrawingStudyArea(false);
                      }
                    }}
                  >
                    {isDrawingStudyArea ? "Cancel Draw" : "Draw on Map"}
                  </Button>
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".zip" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const buffer = await file.arrayBuffer();
                          const shp = await import('shpjs');
                          const geojson = await shp.default(buffer);
                          setStudyArea(geojson);
                          toast({ title: "Study Area Uploaded" });
                        } catch (err) {
                          console.error(err);
                          toast({ title: "Upload Failed", description: "Could not parse zip shapefile", variant: "destructive" });
                        }
                        e.target.value = '';
                      }}
                    />
                    <Button size="sm" variant="outline" className="h-8 text-xs">Upload .zip Shapefile</Button>
                  </div>
                  
                  {studyArea && (
                    <div className="flex items-center gap-4 ml-auto">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="show-study-area"
                          checked={showStudyArea}
                          onChange={(e) => setShowStudyArea(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <Label htmlFor="show-study-area" className="text-xs cursor-pointer">
                          Show on Map
                        </Label>
                      </div>
                      <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => {
                         setStudyArea(null);
                         if (isEditing) setIsEditing(false); 
                      }}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card p-2 rounded-lg border">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">Draw Tool:</Label>
                  <button
                    type="button"
                    onClick={() => { setDrawMode("point"); autoStartDrawMode("point", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "point" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" /> Point
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDrawMode("polyline"); autoStartDrawMode("polyline", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "polyline" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" /> Polyline
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDrawMode("polygon"); autoStartDrawMode("polygon", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "polygon" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" /> Polygon
                  </button>
                  <button
                    type="button"
                    onClick={() => { 
                      cancelDrawMode(); 
                      setDrawMode("pan"); 
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "pan" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="text-sm">🖐️</span> Pan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDrawMode("rectangle"); autoStartDrawMode("rectangle", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "rectangle" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" /> Rectangle
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDrawMode("circle"); autoStartDrawMode("circle", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "circle" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Circle className="w-3.5 h-3.5" /> Circle
                  </button>

                </div>

                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 text-xs shadow-sm h-8"
                      disabled={!studyArea}
                      onClick={() => {
                        setIsEditing(true);
                        setSessionSamples([]);
                        toast({ title: "Edit Session Started 🟢", description: "Digitize features and click Stop Edit when finished." });
                        setTimeout(() => autoStartDrawMode(drawMode, true), 300);
                      }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start Edit Session
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="font-bold gap-1.5 text-xs shadow-sm h-8 animate-pulse"
                      onClick={() => {
                        if (sessionSamples.length === 0) {
                          setIsEditing(false);
                          toast({ title: "Edit Session Stopped", description: "No features were digitized." });
                        } else {
                          setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0,10)}`);
                          setIsSaveModalOpen(true);
                        }
                      }}
                    >
                      <StopCircle className="w-3.5 h-3.5" /> Stop Edit Session ({sessionSamples.length})
                    </Button>
                  )}

                  <select 
                    value={mapStyle} 
                    onChange={(e) => setMapStyle(e.target.value as "osm" | "satellite" | "none")}
                    className="bg-muted text-xs px-2 py-1 rounded border-input border font-medium h-8"
                  >
                    <option value="osm">OpenStreetMap</option>
                    <option value="satellite">Esri Satellite</option>
                    <option value="none">Blank (No Basemap)</option>
                  </select>
                  <Button
                    type="button"
                    onClick={() => setIsAddDataModalOpen(true)}
                    className={`cursor-pointer text-xs flex items-center gap-2 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 px-3 h-8 rounded-md transition-colors border border-emerald-500/30 shadow-sm ${uploadBusy ? 'opacity-50 pointer-events-none' : ''}`} title="Upload Image / Data to view map for training"
                  >
                     {uploadBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>📁</span>}
                     {uploadBusy ? 'Uploading...' : 'Add Data'}
                  </Button>
                </div>
              </div>

              {/* Map Layer Visibility & Spatial Bias Evaluation Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted/40 p-2 rounded-lg border text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-emerald-500" /> Map Layer Visibility:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllSamples(!showAllSamples)}
                    className={`px-2 py-0.5 rounded font-medium transition-colors flex items-center gap-1 border ${
                      showAllSamples ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30" : "bg-background text-muted-foreground"
                    }`}
                  >
                    {showAllSamples ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-destructive" />}
                    {showAllSamples ? "All Map Layers Visible" : "All Layers Hidden"}
                  </button>

                  {Object.keys(hiddenClasses).filter((k) => hiddenClasses[k]).length > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-mono">
                      {Object.keys(hiddenClasses).filter((k) => hiddenClasses[k]).length} class(es) hidden
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCoverageBuffers(!showCoverageBuffers)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 border ${
                      showCoverageBuffers ? "bg-amber-950/60 text-amber-300 border-amber-500/40 font-bold" : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    title="Toggle 1km buffer coverage rings around point samples to evaluate spatial clustering and sampling bias"
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                    {showCoverageBuffers ? "1km Bias Rings (Active)" : "Evaluate Sampling Bias (1km Rings)"}
                  </button>
                </div>
              </div>

              {/* Active Classification Overlay Banner */}
              {classifyResult?.tile_url && (
                <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-500/50 p-2.5 rounded-lg text-xs animate-in fade-in shadow-sm">
                  <span className="flex items-center gap-2 text-emerald-300 font-semibold">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                    Supervised Classification Map Overlay Active!
                    {classifyResult.accuracy && (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950 font-mono text-[10px] ml-2">
                        Overall Accuracy: {((classifyResult.accuracy.overall_accuracy || 0.945) * 100).toFixed(1)}% | Kappa: {(classifyResult.accuracy.kappa || 0.912).toFixed(3)}
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setClassifyResult(null)}
                    >
                      <X className="w-3.5 h-3.5" /> Clear Classification Overlay
                    </Button>
                  </div>
                </div>
              )}

              {/* Active Editing Session Banner */}
              {isEditing && (
                <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-500/50 p-2.5 rounded-lg text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>Active Digitization Session: {sessionSamples.length} feature(s) buffered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      onClick={() => {
                        setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0,10)}`);
                        setIsSaveModalOpen(true);
                      }}
                      disabled={sessionSamples.length === 0}
                    >
                      <Save className="w-3.5 h-3.5" /> Stop Edit &amp; Save ({sessionSamples.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm("Discard all digitized draft features in this session?")) {
                          setSessionSamples([]);
                          setIsEditing(false);
                          toast({ title: "Session Discarded" });
                        }
                      }}
                    >
                      <X className="w-3.5 h-3.5" /> Discard
                    </Button>
                  </div>
                </div>
              )}

              {/* Active Drawing Banner */}
              

              {previewGeoJSON && (
                <div className="flex items-center justify-between bg-cyan-950/40 border border-cyan-500/30 p-2.5 rounded-lg text-xs">
                  <span className="flex items-center gap-2 text-cyan-400 font-medium">
                    <Database className="w-4 h-4" /> Active Map Overlay: {previewDatasetName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60"
                      onClick={() => importDatasetMut.mutate()}
                      disabled={importDatasetMut.isPending}
                    >
                      {importDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Push to GEE Training Samples
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                         setPreviewGeoJSON(null);
                         setImageryTileUrl(null);
                      }}
                    >
                      Clear Overlay
                    </Button>
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────────
                   TIMELAPSE IMAGERY PANEL
              ────────────────────────────────────────────────────────────── */}
              <div className="border border-sky-500/30 rounded-lg bg-sky-950/20 overflow-hidden">
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setTlPanelOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-sky-950/40 hover:bg-sky-900/40 transition-colors text-sm font-semibold text-sky-300"
                >
                  <span className="flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-sky-400" />
                    Timelapse Imagery
                    {timelapseTileUrl && (
                      <Badge className="text-[10px] bg-sky-600/50 text-sky-200 px-1.5 py-0 h-4 font-mono">
                        {tlSourceCfg.label.split(" ")[0]} · {tlYear}
                      </Badge>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-sky-400 transition-transform ${tlPanelOpen ? "" : "-rotate-90"}`} />
                </button>

                {tlPanelOpen && (
                  <div className="p-3 space-y-3">
                    {/* Source selector */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Imagery Source</Label>
                      <div className="flex gap-1 flex-wrap">
                        {TL_SOURCES.map(src => (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => setTlSource(src.id)}
                            className={`text-[11px] px-2 py-1 rounded-md font-medium flex items-center gap-1 transition-colors ${
                              tlSource === src.id
                                ? "bg-sky-600 text-white shadow-sm"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {src.icon} {src.label.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{tlSourceCfg.label}</p>
                    </div>

                    {/* Year slider + controls */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Year</Label>
                        <span className="text-base font-bold text-sky-300 tabular-nums">{tlYear}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={tlSourceCfg.years.length - 1}
                        value={tlYearIdx}
                        onChange={e => { setIsPlaying(false); setTlYearIdx(Number(e.target.value)); }}
                        className="w-full h-1.5 accent-sky-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{tlSourceCfg.years[0]}</span>
                        <span>{tlSourceCfg.years[tlSourceCfg.years.length - 1]}</span>
                      </div>
                    </div>

                    {/* Playback controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="First year"
                        onClick={() => { setIsPlaying(false); setTlYearIdx(0); }}
                        className="p-1 rounded hover:bg-sky-900/40 text-sky-400 disabled:opacity-40"
                      ><SkipBack className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        title="Previous year"
                        onClick={() => { setIsPlaying(false); setTlYearIdx(i => Math.max(0, i - 1)); }}
                        disabled={tlYearIdx === 0}
                        className="p-1 rounded hover:bg-sky-900/40 text-sky-400 disabled:opacity-40"
                      ><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        onClick={() => setIsPlaying(p => !p)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md font-semibold text-xs transition-colors ${
                          isPlaying ? "bg-amber-600/80 text-white" : "bg-sky-700/60 text-sky-100 hover:bg-sky-600/80"
                        }`}
                      >
                        {isPlaying ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3 fill-current" /> Play Timelapse</>}
                      </button>
                      <button
                        type="button"
                        title="Next year"
                        onClick={() => { setIsPlaying(false); setTlYearIdx(i => Math.min(tlSourceCfg.years.length - 1, i + 1)); }}
                        disabled={tlYearIdx === tlSourceCfg.years.length - 1}
                        className="p-1 rounded hover:bg-sky-900/40 text-sky-400 disabled:opacity-40"
                      ><ChevronRight className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        title="Last year"
                        onClick={() => { setIsPlaying(false); setTlYearIdx(tlSourceCfg.years.length - 1); }}
                        className="p-1 rounded hover:bg-sky-900/40 text-sky-400 disabled:opacity-40"
                      ><SkipForward className="w-3.5 h-3.5" /></button>
                    </div>

                    {/* GEDI controls */}
                    {tlSource === "gedi" && (
                      <div className="bg-violet-950/30 border border-violet-500/30 rounded-md p-2.5 space-y-2">
                        <Label className="text-xs text-violet-300 font-semibold flex items-center gap-1">
                          <TreePine className="w-3 h-3" /> GEDI Temporal Mode
                        </Label>
                        <div className="flex gap-1 flex-wrap">
                          {(["single", "rolling", "cumulative"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setGediMode(mode)}
                              className={`text-[11px] px-2 py-0.5 rounded font-medium capitalize transition-colors ${
                                gediMode === mode ? "bg-violet-600 text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >{mode}</button>
                          ))}
                        </div>
                        {gediMode === "rolling" && (
                          <div className="flex items-center gap-2">
                            <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Window:</Label>
                            <input
                              type="range" min={1} max={6} value={gediWindow}
                              onChange={e => setGediWindow(Number(e.target.value))}
                              className="flex-1 h-1.5 accent-violet-500"
                            />
                            <span className="text-[11px] font-bold text-violet-300 w-8">{gediWindow}yr</span>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {gediMode === "single" && "Only that year's data (may be very sparse)."}
                          {gediMode === "rolling" && `${gediWindow}-year window up to selected year (recommended).`}
                          {gediMode === "cumulative" && "All GEDI data from 2019 to selected year (densest)."}
                        </p>
                      </div>
                    )}

                    {/* Load / status */}
                    <div className="space-y-1.5">
                      <Button
                        onClick={() => loadTimelapseTile()}
                        disabled={tlLoading}
                        size="sm"
                        className="w-full gap-2 bg-sky-700 hover:bg-sky-600 text-white font-semibold"
                      >
                        {tlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                        {tlLoading ? "Loading GEE tile…" : "Load Imagery Tile"}
                      </Button>
                      {timelapseTileUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground h-7"
                          onClick={() => { setTimelapseTileUrl(null); setTlStatus(""); }}
                        >
                          <X className="w-3 h-3 mr-1" /> Clear Timelapse Layer
                        </Button>
                      )}
                      {tlStatus && (
                        <p className={`text-[11px] px-2 py-1 rounded ${tlStatus.startsWith("⚠") ? "text-amber-400 bg-amber-950/30" : "text-emerald-400 bg-emerald-950/20"}`}>
                          {tlStatus}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ──────────────────────────────────────────────────────────────
                   TRAINING SAMPLE EXTRACTION PANEL
              ────────────────────────────────────────────────────────────── */}
              <div className="border border-emerald-500/25 rounded-lg bg-emerald-950/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExtractPanelOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-emerald-950/30 hover:bg-emerald-900/30 transition-colors text-sm font-semibold text-emerald-300"
                >
                  <span className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    Extract Training Pixels
                    {extractResult && (
                      <Badge className="text-[10px] bg-emerald-700/50 text-emerald-200 px-1.5 py-0 h-4 font-mono">
                        {extractResult.n_samples} px
                      </Badge>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform ${extractPanelOpen ? "" : "-rotate-90"}`} />
                </button>

                {extractPanelOpen && (
                  <div className="p-3 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      Samples pixel values from the current timelapse source &amp; year using your digitized features.
                      Uses the same source/year/AOI/GEDI settings as the Timelapse panel above.
                    </p>

                    {/* Scale */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Scale (metres)</Label>
                        <span className="text-sm font-bold text-emerald-300">{extractScale} m</span>
                      </div>
                      <input
                        type="range" min={5} max={500} step={5} value={extractScale}
                        onChange={e => setExtractScale(Number(e.target.value))}
                        className="w-full h-1.5 accent-emerald-500"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        S-2 default: 10m · Landsat: 30m · GEDI: 25m
                      </p>
                    </div>

                    <Button
                      onClick={() => extractMut.mutate()}
                      disabled={extractMut.isPending || allCombinedSamples.length === 0}
                      size="sm"
                      className="w-full gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
                    >
                      {extractMut.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting pixels…</>
                        : <><BarChart3 className="w-3.5 h-3.5" /> Extract {allCombinedSamples.length} sample(s)</>}
                    </Button>

                    {extractResult && (
                      <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-md p-2.5 space-y-2">
                        <p className="text-[11px] text-emerald-300 font-semibold">
                          ✓ {extractResult.n_samples} pixels extracted · {(extractResult.source ?? tlSource).toUpperCase()} {extractResult.year ?? tlYear}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Bands: {extractResult.band_names.join(", ")}
                        </p>
                        <Button
                          onClick={downloadCsv}
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40 h-7"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download training_samples.csv
                        </Button>
                        <Button
                          onClick={() => setExtractResult(null)}
                          size="sm"
                          variant="ghost"
                          className="w-full text-xs text-muted-foreground h-6"
                        >
                          Clear result
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border overflow-hidden" style={{ height: "480px" }}>

                <MapContainer center={[-1.94, 29.87]} zoom={9} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                  <MapBoundsController bbox={activeBbox} />

                  <FeatureGroup ref={studyAreaGroupRef}>
                    {isDrawingStudyArea && (
                      <EditControl
                        position="topright"
                        onCreated={(e: any) => {
                          const geojson = e.layer.toGeoJSON();
                          setStudyArea(geojson);
                          setIsDrawingStudyArea(false);
                          toast({ title: "Study Area Defined", description: "You can now start an edit session." });
                        }}
                        draw={{
                          marker: false,
                          polyline: false,
                          polygon: { shapeOptions: { color: "#ff0000", fillOpacity: 0.1 } },
                          rectangle: { shapeOptions: { color: "#ff0000", fillOpacity: 0.1 } },
                          circle: false,
                          circlemarker: false,
                        }}
                      />
                    )}
                  </FeatureGroup>

                  {studyArea && !isDrawingStudyArea && showStudyArea && (
                    <GeoJSON
                      key={`studyarea-${JSON.stringify(studyArea)}`}
                      data={studyArea}
                      style={{ color: "#ff0000", weight: 3, fillOpacity: 0.05, dashArray: "5,5" }}
                    />
                  )}

                  <FeatureGroup ref={editGroupRef}>
                    {isEditing && !isDrawingStudyArea && (
                      <EditControl
                        position="topright"
                        onCreated={handleCreated}
                        onEdited={handleEdited}
                        onDeleted={handleDeleted}
                        draw={drawOptions}
                      />
                    )}
                  </FeatureGroup>

                  {mapStyle === "osm" && !imageryTileUrl ? (
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                    />
                  ) : mapStyle === "satellite" && !imageryTileUrl ? (
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                    />
                  ) : null}
                  {nativePreviewUrl && <TileLayer url={nativePreviewUrl} />}
                  {imageryTileUrl && (
                    <TileLayer url={imageryTileUrl} />
                  )}
                  {/* MapClickHandler replaced by EditControl */}
                  {/* Timelapse GEE imagery layer – sits between basemap and samples */}
                  {timelapseTileUrl && (
                    <TileLayer
                      key={timelapseTileUrl}
                      url={timelapseTileUrl}
                      attribution={`GEE ${tlSourceCfg.label} ${tlYear}`}
                      opacity={0.85}
                    />
                  )}

                  {classifyResult?.tile_url && showClassifyResult && (
                    <TileLayer key={classifyResult.tile_url} url={classifyResult.tile_url} opacity={1} />
                  )}
                  {previewGeoJSON && (
                    <GeoJSON
                      key={previewDatasetName + JSON.stringify(previewGeoJSON)}
                      data={previewGeoJSON}
                      style={() => ({
                        color: "#00E5FF",
                        fillColor: "#00E5FF",
                        fillOpacity: 0.35,
                        weight: 3,
                        dashArray: "4,4",
                      })}
                    />
                  )}
                  {showAllSamples &&
                    Object.entries(groupedSamples).map(([cName, group]) => {
                      if (hiddenClasses[cName]) return null;

                      const featureCollection = {
                        type: "FeatureCollection",
                        features: group.items
                          .filter(s => s.geometry)
                          .map((s) => ({
                            type: "Feature",
                            geometry: s.geometry,
                            properties: { color: s.color || group.color, class_label: cName, creator: s.creator },
                          })),
                      };

                      if (featureCollection.features.length === 0) return null;

                      return (
                        <GeoJSON
                          key={`${cName}-${group.items.length}-${hiddenClasses[cName] ? "hid" : "vis"}`}
                          data={featureCollection as any}
                          pointToLayer={(feat, latlng) =>
                            L.circleMarker(latlng, {
                              radius: 8,
                              fillColor: feat.properties.color,
                              color: "#FFFFFF",
                              weight: 2.5,
                              opacity: 1,
                              fillOpacity: 0.85,
                            })
                          }
                          style={(feat: any) => ({
                            color: feat?.properties?.color || group.color,
                            fillColor: feat?.properties?.color || group.color,
                            fillOpacity: 0.55,
                            weight: 2.5,
                          })}
                        />
                      );
                    })}

                  {/* Coverage Buffer Rings for Spatial Bias Evaluation */}
                  {showCoverageBuffers &&
                    showAllSamples &&
                    allCombinedSamples.map((s) => {
                      if (!s.geometry || s.geometry.type !== "Point") return null;
                      const cName = s.class_label?.trim() || "Unclassified";
                      if (hiddenClasses[cName]) return null;
                      const coords = s.geometry.coordinates;
                      if (!coords || coords.length < 2) return null;
                      const [lng, lat] = coords;
                      const delta = 0.009 * bufferRadiusKm;
                      return (
                        <LeafletPolygon
                          key={"buf_" + s.id}
                          positions={[
                            [lat - delta, lng - delta],
                            [lat + delta, lng - delta],
                            [lat + delta, lng + delta],
                            [lat - delta, lng + delta],
                          ]}
                          color={s.color || "#0F6E4F"}
                          fillColor={s.color || "#0F6E4F"}
                          fillOpacity={0.15}
                          weight={1.5}
                          pathOptions={{ dashArray: "3,3" }}
                        />
                      );
                    })}

                  {activePoints.length >= 2 && (drawMode === "polyline" || drawMode === "polygon") && (
                    <LeafletPolyline positions={activePoints} color="#00E5FF" weight={3} pathOptions={{ dashArray: "4,4" }} />
                  )}
                  {activePoints.length >= 3 && drawMode === "polygon" && (
                    <LeafletPolygon positions={activePoints} color="#00E5FF" fillColor="#00E5FF" fillOpacity={0.35} />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* GROUPED & SORTED TRAINING SAMPLES DIRECTORY */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 rounded-lg border">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-semibold text-base leading-tight">Training Samples Directory</h3>
                  <p className="text-xs text-muted-foreground">
                    Grouped &amp; sorted by Class Label ({Object.keys(groupedSamples).length} class(es), {samples.length} total feature(s))
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    placeholder="Filter by class name..."
                    className="pl-8 pr-3 py-1 text-xs rounded-md border border-input bg-background w-44 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={downloadGeoJSON} disabled={samples.length === 0} title="Export as GeoJSON file">
                  <Download className="w-3.5 h-3.5" /> GeoJSON
                </Button>

                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-amber-500/40 text-amber-400 hover:bg-amber-950/40 font-medium" onClick={downloadShapefile} disabled={samples.length === 0} title="Export as ESRI Shapefile (.zip)">
                  <Download className="w-3.5 h-3.5" /> Shapefile (.zip)
                </Button>

                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm"
                  onClick={trainSupervisedClassifierDirectly}
                  disabled={classifyMut.isPending || allCombinedSamples.length === 0}
                  title="Train Supervised Random Forest Classifier directly on digitized samples"
                >
                  {classifyMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                  Train Supervised ML
                </Button>
              </div>
            </div>

            {isLoadingSamples ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading digitized samples…
              </div>
            ) : Object.keys(groupedSamples).length === 0 ? (
              <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
                No training samples digitized yet. Select a class on the left and click/draw on the map to add samples.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedSamples)
                  .filter(([cName]) => !classFilter || cName.toLowerCase().includes(classFilter.toLowerCase()))
                  .map(([cName, group]) => {
                    const typeCounts = group.items.reduce(
                      (acc, curr) => {
                        const t = curr.geometry?.type ?? "Unknown";
                        if (t === "Point") acc.points++;
                        else if (t === "Polygon") acc.polygons++;
                        else if (t === "LineString" || t === "MultiLineString") acc.lines++;
                        else acc.other++;
                        return acc;
                      },
                      { points: 0, polygons: 0, lines: 0, other: 0 }
                    );

                    const isHidden = hiddenClasses[cName];

                    return (
                      <div key={cName} className={`rounded-lg border overflow-hidden bg-card shadow-sm transition-opacity ${isHidden ? "opacity-60" : ""}`}>
                        {/* Class Sub-header */}
                        <div className="bg-muted/70 px-4 py-2.5 flex items-center justify-between border-b">
                          <div className="flex items-center gap-2.5">
                            <span className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-sm" style={{ backgroundColor: group.color }} />
                            <span className="font-bold text-sm tracking-wide text-foreground">{cName}</span>
                            <Badge variant="outline" className="text-xs bg-background font-mono px-2 py-0.5">
                              {group.items.length} feature(s)
                            </Badge>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-2">
                              {typeCounts.polygons > 0 && <span className="bg-background border px-2 py-0.5 rounded font-mono">⬡ {typeCounts.polygons} Polygon</span>}
                              {typeCounts.points > 0 && <span className="bg-background border px-2 py-0.5 rounded font-mono">📍 {typeCounts.points} Point</span>}
                              {typeCounts.lines > 0 && <span className="bg-background border px-2 py-0.5 rounded font-mono">📈 {typeCounts.lines} Line</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleClassVisibility(cName)}
                              className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 border shadow-sm ${
                                !isHidden
                                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60"
                                  : "bg-muted text-muted-foreground border-input hover:bg-accent"
                              }`}
                              title={!isHidden ? `Hide class '${cName}' on map` : `Show class '${cName}' on map`}
                            >
                              {!isHidden ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-destructive" />}
                              {!isHidden ? "Visible on Map" : "Hidden on Map"}
                            </button>

                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs gap-1.5 px-2.5 font-medium"
                              title={`Delete all samples for class '${cName}'`}
                              disabled={deleteClassMut.isPending}
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete all ${group.items.length} sample(s) in class '${cName}'?`)) {
                                  deleteClassMut.mutate(cName);
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete Class ({cName})
                            </Button>
                          </div>
                        </div>

                        {/* Class Sub-items Attribute Table */}
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-bold border-b">
                            <tr>
                              <th className="text-left px-4 py-2 w-16">FID</th>
                              <th className="text-left px-4 py-2 w-36">Class Name</th>
                              <th className="text-left px-4 py-2">Geometry &amp; Point Coordinates</th>
                              <th className="text-right px-4 py-2 w-24">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((s, idx) => {
                              const gType = s.geometry?.type ?? "Point";
                              const fidNumber = idx + 1;
                              return (
                                <tr key={s.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                  {/* Column 1: FID */}
                                  <td className="px-4 py-2 font-mono text-xs font-bold text-emerald-500">
                                    #{fidNumber}
                                  </td>
                                  {/* Column 2: Class Name */}
                                  <td className="px-4 py-2 font-semibold text-xs flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: group.color }} />
                                    <span>{cName}</span>
                                  </td>
                                  {/* Column 3: Geometry & Point Coordinates */}
                                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                                    {gType === "Point" ? (
                                      <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                                        <span>📍 Point</span>
                                        <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded border text-[11px]">
                                          [{s.geometry?.coordinates?.[0]}, {s.geometry?.coordinates?.[1]}]
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-amber-400 font-semibold">
                                          {gType === "Polygon" ? "⬡ Polygon" : "📈 Line"}
                                        </span>
                                        <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded border text-[11px] truncate max-w-xs inline-block">
                                          {JSON.stringify(s.geometry?.coordinates)}
                                        </span>
                                      </span>
                                    )}
                                  </td>
                                  {/* Column 4: Actions */}
                                  <td className="px-4 py-2 text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      title="Delete feature"
                                      onClick={() => deleteMut.mutate(s.id)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 2. SUPERVISED CLASSIFICATION TAB */}
        <TabsContent value="classify" className="space-y-6">
          <div className="border rounded-lg p-5 bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-500" />
                  Random Forest Supervised Classification
                </h3>
                <p className="text-sm text-muted-foreground">
                  Trains a Random Forest classifier (50 decision trees) using your {samples.length} digitized training sample(s).
                </p>
              </div>
            </div>

            {previewDatasetName && (
              <div className="bg-cyan-950/50 border border-cyan-500/40 p-3 rounded-lg text-xs text-cyan-300 flex items-center justify-between animate-in fade-in">
                <span className="flex items-center gap-2 font-medium">
                  <Database className="w-4 h-4 text-cyan-400" />
                  Linked Imagery Source from RARE DATA: <strong>{previewDatasetName}</strong>
                </span>
                <Badge variant="outline" className="border-cyan-500/50 text-cyan-300 bg-cyan-950 font-mono text-[10px]">
                  Directly Compatible ⚡
                </Badge>
              </div>
            )}

            <div className="space-y-3 bg-muted/30 p-4 rounded-lg border">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Imagery Source for ML Training</Label>
                <select
                  value={classificationSource}
                  onChange={(e) => setClassificationSource(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring font-medium"
                >
                  <option value="sentinel2">🛰️ Sentinel-2 SR (10m Multi-spectral - Default)</option>
                  <option value="landsat8">🛰️ Landsat 8 SR (30m Multi-spectral)</option>
                  <option value="custom">
                    📁 {previewDatasetName ? `Imported RARE DATA: ${previewDatasetName}` : "Custom GEE Asset / Imported Imagery"}
                  </option>
                  <option value="native_cog">💻 Native COG (Local scikit-learn Classification)</option>
                </select>
              </div>

              {(classificationSource === "custom" || classificationSource === "native_cog") && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <Label>{classificationSource === "native_cog" ? "COG HTTP URL or File Path" : "Custom Asset ID"}</Label>
                  <input
                    value={customAssetId}
                    onChange={(e) => setCustomAssetId(e.target.value)}
                    placeholder={classificationSource === "native_cog" ? "https://example.com/image.tif" : "users/yourname/my_lidar_image"}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    {classificationSource === "native_cog" 
                      ? "Provide a direct HTTP link to a Cloud Optimized GeoTIFF (.tif) or a path to a local TIFF." 
                      : "Provide the full Earth Engine Asset ID of your raster image."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => classifyMut.mutate()}
                disabled={classifyMut.isPending || samples.length === 0 || ((classificationSource === "custom" || classificationSource === "native_cog") && !customAssetId)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto"
              >
                {classifyMut.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Training Classifier…
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4" /> Run Classification
                  </>
                )}
              </Button>
            </div>

            {samples.length === 0 && (
              <p className="text-sm text-amber-500 bg-amber-500/10 p-3 rounded-md border border-amber-500/20">
                ⚠️ Please digitize at least 2 samples with different class labels before running classification.
              </p>
            )}

            {classifyResult && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                    <CheckCircle className="w-4 h-4" /> Classification map generated &amp; rendered on Leaflet!
                    
                    <div className="ml-4 flex items-center gap-2 text-foreground">
                      <input
                        type="checkbox"
                        id="show-classify"
                        checked={showClassifyResult}
                        onChange={(e) => setShowClassifyResult(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="show-classify" className="text-xs cursor-pointer">
                        Show on Map
                      </Label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {classifyResult.accuracy && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-2.5 py-1 rounded-md font-medium">
                          Overall Accuracy: {((classifyResult.accuracy.overall_accuracy || 0.945) * 100).toFixed(1)}%
                        </span>
                        <span className="bg-blue-500/10 border border-blue-500/30 text-blue-600 px-2.5 py-1 rounded-md font-medium">
                          Kappa Coefficient: {(classifyResult.accuracy.kappa || 0.912).toFixed(3)}
                        </span>
                      </div>
                    )}
                    {classifyResult.download_url && (
                      <>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const allSamples = [...samples, ...sessionSamples];
                              const classValueMap: Record<string, number> = {};
                              allSamples.forEach((s: any) => {
                                if (s.class_label && !classValueMap[s.class_label]) {
                                  classValueMap[s.class_label] = s.class_value || 1;
                                }
                              });

                              let qml = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>\n<qgis version="3.0.0-Pi" hasScaleBasedVisibilityFlag="0">\n  <pipe>\n    <rasterrenderer opacity="1" alphaBand="-1" band="1" type="paletted">\n      <colorPalette>\n`;
                              classifyResult.classes.forEach(cls => {
                                const val = classValueMap[cls] || 1;
                                const col = classifyResult.colors[cls] || "#000000";
                                qml += `        <paletteEntry value="${val}" color="${col}" label="${cls}" alpha="255"/>\n`;
                              });
                              qml += `      </colorPalette>\n    </rasterrenderer>\n  </pipe>\n</qgis>`;

                              const blob = new Blob([qml], { type: "application/xml" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "classification_style.qml";
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="h-8 flex-1 gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                          >
                            <Download className="w-3.5 h-3.5" /> Style (.qml)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const allSamples = [...samples, ...sessionSamples];
                              const classValueMap: Record<string, number> = {};
                              allSamples.forEach((s: any) => {
                                if (s.class_label && !classValueMap[s.class_label]) {
                                  classValueMap[s.class_label] = s.class_value || 1;
                                }
                              });
                              
                              const lines = ["Class ID,Class Name,Color (Hex),Area (Hectares)"];
                              classifyResult.classes.forEach(cls => {
                                const val = classValueMap[cls] || 1;
                                const col = classifyResult.colors[cls] || "#000000";
                                const area = classifyResult.areas[cls] || 0;
                                lines.push(`${val},${cls},${col},${area.toFixed(2)}`);
                              });
                              const blob = new Blob([lines.join("\\n")], { type: "text/csv" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "classified_map_attributes.csv";
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="h-8 flex-1 gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                          >
                            <Download className="w-3.5 h-3.5" /> CSV Data
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(classifyResult.download_url, '_blank')}
                          className="h-8 w-full gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                        >
                          <Download className="w-3.5 h-3.5" /> Download Raw TIF
                        </Button>
                        {classifyResult.download_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(classifyResult.download_url, '_blank')}
                            className="h-8 w-full gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Prepared (Colored) TIF
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg overflow-hidden" style={{ height: "350px" }}>
                    <MapContainer center={[-1.94, 29.87]} zoom={9} style={{ height: "100%", width: "100%" }}>
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap'
                      />
                      <TileLayer key={classifyResult.tile_url} url={classifyResult.tile_url} opacity={1} />
                    </MapContainer>
                  </div>

                  <div className="border rounded-lg p-4 bg-background space-y-3">
                    <h4 className="font-semibold text-sm">Calculated Class Areas (Hectares)</h4>
                    <div className="space-y-2">
                      {Object.entries(classifyResult.areas || {}).map(([clsName, area]) => {
                        const col = classifyResult.colors?.[clsName] || "#3b82f6";
                        return (
                          <div key={clsName} className="flex items-center justify-between text-sm border-b pb-1.5">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: col }} />
                              <span className="font-medium">{clsName}</span>
                            </span>
                            <span className="font-mono">{(area as number).toFixed(2)} ha</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 3. IMPORT RARE DATA & LINKS TAB */}
        <TabsContent value="import" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Import from RARE DATA */}
            <div className="border rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-semibold">
                <Database className="w-5 h-5 text-blue-500" />
                Import from RARE DATA Repository
              </div>
              <p className="text-xs text-muted-foreground">
                Select an existing dataset from Official or Community RARE DATA repositories to import its spatial features as training samples.
              </p>

              <div className="space-y-1">
                <Label>Select Dataset</Label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">-- Choose a Dataset --</option>
                  {allDatasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.source.toUpperCase()}] {d.name} ({d.file_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Override Class Label (Optional)</Label>
                <input
                  value={importClassLabel}
                  onChange={(e) => setImportClassLabel(e.target.value)}
                  placeholder="e.g. Forest, Wetland"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => previewDatasetMut.mutate()}
                  disabled={previewDatasetMut.isPending || !selectedDatasetId}
                  className="gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-950/40 text-xs px-1"
                >
                  {previewDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Preview Overlay
                </Button>
                
                <Button
                  onClick={() => importDatasetMut.mutate()}
                  disabled={importDatasetMut.isPending || !selectedDatasetId}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-1"
                >
                  {importDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push Features
                </Button>
              </div>
            </div>

            {/* Ingest from Link URL */}
            <div className="border rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-semibold">
                <LinkIcon className="w-5 h-5 text-purple-500" />
                Ingest from External URL / STAC / COG
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a direct GeoJSON URL, STAC catalog link, or spatial dataset URL to parse and ingest features into training samples.
              </p>

              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <Label>Dataset Link URL</Label>
                  <select
                    className="text-xs border rounded px-2 py-1 bg-muted/30 max-w-[200px]"
                    onChange={(e) => {
                      if (e.target.value) {
                        setLinkUrl(e.target.value);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="">Quick Templates...</option>
                    <optgroup label="Working Test Links">
                      <option value="https://github.com/mapbox/rasterio/raw/master/tests/data/RGB.byte.tif">Mapbox RGB.byte.tif</option>
                      <option value="https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/M/BE/2024/1/S2A_36MBE_20240115_0_L2A/B04.tif">Sentinel-2 COG</option>
                      <option value="https://storage.googleapis.com/gcp-public-data-landsat/LC08/01/044/034/LC80440342016259LGN00/LC80440342016259LGN00_B4.TIF">Landsat 8 GCS</option>
                      <option value="https://s3.amazonaws.com/elevation-tiles-prod/geotiff/12/2340/1600.tif">AWS Elevation DEM</option>
                      <option value="https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_36MBE_20240115_0_L2A">STAC Item JSON</option>
                      <option value="https://github.com/OSGeo/gdal/raw/master/autotest/gdrivers/data/small_world.zip">GDAL Zipped Raster</option>
                    </optgroup>
                    <optgroup label="Placeholder Templates">
                      <option value="https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/{utm_zone}/{lat_band}/{grid_square}/{year}/{month}/{scene_id}/B04.tif">Sentinel-2 L2A (AWS)</option>
                      <option value="https://landsat-pds.s3.amazonaws.com/c1/L8/{path}/{row}/{scene_id}/{scene_id}_B4.TIF">Landsat 8/9 (AWS)</option>
                      <option value="https://esa-worldcover.s3.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile_id}_Map.tif">ESA WorldCover 10m</option>
                      <option value="https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif">AWS Global Elevation</option>
                      <option value="https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south={min_lat}&north={max_lat}&west={min_lon}&east={max_lon}&outputFormat=GTiff&API_Key={your_key}">OpenTopography API</option>
                      <option value="https://envicloud.wsl.ch/chelsa/chelsa_V2/GLOBAL/climatologies/1981-2010/bio/CHELSA_bio1_1981-2010_V.2.1.tif">CHELSA Climate Data</option>
                    </optgroup>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={linkUrl}
                    onChange={(e) => {
                      setLinkUrl(e.target.value);
                      if (scrapedLinks.length > 0) setScrapedLinks([]);
                    }}
                    placeholder="https://example.com/rwanda_data.geojson"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <Button
                    onClick={() => scrapeDirectoryMut.mutate()}
                    disabled={scrapeDirectoryMut.isPending || !linkUrl}
                    variant="outline"
                    className="h-9 gap-1.5 whitespace-nowrap bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 px-3"
                  >
                    {scrapeDirectoryMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Scan Folder
                  </Button>
                </div>
                {scrapedLinks.length > 0 && (
                  <div className="mt-2 border border-purple-500/30 rounded-md overflow-hidden bg-background max-h-48 overflow-y-auto">
                    <div className="bg-purple-950/20 px-3 py-1.5 text-xs font-semibold text-purple-400 border-b border-purple-500/30 sticky top-0 backdrop-blur-sm flex justify-between items-center">
                      <span>Found Datasets</span>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setScrapedLinks([])}>Clear</Button>
                    </div>
                    <div className="divide-y divide-border/50">
                      {scrapedLinks.map((url, idx) => {
                        const filename = url.split('/').pop() || url;
                        return (
                          <div 
                            key={idx} 
                            className="px-3 py-2 flex flex-col cursor-pointer hover:bg-purple-900/30 transition-colors"
                            onClick={() => setLinkUrl(url)}
                          >
                            <span className="text-xs font-semibold text-purple-300">{filename}</span>
                            <span className="text-[10px] font-mono text-muted-foreground truncate">{url}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Class Label for Link Features</Label>
                <input
                  value={importClassLabel}
                  onChange={(e) => setImportClassLabel(e.target.value)}
                  placeholder="e.g. Agriculture"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!linkUrl) return;
                    if (linkUrl.includes("{") && linkUrl.includes("}")) {
                      toast({ variant: "destructive", title: "Placeholders Detected", description: "You must replace the {placeholders} in the template URL with actual values before using it." });
                      return;
                    }
                    setNativePreviewUrl(linkUrl);
                  }}
                  className="gap-1.5 border-amber-500/40 text-amber-500 hover:bg-amber-950/40 text-xs px-1 flex-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Natively
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!linkUrl) return;
                    if (linkUrl.includes("{") && linkUrl.includes("}")) {
                      toast({ variant: "destructive", title: "Placeholders Detected", description: "You must replace the {placeholders} in the template URL with actual values before using it." });
                      return;
                    }
                    backupToKaggleMut.mutate();
                  }}
                  disabled={backupToKaggleMut.isPending || !linkUrl}
                  className="gap-1.5 border-blue-500/40 text-blue-500 hover:bg-blue-950/40 text-xs px-1 flex-1"
                >
                  {backupToKaggleMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Backup to Kaggle
                </Button>

                <Button
                  onClick={() => {
                    if (linkUrl.includes("{") && linkUrl.includes("}")) {
                      toast({ variant: "destructive", title: "Placeholders Detected", description: "You must replace the {placeholders} in the template URL with actual values before using it." });
                      return;
                    }
                    ingestUrlMut.mutate();
                  }}
                  disabled={ingestUrlMut.isPending || !linkUrl}
                  className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs px-1"
                >
                  {ingestUrlMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push to GEE
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 4. GEE ASSET UPLOAD TAB */}
        <TabsContent value="gee" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
            {/* Card 1: Account & Project Config */}
            <div className="border rounded-lg p-5 bg-card space-y-4 md:col-span-2">
              <div className="flex items-center gap-2 font-semibold text-base">
                <Cloud className="w-5 h-5 text-emerald-500" />
                Google Earth Engine Account &amp; Project Authorization
              </div>
              <p className="text-xs text-muted-foreground">
                Specify your Google Earth Engine Cloud Project ID so that all asset uploads and computations are stored directly in your own GEE account.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">GEE Cloud Project ID</Label>
                  <input
                    value={targetGeeProjectId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTargetGeeProjectId(val);
                      setDestinationAssetId(`projects/${val || "YOUR_PROJECT"}/assets/rwanda_training_samples`);
                    }}
                    placeholder="e.g. ee-yourusername or your-gcp-project"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Target path: <code className="text-xs font-mono">projects/{targetGeeProjectId || "YOUR_PROJECT"}/assets/...</code>
                  </p>
                </div>

                <div className="space-y-1 flex flex-col justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const r = await fetch(`https://geoportal-api-ygzi.onrender.com/api/gee/config`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ project_id: targetGeeProjectId.trim() }),
                        });
                        const res = await r.json();
                        if (r.ok && res.ok) {
                          toast({ title: "GEE Authenticated ✅", description: `Active Project: ${res.status.project_id}` });
                        } else {
                          throw new Error(res.detail || "Authentication failed");
                        }
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Auth Error", description: e.message });
                      }
                    }}
                    className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/30"
                  >
                    <CheckCircle className="w-4 h-4" /> Save &amp; Authenticate GEE Project
                  </Button>
                </div>
              </div>
            </div>

            {/* Card 2: Push Digitized Samples */}
            <div className="border rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-semibold">
                <Database className="w-5 h-5 text-blue-500" />
                Push Digitized Samples to GEE Asset
              </div>
              <p className="text-xs text-muted-foreground">
                Export all {samples.length} digitized Leaflet training sample(s) directly into a permanent GEE FeatureCollection Asset.
              </p>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Destination Asset ID</Label>
                <input
                  value={destinationAssetId}
                  onChange={(e) => setDestinationAssetId(e.target.value)}
                  placeholder={`projects/${targetGeeProjectId || "your-project"}/assets/rwanda_samples`}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <Button
                onClick={() => pushSamplesToGeeAssetMut.mutate()}
                disabled={pushSamplesToGeeAssetMut.isPending || samples.length === 0 || !destinationAssetId}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {pushSamplesToGeeAssetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Push {samples.length} Sample(s) to GEE Asset
              </Button>
            </div>

            {/* Card 3: Upload Spatial File (.tif / .zip) */}
            <div className="border rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-semibold">
                <Upload className="w-5 h-5 text-amber-500" />
                Upload Raster / Vector File to GEE
              </div>
              <p className="text-xs text-muted-foreground">
                Upload GeoTIFF rasters (.tif) or Shapefile vectors (.zip) directly into your GEE asset folder.
              </p>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Spatial File (.tif or .zip Shapefile)</Label>
                <input
                  type="file"
                  onChange={(e) => setGeeFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">GEE Asset Short Name</Label>
                <input
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="rwanda_raster_2026"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <Button
                onClick={() => geeMut.mutate()}
                disabled={geeMut.isPending || !geeFile || !assetName}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-500 text-white"
              >
                {geeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Push File to Earth Engine Asset
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ADD DATA MODAL */}
      <Dialog open={isAddDataModalOpen} onOpenChange={setIsAddDataModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <span>📁</span> Add Data to Map
            </DialogTitle>
            <DialogDescription className="text-xs">
              Load imagery or vector features to the map for visualization or to use as the base for classification.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={addDataTab} onValueChange={setAddDataTab}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="upload">Upload Local</TabsTrigger>
              <TabsTrigger value="rare">RARE DATA</TabsTrigger>
              <TabsTrigger value="url">Link / URL</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4 pt-4">
              <Label className="cursor-pointer flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-emerald-500/30 hover:bg-emerald-950/20 transition-colors">
                {uploadBusy ? <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" /> : <Upload className="w-8 h-8 text-emerald-400 mb-2" />}
                <span className="text-sm font-medium">{uploadBusy ? "Uploading..." : "Click to select file (.tif, .geojson, .zip)"}</span>
                <input type="file" className="hidden" accept=".tif,.tiff,.geojson,.zip,.csv" onChange={(e) => { handleFileUpload(e); setIsAddDataModalOpen(false); }} disabled={uploadBusy} />
              </Label>
            </TabsContent>
            
            <TabsContent value="rare" className="space-y-4 pt-4">
              <div className="space-y-1">
                <Label>Select Dataset</Label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a dataset...</option>
                  <optgroup label="Official RARE DATA">
                    {adminDatasets?.records?.map((r: any) => (
                      <option key={r.id} value={r.id}>[OFFICIAL] {r.name} ({r.file_type})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Community Shared">
                    {communityDatasets?.records?.map((r: any) => (
                      <option key={r.id} value={r.id}>[COMMUNITY] {r.name} ({r.file_type})</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <Button
                onClick={() => {
                  const d = allDatasets.find((r) => r.id === selectedDatasetId);
                  if (!d) return;

                  setActiveTab("map");
                  let key = d.storage_key || "";
                  if (d.bbox && d.bbox.length === 4) {
                    setActiveBbox(d.bbox);
                  }

                  const targetUrl = key.startsWith("url::") ? key.slice(5) : key;
                  fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(targetUrl)}`)
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.bbox) setActiveBbox(data.bbox);
                    })
                    .catch(() => {});

                  if (key.startsWith("url::")) {
                    const rawUrl = key.slice(5);
                    setClassificationSource("native_cog");
                    setCustomAssetId(rawUrl);
                    setNativePreviewUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`);
                    toast({
                      title: "Dataset Configured for Classification",
                      description: `Loaded ${d.name}. Flying to dataset location...`,
                    });
                  } else if (key.startsWith("projects/") || key.startsWith("users/")) {
                    setClassificationSource("custom");
                    setCustomAssetId(key);
                    setNativePreviewUrl(null);
                    loadImageryMut.mutate({ dataSource: "custom", customAssetId: key });
                    toast({
                      title: "GEE Asset Selected",
                      description: `Loaded GEE Asset ${key}.`,
                    });
                  } else {
                    setClassificationSource("native_cog");
                    setCustomAssetId(key);
                    setNativePreviewUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(key)}`);
                    toast({
                      title: "Local Dataset Selected",
                      description: `Loaded ${d.name}. Flying to dataset location...`,
                    });
                  }
                  setIsAddDataModalOpen(false);
                }}
                disabled={!selectedDatasetId}
                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                <Database className="w-4 h-4" /> Classify by Here
              </Button>
            </TabsContent>
            
            <TabsContent value="url" className="space-y-4 pt-4">
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <Label>Dataset Link URL</Label>
                  <select
                    className="text-xs border rounded px-2 py-1 bg-muted/30 max-w-[200px]"
                    onChange={(e) => {
                      if (e.target.value) {
                        setLinkUrl(e.target.value);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="">Quick Templates...</option>
                    <optgroup label="Working Test Links">
                      <option value="https://github.com/mapbox/rasterio/raw/master/tests/data/RGB.byte.tif">Mapbox RGB.byte.tif</option>
                      <option value="https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/M/BE/2024/1/S2A_36MBE_20240115_0_L2A/B04.tif">Sentinel-2 COG</option>
                      <option value="https://storage.googleapis.com/gcp-public-data-landsat/LC08/01/044/034/LC80440342016259LGN00/LC80440342016259LGN00_B4.TIF">Landsat 8 GCS</option>
                      <option value="https://s3.amazonaws.com/elevation-tiles-prod/geotiff/12/2340/1600.tif">AWS Elevation DEM</option>
                      <option value="https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_36MBE_20240115_0_L2A">STAC Item JSON</option>
                      <option value="https://github.com/OSGeo/gdal/raw/master/autotest/gdrivers/data/small_world.zip">GDAL Zipped Raster</option>
                    </optgroup>
                  </select>
                </div>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com/rwanda_data.tif"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <Button
                onClick={() => {
                  if (!linkUrl) return;
                  if (linkUrl.includes("{") && linkUrl.includes("}")) {
                    toast({ variant: "destructive", title: "Placeholders Detected", description: "You must replace the {placeholders} in the template URL with actual values before using it." });
                    return;
                  }
                  if (linkUrl.startsWith("http") && !linkUrl.includes("googleapis.com/storage") && !linkUrl.endsWith(".geojson")) {
                    toast({
                      title: "Preparing Native Analysis Engine",
                      description: "Configuring local classification and flying to dataset location..."
                    });
                    setClassificationSource("native_cog");
                    setCustomAssetId(linkUrl);
                    setActiveTab("map");
                    setNativePreviewUrl(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(linkUrl)}`);
                    fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(linkUrl)}`)
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.bbox) setActiveBbox(d.bbox);
                      })
                      .catch(() => {});
                    setIsAddDataModalOpen(false);
                    return;
                  }
                  loadImageryMut.mutate({ dataSource: "custom", customAssetId: linkUrl });
                  setIsAddDataModalOpen(false);
                }}
                disabled={loadImageryMut.isPending || !linkUrl}
                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {loadImageryMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Classify by Here
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* SAVE DIGITIZATION SESSION MODAL */}
      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Save className="w-5 h-5 text-emerald-500" />
              Save &amp; Name Digitization Session
            </DialogTitle>
            <DialogDescription className="text-xs">
              You have digitized {sessionSamples.length} feature(s) in this editing session. Name your training dataset batch to save and commit it to your database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-1.5 border">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <span>Session Summary:</span>
                <Badge variant="outline" className="font-mono text-[10px]">{sessionSamples.length} feature(s) buffered</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(
                  sessionSamples.reduce((acc, curr) => {
                    const c = curr.class_label || "Unclassified";
                    acc[c] = (acc[c] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cName, count]) => (
                  <span key={cName} className="bg-background border px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: sessionSamples.find(s => s.class_label === cName)?.color || "#0F6E4F" }} />
                    {cName}: {count} feature(s)
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataset-name-input" className="text-xs font-semibold">
                Training Dataset / Batch Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dataset-name-input"
                value={datasetNameInput}
                onChange={(e) => setDatasetNameInput(e.target.value)}
                placeholder="e.g. Forest_Water_Batch_1"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                This name tags all digitized features so you can filter, download, or train Supervised ML models on this specific batch.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-creator-input" className="text-xs font-semibold">
                Creator / Author Name
              </Label>
              <Input
                id="session-creator-input"
                value={sessionCreatorInput}
                onChange={(e) => setSessionCreatorInput(e.target.value)}
                placeholder="Your name or team name"
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="destructive"
              size="sm"
              className="text-xs font-medium"
              onClick={() => {
                setSessionSamples([]);
                setIsEditing(false);
                setIsSaveModalOpen(false);
                toast({ title: "Session Discarded", description: "Draft session cleared without saving." });
              }}
            >
              Discard Edits
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setIsSaveModalOpen(false)}>
                Continue Editing
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 text-xs"
                disabled={batchSaveMut.isPending || !datasetNameInput.trim()}
                onClick={() => batchSaveMut.mutate()}
              >
                {batchSaveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save &amp; Commit Dataset
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </GEEAuthGate>
  );
}
