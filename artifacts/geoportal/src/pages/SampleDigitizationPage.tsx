import L from "leaflet";
if (typeof window !== "undefined") {
  (window as any).type = undefined;
}
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
  AlertTriangle,
  Sparkles,
  Lock,
  Crosshair,
  Eye,
  EyeOff,
  Target,
  Compass,
  Cloud,
  MapPin,
  Maximize2,
  Minimize2,
  FileText,
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
  ChevronUp,
  LogOut,
  XCircle,
  RotateCcw,
  Info,
  Palette,
  Share2,
  Copy,
  Table,
  Hand,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MapContainer, TileLayer, GeoJSON, Polyline as LeafletPolyline, Polygon as LeafletPolygon, useMapEvents, useMap, FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import * as turf from "@turf/turf";
import { api } from "@/lib/api";
import { DatasetRecord, BASE, getGeeToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { NativeRasterLayer } from "@/components/NativeRasterLayer";
import { DatasetHarvester } from "@/components/DatasetHarvester";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend } from "recharts";
import { useAuth } from "@/hooks/use-auth";

// Refined, professional minimalist cartographic palette (ESA WorldCover & USGS standards)
const LAND_COVER_PRESETS = [
  { name: "Built-up", color: "#e06c75" },
  { name: "Vegetation", color: "#10b981" },
  { name: "Water", color: "#38bdf8" },
  { name: "Forest", color: "#059669" },
  { name: "Dense Forest", color: "#047857" },
  { name: "Cropland", color: "#f59e0b" },
  { name: "Grass", color: "#84cc16" },
  { name: "Shrubland", color: "#b45309" },
  { name: "Bare Land", color: "#d4a373" },
  { name: "Swamp", color: "#0d9488" },
  { name: "Permanent Water", color: "#2563eb" },
  { name: "Rural Settlement", color: "#f97316" },
  { name: "Dense Urban", color: "#be123c" },
  { name: "Mangrove", color: "#065f46" },
  { name: "Savanna Woodland", color: "#65a30d" },
  { name: "Rocks", color: "#78716c" },
  { name: "Floodplain", color: "#0ea5e9" },
  { name: "Aquatic Vegetation", color: "#14b8a6" },
  { name: "Plantation Crops", color: "#4ade80" }
];

const AMATEUR_COLOR_MAP: Record<string, string> = {
  "#ff0000": "#e06c75",
  "#00ff00": "#10b981",
  "#0000ff": "#38bdf8",
  "#ffff00": "#f59e0b",
  "#800080": "#0d9488",
  "#ffa500": "#f97316",
  "#7cfc00": "#84cc16",
  "#8b0000": "#be123c",
  "#00e5ff": "#38bdf8",
  "#8b4513": "#78716c",
  "#006400": "#059669",
  "#228b22": "#047857",
  "#004d00": "#065f46",
  "#4169e1": "#2563eb",
  "#87ceeb": "#0ea5e9",
  "#20b2aa": "#14b8a6",
  "#9acd32": "#4ade80",
};

const getRefinedColor = (rawColor?: string, label?: string): string => {
  if (label) {
    const preset = LAND_COVER_PRESETS.find(p => p.name.toLowerCase() === label.trim().toLowerCase());
    if (preset) return preset.color;
  }
  if (!rawColor) return "#10b981";
  const lower = rawColor.toLowerCase();
  return AMATEUR_COLOR_MAP[lower] || rawColor;
};

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

function MapInstanceCapturer({ onMapInstance }: { onMapInstance: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    if (map) onMapInstance(map);
  }, [map, onMapInstance]);
  return null;
}

const STUDY_AREA_PRESETS = [
  {
    id: "rwanda_national",
    name: "Rwanda (National Boundary)",
    desc: "National territory extent (~26,338 km²)",
    bbox: [28.86, -2.84, 30.90, -1.05],
  },
  {
    id: "kigali_metro",
    name: "Kigali Metropolitan Region",
    desc: "Capital city & surrounding sectors (~730 km²)",
    bbox: [29.98, -2.05, 30.18, -1.88],
  },
  {
    id: "lake_kivu",
    name: "Lake Kivu Riparian Basin",
    desc: "Western aquatic & coastal agricultural zone",
    bbox: [29.15, -2.45, 29.45, -1.65],
  },
  {
    id: "musanze_volcanoes",
    name: "Musanze & Volcanoes National Park",
    desc: "Northern volcanic forest & high-altitude farms",
    bbox: [29.45, -1.55, 29.75, -1.35],
  },
  {
    id: "bugesera_agriculture",
    name: "Bugesera Agricultural District",
    desc: "Eastern savannah lake system & farming belt",
    bbox: [30.05, -2.40, 30.35, -2.15],
  },
];

const normalizeToFeatureCollection = (data: any): any => {
  if (!data) return null;
  if (Array.isArray(data)) {
    const allFeatures: any[] = [];
    for (const item of data) {
      if (item?.features) allFeatures.push(...item.features);
      else if (item?.geometry) allFeatures.push(item);
    }
    return { type: "FeatureCollection", features: allFeatures };
  }
  if (data.type === "FeatureCollection") return data;
  if (data.type === "Feature") return { type: "FeatureCollection", features: [data] };
  if (data.type === "Polygon" || data.type === "MultiPolygon") {
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: data, properties: {} }] };
  }
  return data;
};

const validateWithinStudyArea = (studyAreaObj: any, featureGeoJson: any): boolean => {
  if (!studyAreaObj) return true;
  try {
    const normalizedAoi = normalizeToFeatureCollection(studyAreaObj);
    if (!normalizedAoi || !normalizedAoi.features || normalizedAoi.features.length === 0) {
      return true;
    }
    const aoiBbox = turf.bbox(normalizedAoi);
    const featBbox = turf.bbox(featureGeoJson);
    
    // Quick outer bbox rejection
    if (
      featBbox[0] > aoiBbox[2] ||
      featBbox[2] < aoiBbox[0] ||
      featBbox[1] > aoiBbox[3] ||
      featBbox[3] < aoiBbox[1]
    ) {
      return false;
    }

    const geomType = featureGeoJson.geometry?.type || featureGeoJson.type;
    const geomCoords = featureGeoJson.geometry?.coordinates || featureGeoJson.coordinates;

    if (geomType === "Point" && geomCoords) {
      const pt = turf.point(geomCoords);
      for (const poly of normalizedAoi.features) {
        try {
          if (turf.booleanPointInPolygon(pt, poly)) return true;
        } catch {}
      }
      for (const poly of normalizedAoi.features) {
        try {
          if (turf.booleanIntersects(poly, pt)) return true;
        } catch {}
      }
    } else {
      for (const poly of normalizedAoi.features) {
        try {
          if (turf.booleanIntersects(poly, featureGeoJson)) return true;
        } catch {}
      }
    }
    return true;
  } catch (err) {
    console.warn("Turf spatial check fallback", err);
    return true;
  }
};

export function SampleDigitizationPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

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
  const [nativePreviewUrl, setNativePreviewUrl] = useState<string | null>(null);
  const [nativePreviewName, setNativePreviewName] = useState<string>("");
  const [activeTab, setActiveTab] = useState("map");
  const [activeBbox, setActiveBbox] = useState<number[] | null>(null);
  const [showClassifyResult, setShowClassifyResult] = useState(true);

  // Safety fallback: if not admin and on admin tab, switch to map
  useEffect(() => {
    if (!isAdmin && (activeTab === "import" || activeTab === "gee")) {
      setActiveTab("map");
    }
  }, [isAdmin, activeTab]);

  // Drawing & Grouped Table state
  const [drawMode, setDrawMode] = useState<"point" | "polyline" | "polygon" | "rectangle" | "circle" | "pan">("point");
  const [pendingFeature, setPendingFeature] = useState<{ layer: any; type: string } | null>(null);
  const editGroupRef = useRef<any>(null);
  const [isDrawToolFolded, setIsDrawToolFolded] = useState(() => {
    try {
      const saved = localStorage.getItem("geoportal_drawToolFolded");
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("geoportal_drawToolFolded", JSON.stringify(isDrawToolFolded));
  }, [isDrawToolFolded]);

  const [isMapLayerFolded, setIsMapLayerFolded] = useState(() => {
    try {
      const saved = localStorage.getItem("geoportal_mapLayerFolded");
      return saved !== null ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  useEffect(() => {
    localStorage.setItem("geoportal_mapLayerFolded", JSON.stringify(isMapLayerFolded));
  }, [isMapLayerFolded]);

  const [isRightPanelsFolded, setIsRightPanelsFolded] = useState(() => {
    try {
      const saved = localStorage.getItem("geoportal_rightPanelsFolded");
      return saved !== null ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  useEffect(() => {
    localStorage.setItem("geoportal_rightPanelsFolded", JSON.stringify(isRightPanelsFolded));
  }, [isRightPanelsFolded]);

  // Session & Study Area State
  const [isEditing, setIsEditing] = useState(false);
  const [studyArea, setStudyArea] = useState<any>(null); // GeoJSON
  const [showStudyArea, setShowStudyArea] = useState(true);
  const [isDrawingStudyArea, setIsDrawingStudyArea] = useState(false);
  const [aoiDrawShape, setAoiDrawShape] = useState<"rectangle" | "polygon">("rectangle");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isStudyAreaModalOpen, setIsStudyAreaModalOpen] = useState(false);
  const [studyAreaModalTab, setStudyAreaModalTab] = useState("presets");
  const [isClassPaletteModalOpen, setIsClassPaletteModalOpen] = useState(false);
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [tocFilter, setTocFilter] = useState("");
  const [isSamplesLayerExpanded, setIsSamplesLayerExpanded] = useState(true);
  const [isFullMapMode, setIsFullMapMode] = useState(false);
  const studyAreaGroupRef = useRef<any>(null);
  const aoiBoundsRef = useRef<number[] | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  
  useEffect(() => {
    if (studyArea) {
      try {
        const normalized = normalizeToFeatureCollection(studyArea);
        aoiBoundsRef.current = turf.bbox(normalized);
      } catch (e) {
        console.error("Turf bbox failed", e);
        aoiBoundsRef.current = null;
      }
    } else {
      aoiBoundsRef.current = null;
    }
  }, [studyArea]);

  const aoiAreaKm2 = useMemo(() => {
    if (!studyArea) return null;
    try {
      const normalized = normalizeToFeatureCollection(studyArea);
      const sqMeters = turf.area(normalized);
      return (sqMeters / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 });
    } catch {
      return null;
    }
  }, [studyArea]);

  const clearStudyArea = useCallback(() => {
    if (studyAreaGroupRef.current) {
      try {
        studyAreaGroupRef.current.clearLayers();
      } catch {}
    }
    setStudyArea(null);
    aoiBoundsRef.current = null;
    setIsDrawingStudyArea(false);
    setIsEditing(false);
    toast({ title: "Study Area Cleared", description: "Spatial boundary removed." });
  }, [toast]);

  const applyStudyAreaPreset = useCallback((preset: typeof STUDY_AREA_PRESETS[0]) => {
    const [minLng, minLat, maxLng, maxLat] = preset.bbox;
    const polygonFeature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: preset.name },
          geometry: {
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
          },
        },
      ],
    };

    if (studyAreaGroupRef.current) {
      try {
        studyAreaGroupRef.current.clearLayers();
      } catch {}
    }
    setStudyArea(polygonFeature);
    setActiveBbox(preset.bbox);
    setIsStudyAreaModalOpen(false);
    setIsDrawingStudyArea(false);
    toast({
      title: `Study Area: ${preset.name}`,
      description: `Configured bounding box. Centered view on ${preset.name}.`,
    });
  }, [toast]);

  const applyCurrentViewportAsStudyArea = useCallback(() => {
    if (!mapInstanceRef.current) {
      toast({ variant: "destructive", title: "Map canvas initializing", description: "Please wait a moment for the map to finish loading." });
      return;
    }
    const bounds = mapInstanceRef.current.getBounds();
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();

    const minLng = Number(southWest.lng.toFixed(6));
    const minLat = Number(southWest.lat.toFixed(6));
    const maxLng = Number(northEast.lng.toFixed(6));
    const maxLat = Number(northEast.lat.toFixed(6));

    const viewportFeature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Current Map Viewport AOI" },
          geometry: {
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
          },
        },
      ],
    };

    if (studyAreaGroupRef.current) {
      try {
        studyAreaGroupRef.current.clearLayers();
      } catch {}
    }
    setStudyArea(viewportFeature);
    setActiveBbox([minLng, minLat, maxLng, maxLat]);
    setIsStudyAreaModalOpen(false);
    setIsDrawingStudyArea(false);
    toast({
      title: "Study Area Set from Map Viewport",
      description: `AOI set to [${minLng}, ${minLat}] → [${maxLng}, ${maxLat}].`,
    });
  }, [toast]);

  const startAoiDrawing = useCallback((shape: "rectangle" | "polygon") => {
    if (studyAreaGroupRef.current) {
      try {
        studyAreaGroupRef.current.clearLayers();
      } catch {}
    }
    setAoiDrawShape(shape);
    setIsStudyAreaModalOpen(false);
    setIsDrawingStudyArea(true);
    toast({
      title: shape === "rectangle" ? "Draw Box (Rectangle AOI)" : "Draw Freeform Polygon AOI",
      description: shape === "rectangle" 
        ? "Click and drag or click two opposite corners on the map to define bounding box." 
        : "Click vertices on the map, then click the start vertex to complete.",
    });
    setTimeout(() => {
      const toolToCss = shape === "rectangle" ? "leaflet-draw-draw-rectangle" : "leaflet-draw-draw-polygon";
      const btn = document.querySelector(`a.${toolToCss}`) as HTMLElement;
      if (btn) btn.click();
    }, 250);
  }, [toast]);

  const cancelAoiDrawing = useCallback(() => {
    setIsDrawingStudyArea(false);
    const cancelBtn = document.querySelector('a[title="Cancel drawing"]') as HTMLElement;
    if (cancelBtn) cancelBtn.click();
    if (studyAreaGroupRef.current) {
      try {
        studyAreaGroupRef.current.clearLayers();
      } catch {}
    }
    toast({ title: "AOI Drawing Cancelled" });
  }, [toast]);

  const handleAoiFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    const fileName = file.name.toLowerCase();
    try {
      let rawGeoJson: any = null;
      if (fileName.endsWith(".zip")) {
        const buffer = await file.arrayBuffer();
        const shp = await import("shpjs");
        rawGeoJson = await shp.default(buffer);
      } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
        const text = await file.text();
        rawGeoJson = JSON.parse(text);
      } else {
        throw new Error("Unsupported format. Please upload .geojson, .json, or .zip (Shapefile).");
      }

      const normalized = normalizeToFeatureCollection(rawGeoJson);
      if (!normalized || !normalized.features || normalized.features.length === 0) {
        throw new Error("No spatial polygon features found in file.");
      }

      if (studyAreaGroupRef.current) {
        try {
          studyAreaGroupRef.current.clearLayers();
        } catch {}
      }
      setStudyArea(normalized);
      try {
        const bbox = turf.bbox(normalized);
        if (bbox && bbox.length === 4) setActiveBbox(bbox);
      } catch {}

      setIsStudyAreaModalOpen(false);
      setIsDrawingStudyArea(false);
      toast({
        title: "Study Area Uploaded",
        description: `Loaded ${normalized.features.length} feature(s) from ${file.name}.`,
      });
    } catch (err: any) {
      console.error("AOI upload error", err);
      toast({
        variant: "destructive",
        title: "AOI Upload Failed",
        description: err.message || "Could not parse spatial boundary file.",
      });
    }
  }, [toast]);

  const drawOptions = useMemo(() => {
    return {
      marker: drawMode === "point" ? { repeatMode: true } : false,
      polyline: drawMode === "polyline" ? { repeatMode: true, shapeOptions: { color: "#38bdf8", weight: 2 } } : false,
      polygon: drawMode === "polygon" ? { repeatMode: true, showArea: false, shapeOptions: { color: "#38bdf8", fillOpacity: 0.15, weight: 2 } } : false,
      rectangle: drawMode === "rectangle" ? { repeatMode: true, showArea: false, shapeOptions: { color: "#38bdf8", fillOpacity: 0.12, weight: 1.5 } } : false,
      circle: drawMode === "circle" ? { repeatMode: true, shapeOptions: { color: "#38bdf8", fillOpacity: 0.15, weight: 1.5 } } : false,
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
  const [isTimelapseDockOpen, setIsTimelapseDockOpen] = useState(false);
  const [tlOpacity, setTlOpacity] = useState(0.85);
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
    setTlStatus("Connecting to Earth Engine...");
    try {
      const year = tlSourceCfg.years[Math.min(tlYearIdx, tlSourceCfg.years.length - 1)];
      const body: any = { source: tlSource, year };
      if (aoiBoundsRef.current) {
        body.aoi_bounds = aoiBoundsRef.current;
      } else if (activeBbox && activeBbox.length === 4) {
        body.aoi_bounds = activeBbox;
      } else {
        // Fallback bounds around Rwanda / Lake Kivu study region
        body.aoi_bounds = [28.8, -2.9, 30.9, -1.0];
      }
      if (tlSource === "gedi") { body.gedi_mode = gediMode; body.gedi_window = gediWindow; }
      const res = await api.gee.timelapseTile(body);
      setTimelapseTileUrl(res.tile_url);
      if (res.shot_count !== undefined) {
        const dr = res.date_range ? `${res.date_range[0]} → ${res.date_range[1]}` : "";
        setTlStatus(res.shot_count === 0
          ? `⚠ No GEDI shots in ${dr}. Try 'Cumulative' mode.`
          : `✓ GEDI: ${res.shot_count} monthly composites (${dr})`);
      } else {
        setTlStatus(`✓ ${tlSourceCfg.label.split(" ")[0]} (${year}) tile active`);
      }
      toast({
        title: `Timelapse Layer Loaded (${year}) 🛰️`,
        description: `${tlSourceCfg.label} composite rendered over map canvas.`,
      });
    } catch(e: any) {
      setTlStatus(`⚠ ${e.message || "Failed to load tile"}`);
      toast({
        variant: "destructive",
        title: "Timelapse Imagery Failed",
        description: e.message || "Could not retrieve satellite composite.",
      });
    } finally {
      setTlLoading(false);
    }
  }, [tlSource, tlYearIdx, tlSourceCfg.years, tlSourceCfg.label, gediMode, gediWindow, activeBbox, toast]);

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
      if (studyAreaGroupRef.current) {
        try {
          studyAreaGroupRef.current.clearLayers();
        } catch {}
      }
      if (e.layer && e.layer.remove) {
        try {
          e.layer.remove();
        } catch {}
      }
      if (editGroupRef.current) {
        try {
          editGroupRef.current.removeLayer(e.layer);
        } catch {}
      }
      const normalized = normalizeToFeatureCollection(geojson);
      setStudyArea(normalized);
      setIsDrawingStudyArea(false);
      try {
        const bbox = turf.bbox(normalized);
        if (bbox && bbox.length === 4) {
          setActiveBbox(bbox);
        }
      } catch {}
      toast({ title: "Study Area Defined", description: "Spatial boundary locked. Ready to digitize samples." });
      cancelDrawMode();
      setDrawMode("pan");
      return;
    }

    if (state.studyArea) {
      const isInside = validateWithinStudyArea(state.studyArea, geojson);
      if (!isInside) {
        if (e.layer && e.layer.remove) {
          try {
            e.layer.remove();
          } catch {}
        }
        if (editGroupRef.current) {
          try {
            editGroupRef.current.removeLayer(e.layer);
          } catch {}
        }
        toast({ title: "Outside Study Area", description: "Sample must be inside the defined study area.", variant: "destructive" });
        return;
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
    visualized_download_url?: string;
    classes: string[];
    colors: Record<string, string>;
    areas: Record<string, number>;
    accuracy?: { 
      overall_accuracy?: number | null; 
      kappa?: number | null; 
      is_evaluated?: boolean;
      evaluation_note?: string | null;
      matrix?: number[][];
      matrix_labels?: string[];
      producers_accuracy?: Record<string, number>;
      users_accuracy?: Record<string, number>;
      missing_classes?: string[];
      total_samples?: number;
      samples_used?: number;
      class_counts?: Record<string, number>;
    };
    samples_metadata?: {
      total_submitted: number;
      total_used: number;
      class_counts: Record<string, number>;
      stratified_cap_per_class: number;
    };
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
  ];

  const selectedDatasetObj = allDatasets.find((d) => d.id === selectedDatasetId);
  const isRasterSelected = selectedDatasetObj?.file_type === "tiff" || (selectedDatasetObj?.original_filename && !!selectedDatasetObj.original_filename.toLowerCase().match(/\.tiff?$/));

  const commitGeometryDirectly = (geometryObj: any) => {
    if (studyArea) {
      const isInside = validateWithinStudyArea(studyArea, geometryObj);
      if (!isInside) {
        toast({
          variant: "destructive",
          title: "Outside Study Area",
          description: "Sample must be inside the defined study area boundary.",
        });
        return;
      }
    }

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

  const classBalanceMetrics = useMemo(() => {
    const classEntries = Object.entries(groupedSamples);
    const numClasses = classEntries.length;
    const totalSamples = allCombinedSamples.length;
    if (numClasses === 0) return { status: "empty", message: "No training samples digitized yet." };
    if (numClasses < 2) return { 
      status: "insufficient", 
      message: "At least 2 distinct classes are required to train a machine learning model." 
    };

    const counts = classEntries.map(([name, g]) => ({ name, count: g.items.length }));
    const min = Math.min(...counts.map(c => c.count));
    const max = Math.max(...counts.map(c => c.count));
    const minClass = counts.find(c => c.count === min);
    const maxClass = counts.find(c => c.count === max);

    if (min < 5) {
      return {
        status: "low_samples",
        message: `Class '${minClass?.name}' has only ${min} sample(s). Aim for at least 10–20 samples per class for robust generalization.`
      };
    }

    if (max / Math.max(1, min) >= 4) {
      return {
        status: "imbalanced",
        message: `High class imbalance: '${maxClass?.name}' (${max}) has ${Math.round(max / Math.max(1, min))}x more samples than '${minClass?.name}' (${min}). The classifier may bias toward ${maxClass?.name}.`
      };
    }

    return {
      status: "healthy",
      message: `Well-balanced dataset: ${numClasses} classes across ${totalSamples} samples. Ready for Supervised ML.`
    };
  }, [groupedSamples, allCombinedSamples]);

  const [applySieve, setApplySieve] = useState(false);
  const [showSpectralProfilesModal, setShowSpectralProfilesModal] = useState(false);
  const [spectralProfilesData, setSpectralProfilesData] = useState<any>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const spectralProfilesMut = useMutation({
    mutationFn: () => api.samples.spectralProfiles({
      samples: allCombinedSamples,
      year: 2024,
      aoi: studyArea || undefined,
      data_source: classificationSource
    }),
    onSuccess: (data) => {
      setSpectralProfilesData(data);
      setShowSpectralProfilesModal(true);
      toast({
        title: "Spectral Profiles Extracted!",
        description: `Analyzed ${data.total_pixels_sampled} satellite pixels across ${Object.keys(data.classes).length} classes.`
      });
    },
    onError: (e: Error) => {
      toast({
        variant: "destructive",
        title: "Spectral Analysis Failed",
        description: e.message
      });
    }
  });

  const classifyMut = useMutation({
    mutationFn: () => api.samples.classify({
      data_source: classificationSource,
      custom_asset_id: customAssetId,
      samples: allCombinedSamples,
      aoi: studyArea || undefined,
      apply_sieve: applySieve
    }),
    onSuccess: (data) => {
      setClassifyResult(data);
      toast({
        title: "Classification Complete!",
        description: `Random Forest trained on ${allCombinedSamples.length} samples over ${classificationSource}${applySieve ? " (3x3 Majority Sieve Filter active)" : ""}.`,
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
        const tileUrl = `${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`;
        setNativePreviewUrl(tileUrl);
        setClassificationSource("native_cog");
        setCustomAssetId(rawUrl);

        if (!bbox) {
          fetch(`${BASE}/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}`)
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
      const res = await fetch(`${BASE}/datasets/scrape-directory?url=${encodeURIComponent(linkUrl)}`);
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
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      if (res.kind === "raster" && res.asset_id) {
        if (res.background) {
          toast({
            title: "Background Ingestion Started!",
            description: `The raster is downloading in the background and will be pushed to GEE as ${res.asset_id}. This will save you processing time.`,
          });
        } else {
          toast({
            title: "Raster Ingested!",
            description: `URL downloaded and pushed to GEE as ${res.asset_id}. It is now selected as your classification source.`,
          });
          setCustomAssetId(res.asset_id);
          setClassificationSource("custom");
          setActiveTab("map");
        }
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
        setNativePreviewUrl(`${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`);
        setClassificationSource("native_cog");
        setCustomAssetId(rawUrl);
        setPreviewDatasetName(res.name);

        if (res.bbox && res.bbox.length === 4) {
          setActiveBbox(res.bbox);
        } else {
          fetch(`${BASE}/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}`)
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
    if (allCombinedSamples.length === 0) {
      toast({ variant: "destructive", title: "No samples to export" });
      return;
    }
    const fc = {
      type: "FeatureCollection",
      features: allCombinedSamples.map((s) => ({
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
    a.download = `training_samples_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "GeoJSON Downloaded! 🗺️",
      description: `Exported ${allCombinedSamples.length} feature(s) to GeoJSON.`,
    });
  };

  const downloadShapefile = () => {
    window.open(`${BASE}/samples/export/shapefile`, "_blank");
    toast({
      title: "Shapefile Download Started 📦",
      description: "Exporting training samples as ESRI Shapefile ZIP archive (.shp, .shx, .dbf, .prj).",
    });
  };

  const downloadCSV = () => {
    if (allCombinedSamples.length === 0) {
      toast({ variant: "destructive", title: "No samples to export" });
      return;
    }
    const headers = ["id", "class_label", "color", "creator", "geometry_type", "coordinates"];
    const rows = allCombinedSamples.map((s) => [
      `"${s.id || ""}"`,
      `"${s.class_label || ""}"`,
      `"${s.color || ""}"`,
      `"${s.creator || ""}"`,
      `"${s.geometry?.type || ""}"`,
      `"${JSON.stringify(s.geometry?.coordinates || []).replace(/"/g, '""')}"`,
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training_samples_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CSV Exported! 📊",
      description: `Exported ${allCombinedSamples.length} feature(s) with spatial coordinates.`,
    });
  };

  const downloadQMLStyle = () => {
    const classEntries = Object.entries(groupedSamples);
    if (classEntries.length === 0 && !classifyResult) {
      toast({ variant: "destructive", title: "No classes available to export style" });
      return;
    }

    let qml = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>\n<qgis version="3.28.0">\n  <pipe>\n    <rasterrenderer type="paletted" opacity="1" band="1">\n      <colorPalette>\n`;

    if (classifyResult) {
      classifyResult.classes.forEach((cls, idx) => {
        const hex = classifyResult.colors[cls] || "#3b82f6";
        qml += `        <paletteEntry value="${idx + 1}" color="${hex}" label="${cls}" alpha="255"/>\n`;
      });
    } else {
      classEntries.forEach(([clsName, g], idx) => {
        qml += `        <paletteEntry value="${idx + 1}" color="${g.color}" label="${clsName}" alpha="255"/>\n`;
      });
    }

    qml += `      </colorPalette>\n    </rasterrenderer>\n  </pipe>\n</qgis>`;
    const blob = new Blob([qml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training_classes_${new Date().toISOString().slice(0, 10)}.qml`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "QGIS Style (.qml) Downloaded! 🎨",
      description: "Standard QGIS color palette styling file saved. Drag & drop onto raster in QGIS.",
    });
  };

  const handleCopyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      toast({
        title: "Link Copied to Clipboard! 📋",
        description: "Direct URL to this training digitization session is ready to share.",
      });
    }
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

  const handleStopSession = () => {
    if (isEditing) {
      if (sessionSamples.length > 0) {
        setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0, 10)}`);
        setIsSaveModalOpen(true);
      } else {
        setIsEditing(false);
        cancelDrawMode();
        toast({
          title: "Session Stopped ⏹️",
          description: "No new features were buffered.",
        });
      }
    } else if (isDrawingStudyArea) {
      setIsDrawingStudyArea(false);
      cancelDrawMode();
      toast({ title: "Study Area Drawing Cancelled" });
    } else {
      cancelDrawMode();
      setDrawMode("pan");
      toast({ title: "Drawing Halted", description: "Map returned to Pan mode." });
    }
  };

  const handleQuitSession = () => {
    if (isEditing && sessionSamples.length > 0) {
      if (!confirm(`Are you sure you want to quit and discard all ${sessionSamples.length} unsaved sample(s) in this editing session?`)) {
        return;
      }
    }
    cancelDrawMode();
    setSessionSamples([]);
    setActivePoints([]);
    setGeoJsonText("");
    setIsEditing(false);
    setIsDrawingStudyArea(false);
    toast({
      title: "Session Quit & Reset 🚪",
      description: "Cleared active drawing session and reset to default view.",
    });
  };

  // Keyboard shortcut: Escape to exit Full Map View (only if no dialog/modal is open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullMapMode) {
        if (
          isStudyAreaModalOpen ||
          isClassPaletteModalOpen ||
          isReadinessModalOpen ||
          isSaveModalOpen ||
          isShareModalOpen ||
          isAddDataModalOpen ||
          document.querySelector('[role="dialog"]') ||
          document.querySelector('[data-state="open"]')
        ) {
          return;
        }
        setIsFullMapMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFullMapMode,
    isStudyAreaModalOpen,
    isClassPaletteModalOpen,
    isReadinessModalOpen,
    isSaveModalOpen,
    isShareModalOpen,
    isAddDataModalOpen,
  ]);

  // Recalculate Leaflet map canvas dimensions when entering/exiting full map mode or toggling TOC
  useEffect(() => {
    const t1 = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 120);
    const t2 = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullMapMode, isLeftPanelOpen]);

  return (
    <div className={`flex flex-col h-full bg-background overflow-hidden relative ${
      isFullMapMode ? "fixed inset-0 z-[100] w-screen h-screen" : ""
    }`}>
      {/* Top Header: In Full Map Mode, dedicated streamlined training bar. Otherwise, full master command bar */}
      {isFullMapMode ? (
        <div className="flex-none flex flex-wrap items-center justify-between px-4 py-2 border-b border-border/80 bg-card/95 backdrop-blur-md z-[50] gap-2 shadow-sm">
          {/* Left: Return to Mother Page + TOC Toggle */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsFullMapMode(false)}
              className="h-8 gap-1.5 text-xs font-semibold px-3 bg-foreground text-background hover:bg-foreground/90 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Return to Mother Page (Full Studio with Attribute Table, Timelapse, Spectral & Asset tools)"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Return to Mother Page</span>
            </Button>

            <Badge variant="outline" className="text-[10px] font-mono border-sky-500/40 text-sky-300 bg-sky-500/10 py-0.5 h-6 hidden lg:inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              Full Map Training
            </Badge>

            <div className="h-4 w-[1px] bg-border/60 mx-0.5 hidden sm:block" />

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsLeftPanelOpen((p) => !p)}
              className="h-8 px-2.5 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground border-border/60 bg-muted/20"
              title={isLeftPanelOpen ? "Hide Samples Table of Contents" : "Show Samples Table of Contents"}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isLeftPanelOpen ? "Hide Samples" : "Show Samples"}</span>
            </Button>
          </div>

          {/* Center: Essential Training & Digitizing Tools */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* 1. Define AOI */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsStudyAreaModalOpen(true)}
              className={`h-8 gap-1.5 text-xs font-medium px-2.5 transition-all shadow-2xs ${
                !studyArea
                  ? "border-sky-500/70 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 ring-1 ring-sky-500/30"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              }`}
              title={!studyArea ? "Prerequisite: Define or Upload Study Area (AOI) to unlock training tools" : "Study Area Defined"}
            >
              {!studyArea ? (
                <>
                  <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. Define AOI</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-500/25 text-sky-300">Req</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>AOI: Defined</span>
                </>
              )}
            </Button>

            {/* 2. Select Class */}
            <button
              type="button"
              onClick={() => setIsClassPaletteModalOpen(true)}
              className="flex items-center gap-1.5 hover:bg-muted/50 px-2.5 py-1 h-8 rounded-md text-xs font-medium transition-all border border-border/60 bg-muted/20 shadow-2xs text-foreground cursor-pointer"
              title="Open Land Cover Class Palette Studio"
            >
              <span className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs shrink-0" style={{ backgroundColor: getRefinedColor(color, classLabel) }} />
              <span className="max-w-[110px] truncate">{classLabel || "Select Class"}</span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border/50 bg-muted/40">
                {groupedSamples[classLabel]?.items.length || 0}
              </Badge>
              <Palette className="w-3 h-3 text-muted-foreground ml-0.5" />
            </button>

            {/* 3. Vector Drawing Tools */}
            <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-lg border border-border/50">
              <button
                type="button"
                title="Pan Mode (Navigation)"
                onClick={() => { cancelDrawMode(); setDrawMode("pan"); }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center cursor-pointer ${
                  drawMode === "pan" ? "bg-foreground text-background shadow-xs font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={!studyArea ? "Study Area (AOI) required before drawing points" : "Point Feature (Single coordinate sample)"}
                onClick={() => {
                  if (!studyArea) {
                    toast({ title: "Study Area Required", description: "Define AOI first", variant: "destructive" });
                    return;
                  }
                  setDrawMode("point");
                  autoStartDrawMode("point", isEditing);
                }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                  !studyArea ? "opacity-30 cursor-not-allowed text-muted-foreground/40" : drawMode === "point" ? "bg-foreground text-background shadow-xs cursor-pointer font-semibold" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={!studyArea ? "Study Area (AOI) required before drawing lines" : "Polyline Feature (Linear sample / transect)"}
                onClick={() => {
                  if (!studyArea) {
                    toast({ title: "Study Area Required", description: "Define AOI first", variant: "destructive" });
                    return;
                  }
                  setDrawMode("polyline");
                  autoStartDrawMode("polyline", isEditing);
                }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                  !studyArea ? "opacity-30 cursor-not-allowed text-muted-foreground/40" : drawMode === "polyline" ? "bg-foreground text-background shadow-xs cursor-pointer font-semibold" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={!studyArea ? "Study Area (AOI) required before drawing polygons" : "Polygon Feature (Area polygon sample)"}
                onClick={() => {
                  if (!studyArea) {
                    toast({ title: "Study Area Required", description: "Define AOI first", variant: "destructive" });
                    return;
                  }
                  setDrawMode("polygon");
                  autoStartDrawMode("polygon", isEditing);
                }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                  !studyArea ? "opacity-30 cursor-not-allowed text-muted-foreground/40" : drawMode === "polygon" ? "bg-foreground text-background shadow-xs cursor-pointer font-semibold" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={!studyArea ? "Study Area (AOI) required before drawing rectangles" : "Rectangle Box Feature"}
                onClick={() => {
                  if (!studyArea) {
                    toast({ title: "Study Area Required", description: "Define AOI first", variant: "destructive" });
                    return;
                  }
                  setDrawMode("rectangle");
                  autoStartDrawMode("rectangle", isEditing);
                }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                  !studyArea ? "opacity-30 cursor-not-allowed text-muted-foreground/40" : drawMode === "rectangle" ? "bg-foreground text-background shadow-xs cursor-pointer font-semibold" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={!studyArea ? "Study Area (AOI) required before drawing circular buffers" : "Circle Buffer Feature"}
                onClick={() => {
                  if (!studyArea) {
                    toast({ title: "Study Area Required", description: "Define AOI first", variant: "destructive" });
                    return;
                  }
                  setDrawMode("circle");
                  autoStartDrawMode("circle", isEditing);
                }}
                className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                  !studyArea ? "opacity-30 cursor-not-allowed text-muted-foreground/40" : drawMode === "circle" ? "bg-foreground text-background shadow-xs cursor-pointer font-semibold" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                <Circle className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 4. Start / Stop Draw */}
            {!isEditing ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!studyArea}
                onClick={() => {
                  if (!studyArea) return;
                  setIsEditing(true);
                  setSessionSamples([]);
                  toast({ title: "Edit Session Started", description: `Digitizing '${classLabel}'. Click on map to add features.` });
                  setTimeout(() => autoStartDrawMode(drawMode === "pan" ? "point" : drawMode, true), 300);
                }}
                className={`font-semibold gap-1.5 text-xs shadow-2xs h-8 px-2.5 transition-all ${
                  !studyArea
                    ? "opacity-40 cursor-not-allowed border-dashed"
                    : "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                }`}
                title={!studyArea ? "Define AOI first to start drawing features" : "Start digitizing samples on the map"}
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Start Draw</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="font-medium gap-1 text-xs shadow-2xs h-8 px-2.5 animate-pulse cursor-pointer"
                onClick={handleStopSession}
                title="Halt active digitization session"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Stop Draw</span>
              </Button>
            )}

            {/* 5. Readiness Status */}
            <button
              type="button"
              onClick={() => setIsReadinessModalOpen(true)}
              className="px-2 h-8 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border border-border/60 bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground shadow-2xs cursor-pointer"
              title="Inspect Dataset Readiness & Sample Quality Balance"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${classBalanceMetrics.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="hidden xl:inline">Readiness:</span>
              <span>{classBalanceMetrics.status === "healthy" ? "Healthy" : classBalanceMetrics.status === "imbalanced" ? "Imbalanced" : "Low Samples"}</span>
            </button>
          </div>

          {/* Right: Classifier Execution + Batch Save + Exit Full View */}
          <div className="flex items-center gap-2">
            {sessionSamples.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0, 10)}`);
                  setIsSaveModalOpen(true);
                }}
                className="h-8 gap-1.5 text-xs font-medium px-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border/60 shadow-2xs cursor-pointer"
                title="SAVE: Commit buffered features to dataset"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save ({sessionSamples.length})</span>
              </Button>
            )}

            {/* RUN CLASSIFIER */}
            <Button
              size="sm"
              onClick={() => {
                if (allCombinedSamples.length === 0) {
                  toast({
                    variant: "destructive",
                    title: "Training Samples Required",
                    description: "Please digitize at least 2 training samples before running supervised classification.",
                  });
                  return;
                }
                trainSupervisedClassifierDirectly();
              }}
              disabled={classifyMut.isPending || allCombinedSamples.length === 0}
              className={`h-8 gap-1.5 text-xs font-semibold px-3.5 shadow-2xs transition-all active:scale-95 ${
                allCombinedSamples.length === 0
                  ? "opacity-40 cursor-not-allowed border border-dashed border-border/40 text-muted-foreground/40 bg-muted/10 shadow-none"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer shadow-xs"
              }`}
              title="RUN: Execute Random Forest Supervised Classifier on digitized training samples"
            >
              {classifyMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : allCombinedSamples.length === 0 ? (
                <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>
                {classifyMut.isPending
                  ? "Training..."
                  : `Run Classifier (${allCombinedSamples.length})`}
              </span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullMapMode(false)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Exit Full-Screen Map (Return to Studio)"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        /* Unified Top Master Command Bar - Sleek Minimalist */
        <div className="flex flex-wrap items-center justify-between px-6 py-2 border-b border-border/60 bg-card/90 backdrop-blur-md z-[50] gap-3">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Brand & Studio Title */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-muted/60 text-foreground border border-border/50">
              <Satellite className="w-4 h-4 text-foreground/80" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
                Training Data &amp; ML Studio
                <Badge variant="outline" className="text-[10px] font-mono border-border/50 text-muted-foreground bg-muted/40 py-0 h-4">
                  Sentinel-2 SR
                </Badge>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Spatial Feature Digitization &bull; Supervised Random Forest
              </span>
            </div>
          </div>

          {/* Unified Primary Action Bar */}
          <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-lg border border-border/50 shadow-2xs">
            {/* 1. RUN CLASSIFIER */}
            <Button
              size="sm"
              onClick={() => {
                if (allCombinedSamples.length === 0) {
                  toast({
                    variant: "destructive",
                    title: "Training Samples Required",
                    description: "Please digitize at least 2 training samples before running supervised classification.",
                  });
                  return;
                }
                trainSupervisedClassifierDirectly();
              }}
              disabled={classifyMut.isPending || allCombinedSamples.length === 0}
              className={`h-8 gap-1.5 text-xs font-semibold px-3.5 shadow-2xs transition-all active:scale-95 ${
                allCombinedSamples.length === 0
                  ? "opacity-40 cursor-not-allowed border border-dashed border-border/40 text-muted-foreground/40 bg-muted/10 hover:bg-muted/10 shadow-none pointer-events-auto"
                  : "bg-foreground text-background hover:bg-foreground/90 font-medium cursor-pointer shadow-xs"
              }`}
              title={
                allCombinedSamples.length === 0
                  ? "Classifier Locked: Digitize training samples before running classification"
                  : "RUN: Execute Random Forest Supervised Classifier on digitized training samples"
              }
            >
              {classifyMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : allCombinedSamples.length === 0 ? (
                <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>
                {classifyMut.isPending
                  ? "Training..."
                  : allCombinedSamples.length === 0
                  ? "Run Classifier (0)"
                  : `Run Classifier (${allCombinedSamples.length})`}
              </span>
            </Button>

            {/* 2. STOP */}
            <Button
              size="sm"
              variant={isEditing || isDrawingStudyArea ? "destructive" : "outline"}
              onClick={handleStopSession}
              disabled={!isEditing && !isDrawingStudyArea && drawMode === "pan"}
              className={`h-8 gap-1.5 text-xs font-medium px-2.5 transition-all ${
                isEditing || isDrawingStudyArea
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs font-semibold animate-pulse cursor-pointer"
                  : "opacity-25 cursor-not-allowed border-border/20 text-muted-foreground/30 bg-transparent pointer-events-none"
              }`}
              title={!isEditing && !isDrawingStudyArea ? "No active drawing session to stop" : "STOP: Halt active drawing session"}
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop</span>
            </Button>

            {/* 3. SAVE BATCH */}
            {sessionSamples.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0, 10)}`);
                  setIsSaveModalOpen(true);
                }}
                className="h-8 gap-1.5 text-xs font-medium px-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border/60 shadow-2xs transition-all active:scale-95"
                title="SAVE: Commit buffered features to dataset"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Batch ({sessionSamples.length})</span>
              </Button>
            )}

            {/* 4. SPECTRAL CHECK */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => spectralProfilesMut.mutate()}
              disabled={spectralProfilesMut.isPending || allCombinedSamples.length === 0}
              className={`h-8 gap-1.5 text-xs font-medium px-2.5 transition-all ${
                allCombinedSamples.length === 0
                  ? "opacity-30 cursor-not-allowed border-border/20 text-muted-foreground/30 bg-transparent pointer-events-none"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
              }`}
              title={allCombinedSamples.length === 0 ? "Requires digitized samples to extract spectral curves" : "SPECTRAL: Inspect Multi-Spectral Reflectance Curves (B2-B12)"}
            >
              {spectralProfilesMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span>Spectral</span>
            </Button>

            {/* 5. TIMELAPSE STUDIO */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsTimelapseDockOpen((prev) => {
                  const next = !prev;
                  if (next && !timelapseTileUrl) {
                    loadTimelapseTile();
                  }
                  return next;
                });
              }}
              className={`h-8 gap-1.5 text-xs font-medium px-3 transition-all active:scale-95 border-border/50 ${
                isTimelapseDockOpen || timelapseTileUrl
                  ? "bg-muted text-foreground border-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="TIMELAPSE: Toggle Historical Satellite Imagery Timeline & Multi-Year Scrubber"
            >
              <Satellite className="w-3.5 h-3.5" />
              <span>Timelapse</span>
              {timelapseTileUrl && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-border text-muted-foreground font-mono">
                  {tlYear}
                </Badge>
              )}
            </Button>

            {/* 6. SHARE */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsShareModalOpen(true)}
              className="h-8 gap-1.5 text-xs font-medium px-3 text-muted-foreground hover:text-foreground border-border/50 hover:bg-muted/50 shadow-2xs transition-all active:scale-95"
              title="SHARE: Share training session URL, export Shapefile/GeoJSON/CSV, and QGIS styles"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </Button>

            {/* 7. RESET / QUIT */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleQuitSession}
              className="h-8 gap-1 text-xs font-medium px-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              title="RESET: Discard active session drafts and reset map"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>

            {/* 8. FULL MAP MODE TOGGLE */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveTab("map");
                setIsFullMapMode(true);
              }}
              className="h-8 gap-1.5 text-xs font-semibold px-3 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30 transition-all active:scale-95 shadow-2xs cursor-pointer"
              title="FULL MAP: Expand to full-screen map with dedicated training & digitizing tools"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Map View</span>
            </Button>

            {/* Real-time Status Badge */}
            <div className="h-4 w-[1px] bg-border/60 mx-1" />
            <div className="px-2 text-[11px] font-mono flex items-center gap-1.5">
              {isEditing ? (
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Drawing: {classLabel} ({sessionSamples.length} buffered)
                </span>
              ) : allCombinedSamples.length === 0 ? (
                <span className="text-muted-foreground">0 Samples</span>
              ) : Object.keys(groupedSamples).length < 2 ? (
                <span className="text-amber-400/90 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Need 2+ classes
                </span>
              ) : (
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {Object.keys(groupedSamples).length} Classes &bull; {allCombinedSamples.length} Samples Ready
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Minimalist Tabs Bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-muted/40 p-0.5 border border-border/50 rounded-lg h-8.5">
            <TabsTrigger value="map" className="gap-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs text-muted-foreground hover:text-foreground transition-all rounded-md px-3 py-1">
              <Edit className="w-3.5 h-3.5" /> Map &amp; Digitizer
            </TabsTrigger>
            <TabsTrigger value="samples" className="gap-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs text-muted-foreground hover:text-foreground transition-all rounded-md px-3 py-1">
              <Table className="w-3.5 h-3.5" /> Attribute Table ({allCombinedSamples.length})
            </TabsTrigger>
            <TabsTrigger value="classify" className="gap-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs text-muted-foreground hover:text-foreground transition-all rounded-md px-3 py-1">
              <Cpu className="w-3.5 h-3.5" /> Supervised Classification
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="import" className="gap-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs text-muted-foreground hover:text-foreground transition-all rounded-md px-3 py-1">
                  <Database className="w-3.5 h-3.5" /> Import Data
                </TabsTrigger>
                <TabsTrigger value="gee" className="gap-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs text-muted-foreground hover:text-foreground transition-all rounded-md px-3 py-1">
                  <Upload className="w-3.5 h-3.5" /> GEE Asset
                </TabsTrigger>
              </>
            )}
          </TabsList>
        </Tabs>
      </div>
      )}

      {/* Top Timelapse Ribbon Dock (Option 1 Integration) */}
      {isTimelapseDockOpen && (
        <div className="flex flex-wrap items-center justify-between px-6 py-2 border-b bg-sky-950/40 backdrop-blur-md z-[45] gap-3 text-xs border-sky-500/20 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Title / Badge */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-sky-300 flex items-center gap-1.5">
                <Satellite className="w-4 h-4 text-sky-400" />
                Timelapse Studio:
              </span>
            </div>

            {/* Source Switcher */}
            <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-sky-500/30">
              {TL_SOURCES.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setTlSource(src.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                    tlSource === src.id
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-sky-200 hover:bg-sky-500/10"
                  }`}
                >
                  {src.icon}
                  <span>{src.label.split(" ")[0]}</span>
                </button>
              ))}
            </div>

            {/* Year Scrubber & Controls */}
            <div className="flex items-center gap-1.5 bg-background/80 px-2 py-1 rounded-lg border border-sky-500/30">
              <button
                type="button"
                title="First year"
                onClick={() => { setIsPlaying(false); setTlYearIdx(0); }}
                className="p-1 rounded hover:bg-sky-500/20 text-sky-400 disabled:opacity-30"
                disabled={tlYearIdx === 0}
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Previous year"
                onClick={() => { setIsPlaying(false); setTlYearIdx((i) => Math.max(0, i - 1)); }}
                className="p-1 rounded hover:bg-sky-500/20 text-sky-400 disabled:opacity-30"
                disabled={tlYearIdx === 0}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Year Selector / Badge */}
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono font-extrabold text-sm text-sky-300 tracking-tight min-w-[42px] text-center">
                  {tlYear}
                </span>
                <input
                  type="range"
                  min={0}
                  max={tlSourceCfg.years.length - 1}
                  value={tlYearIdx}
                  onChange={(e) => { setIsPlaying(false); setTlYearIdx(Number(e.target.value)); }}
                  className="w-24 sm:w-32 h-1.5 accent-sky-400 cursor-pointer"
                />
              </div>

              <button
                type="button"
                title="Next year"
                onClick={() => { setIsPlaying(false); setTlYearIdx((i) => Math.min(tlSourceCfg.years.length - 1, i + 1)); }}
                className="p-1 rounded hover:bg-sky-500/20 text-sky-400 disabled:opacity-30"
                disabled={tlYearIdx === tlSourceCfg.years.length - 1}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Last year"
                onClick={() => { setIsPlaying(false); setTlYearIdx(tlSourceCfg.years.length - 1); }}
                className="p-1 rounded hover:bg-sky-500/20 text-sky-400 disabled:opacity-30"
                disabled={tlYearIdx === tlSourceCfg.years.length - 1}
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Play / Pause Toggle */}
            <Button
              size="sm"
              onClick={() => setIsPlaying((p) => !p)}
              className={`h-7 px-3 text-xs font-bold gap-1.5 shadow-sm transition-all active:scale-95 ${
                isPlaying
                  ? "bg-amber-600 hover:bg-amber-500 text-white animate-pulse"
                  : "bg-sky-600 hover:bg-sky-500 text-white"
              }`}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{isPlaying ? "Pause" : "Play Timelapse"}</span>
            </Button>

            {/* Load / Refresh Tile */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadTimelapseTile()}
              disabled={tlLoading}
              className="h-7 px-2.5 text-xs font-semibold gap-1.5 text-sky-300 border-sky-500/40 hover:bg-sky-500/10"
              title="Reload tile layer from Earth Engine"
            >
              {tlLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
              <span>{tlLoading ? "Loading..." : "Update Layer"}</span>
            </Button>

            {/* Opacity Control */}
            {timelapseTileUrl && (
              <div className="flex items-center gap-1.5 bg-background/80 px-2 py-0.5 rounded-lg border border-sky-500/30">
                <span className="text-[10px] text-muted-foreground font-mono">Opacity:</span>
                {[0.5, 0.75, 0.85, 1.0].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTlOpacity(val)}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-all ${
                      tlOpacity === val
                        ? "bg-sky-600 text-white font-bold shadow-sm"
                        : "text-muted-foreground hover:text-sky-300"
                    }`}
                  >
                    {Math.round(val * 100)}%
                  </button>
                ))}
              </div>
            )}

            {/* Extract Pixels Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => extractMut.mutate()}
              disabled={extractMut.isPending || allCombinedSamples.length === 0}
              className="h-7 px-2.5 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground"
              title="Extract multi-spectral pixel values from this timelapse year for digitized samples"
            >
              {extractMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              <span>Extract Pixels ({allCombinedSamples.length})</span>
            </Button>

            {/* Download CSV if extractResult is ready */}
            {extractResult && (
              <Button
                size="sm"
                onClick={downloadCsv}
                className="h-7 px-2.5 text-xs font-medium gap-1.5 bg-foreground text-background hover:bg-foreground/90 shadow-2xs"
                title="Download extracted training pixels CSV table"
              >
                <Download className="w-3 h-3" />
                <span>CSV ({extractResult.n_samples} px)</span>
              </Button>
            )}

            {/* Clear Layer */}
            {timelapseTileUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setTimelapseTileUrl(null); setTlStatus(""); }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Remove Timelapse Layer from Map"
              >
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Right Status Pill & Close */}
          <div className="flex items-center gap-3">
            {tlStatus && (
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                tlStatus.startsWith("⚠")
                  ? "bg-muted/50 border-border/60 text-muted-foreground"
                  : "bg-muted/50 border-border/60 text-foreground"
              }`}>
                {tlStatus}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsTimelapseDockOpen(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Close Timelapse Ribbon"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 relative overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full w-full">

        {/* 1. MAP & SAMPLES TAB */}
        <TabsContent value="map" className="h-full w-full m-0 p-0 flex absolute inset-0">
          <div className={`flex-none bg-card/90 backdrop-blur-xl border-r border-border/60 overflow-y-auto custom-scrollbar z-10 flex flex-col transition-all duration-300 shadow-xl ${
            isLeftPanelOpen ? "w-96 p-4 space-y-4" : "w-0 p-0 overflow-hidden border-r-0"
          }`}>
            {/* Table of Contents Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-muted/60 text-muted-foreground border border-border/50">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground/90">
                    {isFullMapMode ? "Training Samples (TOC)" : "Table of Contents"}
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {isFullMapMode ? "Classes & Ground Truth Only" : "Feature Layers & Basemap"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isFullMapMode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsClassPaletteModalOpen(true)}
                    className="h-6 px-1.5 text-[10px] font-medium text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 gap-0.5 cursor-pointer"
                    title="Add or manage classes"
                  >
                    + Class
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsLeftPanelOpen(false)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Collapse Table of Contents"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* TOC View Toolbar & Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded border border-border/50">
                  <button
                    type="button"
                    className="p-1 rounded bg-background text-foreground shadow-2xs"
                    title="List by Drawing Order"
                  >
                    <Layers className="w-3 h-3 text-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllSamples(!showAllSamples)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={showAllSamples ? "Hide All Layers" : "Show All Layers"}
                  >
                    {showAllSamples ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  {!isFullMapMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsAddDataModalOpen(true)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Add Data Layer"
                      >
                        <Upload className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsClassPaletteModalOpen(true)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Class Palette Studio"
                      >
                        <Palette className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("samples")}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Open Attribute Table"
                      >
                        <Table className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>

                <span className="text-[10px] font-mono text-muted-foreground/80">
                  {isFullMapMode ? `${allCombinedSamples.length} Samples` : "Drawing Order"}
                </span>
              </div>

              {/* Layer Filter Search */}
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-2 text-muted-foreground" />
                <input
                  value={tocFilter}
                  onChange={(e) => setTocFilter(e.target.value)}
                  placeholder="Filter layers &amp; classes..."
                  className="w-full pl-8 pr-2 py-1 text-xs rounded-md border border-border/60 bg-muted/20 focus:outline-none focus:ring-1 focus:ring-border h-7 font-sans"
                />
                {tocFilter && (
                  <button
                    type="button"
                    onClick={() => setTocFilter("")}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Layers Tree (Drawing Order) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-0.5">

              {/* ── 1. Operational Layer: Training Samples ── */}
              <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden shadow-2xs">
                {/* Group Header */}
                <div className="flex items-center justify-between p-2 bg-muted/30 border-b border-border/40 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setIsSamplesLayerExpanded((p) => !p)}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      title={isSamplesLayerExpanded ? "Collapse Layer Group" : "Expand Layer Group"}
                    >
                      {isSamplesLayerExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="checkbox"
                      checked={showAllSamples}
                      onChange={(e) => setShowAllSamples(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border/60 cursor-pointer"
                      title="Toggle visibility of all sample features"
                    />
                    <div className="flex items-center gap-1 truncate font-semibold text-foreground">
                      <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">Training Samples</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono bg-muted/40 text-muted-foreground border-border/50">
                      {allCombinedSamples.length}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveTab("samples")}
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-0.5"
                      title="Open Attribute Table for Training Samples"
                    >
                      <Table className="w-2.5 h-2.5" />
                      <span>Table</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsClassPaletteModalOpen(true)}
                      className="h-5 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      title="Add or manage classes"
                    >
                      + Class
                    </Button>
                  </div>
                </div>

                {/* Sub-items: Classes List */}
                {isSamplesLayerExpanded && (
                  <div className="p-1 space-y-0.5">
                    {Object.keys(groupedSamples).length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-muted-foreground">
                        No training samples yet. Click <strong>+ Class</strong> or <strong>Start Draw</strong> to digitize.
                      </div>
                    ) : (
                      Object.entries(groupedSamples)
                        .filter(([cName]) => !tocFilter || cName.toLowerCase().includes(tocFilter.toLowerCase()))
                        .map(([cName, group]) => {
                          const isHidden = !!hiddenClasses[cName];
                          const isCurrentActive = classLabel.toLowerCase() === cName.toLowerCase();
                          const count = group.items.length;
                          const swatchColor = getRefinedColor(group.color, cName);
                          return (
                            <div
                              key={cName}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors group ${
                                isCurrentActive
                                  ? "bg-muted/60 border border-border/60 text-foreground"
                                  : "hover:bg-muted/30 border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={!isHidden}
                                  onChange={() => {
                                    setHiddenClasses((prev) => ({ ...prev, [cName]: !prev[cName] }));
                                  }}
                                  className="h-3 w-3 rounded border-border/60 cursor-pointer shrink-0"
                                  title={`Toggle visibility for class '${cName}'`}
                                />
                                {/* Minimalist Symbology Swatch */}
                                <span
                                  className="w-3 h-3 rounded-xs border border-white/20 shadow-2xs shrink-0 cursor-pointer"
                                  style={{ backgroundColor: swatchColor }}
                                  onClick={() => {
                                    setClassLabel(cName);
                                    setColor(swatchColor);
                                    toast({ title: `Active Class: ${cName}`, description: "Selected for digitizing." });
                                  }}
                                  title={`Click to set '${cName}' as active drawing class`}
                                />
                                <span
                                  className={`truncate cursor-pointer font-medium ${
                                    isHidden ? "line-through text-muted-foreground/60" : "text-foreground"
                                  } ${isCurrentActive ? "font-semibold" : ""}`}
                                  onClick={() => {
                                    setClassLabel(cName);
                                    setColor(swatchColor);
                                    toast({ title: `Active Class: ${cName}`, description: "Selected for digitizing." });
                                  }}
                                >
                                  {cName}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isCurrentActive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-foreground inline-block mr-1" title="Currently active digitizing class" />
                                )}
                                <span className={`text-[10px] font-mono px-1 rounded ${count > 0 ? "bg-muted/60 text-muted-foreground" : "text-muted-foreground/40"}`}>
                                  {count}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setClassLabel(cName);
                                    setColor(swatchColor);
                                    if (!isEditing && studyArea) {
                                      setIsEditing(true);
                                      setSessionSamples([]);
                                      setTimeout(() => autoStartDrawMode(drawMode === "pan" ? "point" : drawMode, true), 200);
                                    }
                                  }}
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Digitize this class"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Delete all samples for class '${cName}'?`)) {
                                      deleteClassMut.mutate(cName);
                                    }
                                  }}
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete class samples"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>



            {!isFullMapMode && (
              <>
                {/* ── 3. Model Layer: Supervised Classification Raster (if active) ── */}
                {classifyResult?.tile_url && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs shadow-2xs space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={showClassifyResult}
                          onChange={(e) => setShowClassifyResult(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border/60 cursor-pointer shrink-0"
                          title="Toggle classification raster overlay"
                        />
                        <div className="w-3.5 h-3.5 rounded-xs bg-muted border border-border shrink-0 shadow-2xs" />
                        <span className="font-medium text-foreground truncate">Supervised Map</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {classifyResult.accuracy?.is_evaluated && typeof classifyResult.accuracy.overall_accuracy === "number" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono border-border/60 text-muted-foreground bg-muted/40">
                            {(classifyResult.accuracy.overall_accuracy * 100).toFixed(0)}% Acc
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setClassifyResult(null)}
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                          title="Clear classification raster"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 4. Remote Sensing Layer: Timelapse / Satellite Imagery (if active) ── */}
                {timelapseTileUrl && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs shadow-2xs space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={!!timelapseTileUrl}
                          onChange={() => {
                            if (timelapseTileUrl) setTimelapseTileUrl(null);
                            else loadTimelapseTile();
                          }}
                          className="h-3.5 w-3.5 rounded border-border/60 cursor-pointer shrink-0"
                          title="Toggle satellite timelapse imagery"
                        />
                        <Satellite className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate">
                          {tlSource === "sentinel2" ? "Sentinel-2" : tlSource === "landsat" ? "Landsat-8" : "GEDI LiDAR"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono border-border/60 text-muted-foreground bg-muted/40">
                        {tlYear} ({Math.round(tlOpacity * 100)}%)
                      </Badge>
                    </div>
                  </div>
                )}

                {/* ── 5. Analytical Layer: Spatial Sampling Bias (1km Rings) ── */}
                <div className="rounded-lg border border-border/50 bg-card/40 p-2 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={showCoverageBuffers}
                        onChange={(e) => setShowCoverageBuffers(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border/60 cursor-pointer shrink-0"
                        title="Toggle 1km spatial sampling bias coverage rings"
                      />
                      <div className="w-3.5 h-3.5 rounded-full border border-dashed border-muted-foreground/60 shrink-0" />
                      <span className="font-medium text-foreground truncate">1km Bias Rings</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono text-muted-foreground border-border/50">
                      Buffer
                    </Badge>
                  </div>
                </div>

                {/* ── 6. Basemap Layer ── */}
                <div className="rounded-lg border border-border/50 bg-card/40 p-2 text-xs shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={mapStyle !== "none"}
                        onChange={(e) => setMapStyle(e.target.checked ? "satellite" : "none")}
                        className="h-3.5 w-3.5 rounded border-border/60 cursor-pointer shrink-0"
                        title="Toggle basemap"
                      />
                      <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">Basemap</span>
                    </div>
                    <select
                      value={mapStyle}
                      onChange={(e) => setMapStyle(e.target.value as any)}
                      className="bg-muted/50 text-[10px] px-1.5 py-0.5 rounded border border-border/50 font-medium h-6 focus:outline-none text-foreground"
                    >
                      <option value="satellite">Esri Satellite</option>
                      <option value="osm">OpenStreetMap</option>
                      <option value="none">Blank</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            </div>

            {/* Contents Pane Footer: Dataset Readiness & Quality Diagnostics (or Focused Mode switcher) */}
            {isFullMapMode ? (
              <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
                <div className="p-2.5 rounded-lg border border-border/60 bg-muted/30 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] text-foreground flex items-center gap-1">
                      <Info className="w-3 h-3 text-sky-400" />
                      Focused Training TOC
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 h-4 border-border/50 text-muted-foreground">
                      {allCombinedSamples.length} Samples
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    All digitized samples and trained models are continuously synchronized live. To add external data layers or inspect attribute tables, return to the mother page.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsFullMapMode(false)}
                    className="w-full h-7 text-xs border-border/60 hover:bg-muted text-foreground gap-1.5 mt-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Return to Mother Page</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
                <button
                  type="button"
                  onClick={() => setIsReadinessModalOpen(true)}
                  className="w-full p-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/50 text-left transition-colors shadow-2xs"
                  title="Click to inspect ML Dataset Readiness &amp; Quality Diagnostics"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-foreground/90">
                      <span className={`w-1.5 h-1.5 rounded-full ${classBalanceMetrics.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"}`} />
                      Dataset Health
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 h-4 border-border/50 text-muted-foreground bg-muted/40">
                      {classBalanceMetrics.status === "healthy" ? "Healthy" : classBalanceMetrics.status === "imbalanced" ? "Imbalanced" : "Low Samples"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {classBalanceMetrics.message}
                  </p>
                </button>

                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-1">
                  <span>{Object.keys(groupedSamples).length} Classes &bull; {allCombinedSamples.length} Samples</span>
                  <span className="font-medium text-muted-foreground">{isEditing ? "● Digitizing" : "○ Ready"}</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Right Main Panel: Map area with Docked Top Sub-Bar (Option 1) */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Docked Map Top Sub-Bar (Hidden in Full Map Mode since tools are in top bar) */}
            {!isFullMapMode && (
              <div className="flex-none bg-card/90 backdrop-blur-md border-b border-border/60 px-3 py-2 z-10 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              {/* Left: Sidebar Toggle, Study Area, Class Palette, Readiness, Vector Draw & Session */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Left Sidebar Toggle Button */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsLeftPanelOpen((p) => !p)}
                    className="h-8 px-2 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                    title={isLeftPanelOpen ? "Collapse Side Panel (Full Map View)" : "Expand Side Panel"}
                  >
                    {isLeftPanelOpen ? (
                      <>
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline text-[11px]">Hide Panel</span>
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline text-[11px]">Show Panel</span>
                      </>
                    )}
                  </Button>

                  <div className="h-4 w-[1px] bg-border/60 mx-0.5 hidden sm:block" />

                  {/* Study Area (AOI) Control Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsStudyAreaModalOpen(true)}
                    className={`h-8 gap-1.5 text-xs font-medium px-2.5 transition-all shadow-2xs ${
                      !studyArea
                        ? "border-sky-500/70 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 hover:border-sky-400 font-semibold ring-1 ring-sky-500/30"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                    }`}
                    title={!studyArea ? "Prerequisite: Define or Upload Study Area (AOI) to unlock training tools" : "Configure or inspect Study Area (AOI)"}
                  >
                    {!studyArea ? (
                      <>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400"></span>
                        </span>
                        <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                        <span>1. Define AOI</span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-500/25 text-sky-300 border border-sky-500/40">Req</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>AOI: Defined</span>
                      </>
                    )}
                  </Button>

                  {/* Active Class Swatch & Palette Studio Trigger */}
                  <button
                    type="button"
                    onClick={() => setIsClassPaletteModalOpen(true)}
                    className="flex items-center gap-1.5 hover:bg-muted/50 px-2.5 py-1 h-8 rounded-md text-xs font-medium transition-all border border-border/60 bg-muted/20 shadow-2xs text-foreground"
                    title="Open Land Cover Class Palette Studio"
                  >
                    <span className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs shrink-0" style={{ backgroundColor: getRefinedColor(color, classLabel) }} />
                    <span className="max-w-[100px] truncate">{classLabel || "Select Class"}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border/50 bg-muted/40">
                      {groupedSamples[classLabel]?.items.length || 0}
                    </Badge>
                    <Palette className="w-3 h-3 text-muted-foreground ml-0.5" />
                  </button>

                  {/* Dataset Readiness & Quality Monitor Button */}
                  <button
                    type="button"
                    onClick={() => setIsReadinessModalOpen(true)}
                    className="px-2.5 h-8 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border border-border/60 bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground shadow-2xs"
                    title="Inspect Dataset Readiness &amp; Sample Quality Balance"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${classBalanceMetrics.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <span className="hidden sm:inline">Readiness:</span>
                    <span>{classBalanceMetrics.status === "healthy" ? "Healthy" : classBalanceMetrics.status === "imbalanced" ? "Imbalanced" : classBalanceMetrics.status === "low_samples" ? "Low Samples" : "Ready"}</span>
                  </button>

                  <div className="h-4 w-[1px] bg-border/60 mx-0.5 hidden sm:block" />

                  {/* Vector Drawing Tools */}
                  <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-lg border border-border/50">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-1 hidden sm:inline-block">Draw:</span>
                    <button
                      type="button"
                      title="Pan Mode (Navigation)"
                      onClick={() => { 
                        cancelDrawMode(); 
                        setDrawMode("pan"); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        drawMode === "pan" ? "bg-foreground text-background shadow-xs font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Hand className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={!studyArea ? "Study Area (AOI) required before drawing points" : "Point Feature (Single coordinate sample)"}
                      onClick={() => { 
                        if (!studyArea) {
                          toast({ title: "Study Area Required", description: "Please define an AOI boundary before selecting drawing tools.", variant: "destructive" });
                          return;
                        }
                        setDrawMode("point"); 
                        autoStartDrawMode("point", isEditing); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        !studyArea
                          ? "opacity-30 cursor-not-allowed text-muted-foreground/40 hover:bg-transparent"
                          : drawMode === "point"
                            ? "bg-foreground text-background shadow-xs font-semibold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={!studyArea ? "Study Area (AOI) required before drawing lines" : "Polyline Feature (Linear sample / transect)"}
                      onClick={() => { 
                        if (!studyArea) {
                          toast({ title: "Study Area Required", description: "Please define an AOI boundary before selecting drawing tools.", variant: "destructive" });
                          return;
                        }
                        setDrawMode("polyline"); 
                        autoStartDrawMode("polyline", isEditing); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        !studyArea
                          ? "opacity-30 cursor-not-allowed text-muted-foreground/40 hover:bg-transparent"
                          : drawMode === "polyline"
                            ? "bg-foreground text-background shadow-xs font-semibold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={!studyArea ? "Study Area (AOI) required before drawing polygons" : "Polygon Feature (Area polygon sample)"}
                      onClick={() => { 
                        if (!studyArea) {
                          toast({ title: "Study Area Required", description: "Please define an AOI boundary before selecting drawing tools.", variant: "destructive" });
                          return;
                        }
                        setDrawMode("polygon"); 
                        autoStartDrawMode("polygon", isEditing); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        !studyArea
                          ? "opacity-30 cursor-not-allowed text-muted-foreground/40 hover:bg-transparent"
                          : drawMode === "polygon"
                            ? "bg-foreground text-background shadow-xs font-semibold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={!studyArea ? "Study Area (AOI) required before drawing rectangles" : "Rectangle Box"}
                      onClick={() => { 
                        if (!studyArea) {
                          toast({ title: "Study Area Required", description: "Please define an AOI boundary before selecting drawing tools.", variant: "destructive" });
                          return;
                        }
                        setDrawMode("rectangle"); 
                        autoStartDrawMode("rectangle", isEditing); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        !studyArea
                          ? "opacity-30 cursor-not-allowed text-muted-foreground/40 hover:bg-transparent"
                          : drawMode === "rectangle"
                            ? "bg-foreground text-background shadow-xs font-semibold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={!studyArea ? "Study Area (AOI) required before drawing circular buffers" : "Circle Buffer"}
                      onClick={() => { 
                        if (!studyArea) {
                          toast({ title: "Study Area Required", description: "Please define an AOI boundary before selecting drawing tools.", variant: "destructive" });
                          return;
                        }
                        setDrawMode("circle"); 
                        autoStartDrawMode("circle", isEditing); 
                      }}
                      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                        !studyArea
                          ? "opacity-30 cursor-not-allowed text-muted-foreground/40 hover:bg-transparent"
                          : drawMode === "circle"
                            ? "bg-foreground text-background shadow-xs font-semibold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Circle className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Edit Session Controls */}
                  {!isEditing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!studyArea}
                      onClick={() => {
                        if (!studyArea) {
                          toast({
                            variant: "destructive",
                            title: "Study Area Required",
                            description: "Please define an AOI boundary before starting a digitization session.",
                          });
                          return;
                        }
                        setIsEditing(true);
                        setSessionSamples([]);
                        toast({ title: "Edit Session Started", description: `Digitizing '${classLabel}'. Click on map to add features.` });
                        setTimeout(() => autoStartDrawMode(drawMode === "pan" ? "point" : drawMode, true), 300);
                      }}
                      className={`font-medium gap-1.5 text-xs shadow-2xs h-8 px-3 transition-all ${
                        !studyArea
                          ? "opacity-40 cursor-not-allowed border-dashed border-border/50 text-muted-foreground/50 bg-muted/10 hover:bg-muted/10 hover:text-muted-foreground/50 pointer-events-auto"
                          : "bg-foreground text-background hover:bg-foreground/90 font-semibold border border-foreground/30 shadow-xs active:scale-95 cursor-pointer"
                      }`}
                      title={!studyArea ? "Action Locked: Define Study Area (AOI) first to start drawing features" : "Start digitizing samples on the map"}
                    >
                      {!studyArea ? (
                        <>
                          <Lock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          <span className="text-muted-foreground/50">Start Draw ({classLabel || "Class"})</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-muted/30 text-muted-foreground/50 border border-border/30">Locked</span>
                        </>
                      ) : (
                        <>
                          <Edit className="w-3.5 h-3.5 text-background shrink-0" />
                          <span>Start Draw ({classLabel || "Class"})</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="font-medium gap-1 text-xs shadow-2xs h-8 px-2.5"
                        onClick={handleStopSession}
                        title="Halt digitization session"
                      >
                        <StopCircle className="w-3.5 h-3.5" /> Stop Draw
                      </Button>
                      {sessionSamples.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-medium gap-1 text-xs shadow-2xs h-8 border-border/60 hover:bg-muted/50 text-foreground px-2.5"
                          onClick={() => {
                            setDatasetNameInput(`Training_Session_${new Date().toISOString().slice(0, 10)}`);
                            setIsSaveModalOpen(true);
                          }}
                          title="Save buffered session features"
                        >
                          <Save className="w-3.5 h-3.5" /> Save Batch ({sessionSamples.length})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

              {/* Contextual Status Banners (Docked directly beneath sub-bar) */}
              {!studyArea && !isDrawingStudyArea && (
                <div className="flex-none flex items-center justify-between bg-card/95 backdrop-blur-md border-b border-sky-500/25 px-4 py-2 text-xs shadow-2xs animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                      <Crosshair className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sky-200">Prerequisite Step:</span>
                      <span className="text-foreground">Define Study Area (AOI) to delineate your spatial boundary.</span>
                      <span className="text-[11px] text-muted-foreground hidden lg:inline">Digitization tools and ML training remain locked until an AOI is set.</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setIsStudyAreaModalOpen(true)}
                    className="h-7 text-xs gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold px-3 shadow-xs transition-all active:scale-95 shrink-0"
                  >
                    <Crosshair className="w-3.5 h-3.5" /> Define Study Area
                  </Button>
                </div>
              )}

              {isDrawingStudyArea && (
                <div className="flex-none flex items-center justify-between bg-card/95 backdrop-blur-md border-b border-sky-500/40 px-4 py-2 text-xs animate-in fade-in shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                      <Crosshair className="w-3.5 h-3.5 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sky-300">Defining Study Area:</span>
                      <span className="text-foreground">
                        {aoiDrawShape === "rectangle" 
                          ? "Click & drag or click opposite corners on map to define rectangular boundary."
                          : "Click vertices on the map, then click the starting vertex to close polygon."}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md border border-border/60">
                      <button
                        type="button"
                        onClick={() => startAoiDrawing("rectangle")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          aoiDrawShape === "rectangle"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                        title="Draw rectangular bounding box AOI"
                      >
                        Box (Rectangle)
                      </button>
                      <button
                        type="button"
                        onClick={() => startAoiDrawing("polygon")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          aoiDrawShape === "polygon"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                        title="Draw freeform polygon AOI"
                      >
                        Freeform Polygon
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1 px-2.5"
                    onClick={cancelAoiDrawing}
                    title="Cancel AOI drawing"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel Drawing
                  </Button>
                </div>
              )}

              {classifyResult?.tile_url && (
                <div className="flex-none flex items-center justify-between bg-muted/80 backdrop-blur-md border-b border-border/60 px-4 py-2 text-xs animate-in fade-in shadow-2xs">
                  <span className="flex items-center gap-2 text-foreground font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                    Supervised Classification Map Overlay Active
                    {classifyResult.accuracy && (
                      classifyResult.accuracy.is_evaluated && typeof classifyResult.accuracy.overall_accuracy === "number" ? (
                        <Badge variant="outline" className="border-border/60 text-muted-foreground bg-muted/40 font-mono text-[10px] ml-2">
                          Overall Accuracy: {(classifyResult.accuracy.overall_accuracy * 100).toFixed(1)}% | Kappa: {typeof classifyResult.accuracy.kappa === "number" ? classifyResult.accuracy.kappa.toFixed(3) : "N/A"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border/60 text-muted-foreground bg-muted/40 font-mono text-[10px] ml-2">
                          Holdout validation: sample count too small for test split
                        </Badge>
                      )
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

              {isEditing && (
                <div className="flex-none flex items-center justify-between bg-muted/80 backdrop-blur-md border-b border-border/60 px-4 py-2 text-xs animate-in fade-in shadow-2xs">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    <span>Active Digitization Session: {sessionSamples.length} feature(s) buffered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-foreground text-background hover:bg-foreground/90 font-medium px-2.5 rounded-md"
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

              {previewGeoJSON && (
                <div className="flex-none flex items-center justify-between bg-muted/80 backdrop-blur-md border-b border-border/60 px-4 py-2 text-xs shadow-2xs">
                  <span className="flex items-center gap-2 text-foreground font-medium">
                    <Database className="w-4 h-4 text-muted-foreground" /> Active Map Overlay: {previewDatasetName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-border/60 text-foreground hover:bg-muted/50"
                      onClick={() => importDatasetMut.mutate()}
                      disabled={importDatasetMut.isPending}
                    >
                      {importDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Push to GEE Training Samples
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
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

              {nativePreviewUrl && (
                <div className="flex-none flex items-center justify-between bg-muted/80 backdrop-blur-md border-b border-border/60 px-4 py-2 text-xs animate-in fade-in shadow-2xs">
                  <span className="flex items-center gap-2 text-foreground font-medium">
                    <Layers className="w-4 h-4 text-muted-foreground" /> Active Raster Preview: {nativePreviewName || customAssetId || "GeoTIFF Layer"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setNativePreviewUrl(null);
                        setClassificationSource("sentinel2");
                      }}
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Clear Raster Overlay
                    </Button>
                  </div>
                </div>
              )}

              {/* Map Container: Fills 100% of remaining flex space unobstructed */}
              <div className="flex-1 relative w-full h-full bg-muted/10">

                {/* Floating Top-Left Map Controls: Basemap, Add Data, Layers, Bias Rings */}
                <div className="absolute top-3 left-14 z-[1000] pointer-events-auto flex items-center gap-1.5 p-1 bg-card/95 backdrop-blur-md rounded-lg border border-border/80 shadow-md">
                  {/* Basemap Select */}
                  <select 
                    value={mapStyle} 
                    onChange={(e) => setMapStyle(e.target.value as "osm" | "satellite" | "none")}
                    className="bg-muted/60 text-xs px-2 py-1 rounded-md border border-border/60 font-medium h-7 focus:outline-none text-foreground shadow-2xs cursor-pointer hover:bg-muted/80"
                    title="Select background basemap style"
                  >
                    <option value="satellite">Esri Satellite</option>
                    <option value="osm">OpenStreetMap</option>
                    <option value="none">Blank Canvas</option>
                  </select>

                  {/* Add Data (Only in Mother Page Studio mode) */}
                  {!isFullMapMode && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddDataModalOpen(true)}
                      className={`text-xs h-7 flex items-center gap-1.5 border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground px-2 rounded-md transition-colors shadow-2xs cursor-pointer ${uploadBusy ? 'opacity-50 pointer-events-none' : ''}`}
                      title="Upload Shapefile, GeoJSON, or GeoTIFF"
                    >
                      {uploadBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{uploadBusy ? 'Uploading...' : 'Add Data'}</span>
                    </Button>
                  )}

                  <div className="h-4 w-[1px] bg-border/60 mx-0.5" />

                  {/* Layer Visibility Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAllSamples(!showAllSamples)}
                    className={`px-2 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border border-border/60 shadow-2xs cursor-pointer ${
                      showAllSamples ? "bg-muted/60 text-foreground" : "bg-muted/20 text-muted-foreground hover:bg-muted/50"
                    }`}
                    title="Toggle visibility of all sample markers on the map"
                  >
                    {showAllSamples ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{showAllSamples ? "Layers Visible" : "Layers Hidden"}</span>
                  </button>

                  {Object.keys(hiddenClasses).filter((k) => hiddenClasses[k]).length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono shadow-2xs border-border/50 text-muted-foreground bg-muted/40">
                      {Object.keys(hiddenClasses).filter((k) => hiddenClasses[k]).length} hidden
                    </Badge>
                  )}

                  {/* Sampling Bias Rings Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowCoverageBuffers(!showCoverageBuffers)}
                    className={`px-2 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border border-border/60 shadow-2xs cursor-pointer ${
                      showCoverageBuffers 
                        ? "bg-muted/70 text-foreground font-medium" 
                        : "bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    title="Toggle 1km buffer coverage rings around point samples to evaluate spatial clustering and sampling bias"
                  >
                    <Compass className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{showCoverageBuffers ? "1km Bias Rings (Active)" : "1km Bias Rings"}</span>
                  </button>

                  <div className="h-4 w-[1px] bg-border/60 mx-0.5" />

                  {/* Full Map / Mother Page Mode Toggle */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isFullMapMode) {
                        setIsFullMapMode(false);
                      } else {
                        setActiveTab("map");
                        setIsFullMapMode(true);
                      }
                    }}
                    className={`h-7 px-2 text-xs font-semibold gap-1.5 border shadow-2xs cursor-pointer transition-all active:scale-95 ${
                      isFullMapMode
                        ? "bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25"
                        : "border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground"
                    }`}
                    title={isFullMapMode ? "Return to Mother Page (Full Studio)" : "Expand to Full Map Mode"}
                  >
                    {isFullMapMode ? (
                      <>
                        <ChevronLeft className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-sky-300 font-semibold">Mother Page</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="hidden sm:inline">Full Map</span>
                      </>
                    )}
                  </Button>
                </div>

                <MapContainer center={[-1.94, 29.87]} zoom={9} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                  <MapBoundsController bbox={activeBbox} />
                  <MapInstanceCapturer onMapInstance={(m) => { mapInstanceRef.current = m; }} />

                  <FeatureGroup ref={studyAreaGroupRef}>
                    {isDrawingStudyArea && (
                      <EditControl
                        position="topright"
                        onCreated={(e: any) => {
                          const geojson = e.layer.toGeoJSON();
                          if (studyAreaGroupRef.current) {
                            try {
                              studyAreaGroupRef.current.clearLayers();
                            } catch {}
                          }
                          if (e.layer && e.layer.remove) {
                            try {
                              e.layer.remove();
                            } catch {}
                          }
                          const normalized = normalizeToFeatureCollection(geojson);
                          setStudyArea(normalized);
                          setIsDrawingStudyArea(false);
                          try {
                            const bbox = turf.bbox(normalized);
                            if (bbox && bbox.length === 4) {
                              setActiveBbox(bbox);
                            }
                          } catch {}
                          toast({ title: "Study Area Defined", description: "Spatial boundary locked. Ready to digitize samples." });
                        }}
                        draw={{
                          marker: false,
                          polyline: false,
                          polygon: aoiDrawShape === "polygon" ? { showArea: false, shapeOptions: { color: "#38bdf8", weight: 2, fillOpacity: 0.08, dashArray: "4,4" } } : false,
                          rectangle: aoiDrawShape === "rectangle" ? { showArea: false, shapeOptions: { color: "#38bdf8", weight: 2, fillOpacity: 0.08, dashArray: "4,4" } } : false,
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
                      style={{ color: "#38bdf8", weight: 1.5, fillOpacity: 0.04, dashArray: "4,4" }}
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
                  {/* Timelapse GEE imagery layer – sits between basemap and samples */}
                  {timelapseTileUrl && (
                    <TileLayer
                      key={timelapseTileUrl}
                      url={timelapseTileUrl}
                      attribution={`GEE ${tlSourceCfg.label} ${tlYear}`}
                      opacity={tlOpacity}
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
                        color: "#38bdf8",
                        fillColor: "#38bdf8",
                        fillOpacity: 0.15,
                        weight: 1.5,
                        dashArray: "3,3",
                      })}
                    />
                  )}
                  {showAllSamples &&
                    Object.entries(groupedSamples).map(([cName, group]) => {
                      if (hiddenClasses[cName]) return null;

                      const refinedGroupColor = getRefinedColor(group.color);
                      const featureCollection = {
                        type: "FeatureCollection",
                        features: group.items
                          .filter(s => s.geometry)
                          .map((s) => ({
                            type: "Feature",
                            geometry: s.geometry,
                            properties: { color: getRefinedColor(s.color || group.color), class_label: cName, creator: s.creator },
                          })),
                      };

                      if (featureCollection.features.length === 0) return null;

                      return (
                        <GeoJSON
                          key={`${cName}-${group.items.length}-${hiddenClasses[cName] ? "hid" : "vis"}`}
                          data={featureCollection as any}
                          pointToLayer={(feat, latlng) =>
                            L.circleMarker(latlng, {
                              radius: 6,
                              fillColor: feat.properties.color,
                              color: "#FFFFFF",
                              weight: 1.5,
                              opacity: 0.95,
                              fillOpacity: 0.9,
                            })
                          }
                          style={(feat: any) => {
                            const c = feat?.properties?.color || refinedGroupColor;
                            return {
                              color: c,
                              fillColor: c,
                              fillOpacity: 0.35,
                              weight: 1.5,
                            };
                          }}
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
                      const ringColor = getRefinedColor(s.color || "#64748b");
                      return (
                        <LeafletPolygon
                          key={"buf_" + s.id}
                          positions={[
                            [lat - delta, lng - delta],
                            [lat + delta, lng - delta],
                            [lat + delta, lng + delta],
                            [lat - delta, lng + delta],
                          ]}
                          color={ringColor}
                          fillColor={ringColor}
                          fillOpacity={0.06}
                          weight={1}
                          pathOptions={{ dashArray: "3,3" }}
                        />
                      );
                    })}

                  {activePoints.length >= 2 && (drawMode === "polyline" || drawMode === "polygon") && (
                    <LeafletPolyline positions={activePoints} color="#38bdf8" weight={2} pathOptions={{ dashArray: "4,4" }} />
                  )}
                  {activePoints.length >= 3 && drawMode === "polygon" && (
                    <LeafletPolygon positions={activePoints} color="#38bdf8" fillColor="#38bdf8" fillOpacity={0.15} weight={2} />
                  )}
                </MapContainer>
              </div>
            </div>
        </TabsContent>

        {/* 1b. SAMPLES DIRECTORY TAB */}
        <TabsContent value="samples" className="h-full overflow-y-auto p-4 space-y-4">
          {/* GROUPED & SORTED TRAINING SAMPLES DIRECTORY */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 rounded-lg border border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-muted/60 border border-border/60 flex items-center justify-center text-foreground">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight text-foreground">Training Samples Directory</h3>
                  <p className="text-xs text-muted-foreground">
                    Grouped by class label ({Object.keys(groupedSamples).length} classes, {samples.length} total features)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    placeholder="Filter classes..."
                    className="pl-8 pr-3 py-1 text-xs rounded-md border border-input bg-background w-44 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-border/60 text-foreground hover:bg-muted" onClick={downloadGeoJSON} disabled={samples.length === 0} title="Export as GeoJSON file">
                  <Download className="w-3.5 h-3.5" /> GeoJSON
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 border-border/60 text-foreground hover:bg-muted font-medium disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none"
                  onClick={downloadShapefile}
                  disabled={samples.length === 0}
                  title="Export as ESRI Shapefile (.zip)"
                >
                  <Download className="w-3.5 h-3.5" /> Shapefile
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 border-border/60 text-foreground hover:bg-muted font-medium disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none"
                  onClick={() => spectralProfilesMut.mutate()}
                  disabled={spectralProfilesMut.isPending || allCombinedSamples.length === 0}
                  title="Extract multi-spectral reflectance profiles across Sentinel-2 bands"
                >
                  {spectralProfilesMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                  Spectral Curves
                </Button>

                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-8 bg-foreground text-background hover:bg-foreground/90 font-medium shadow-2xs disabled:opacity-35 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground/40 disabled:border-border/30 disabled:shadow-none disabled:pointer-events-none"
                  onClick={trainSupervisedClassifierDirectly}
                  disabled={classifyMut.isPending || allCombinedSamples.length === 0}
                  title="Train Supervised Random Forest Classifier directly on digitized samples"
                >
                  {classifyMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                  Train Classifier
                </Button>
              </div>
            </div>

            {/* Class Balance & Dataset Health Indicator */}
            {allCombinedSamples.length > 0 && (
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 text-xs flex items-center justify-between text-foreground">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${
                    classBalanceMetrics.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"
                  }`} />
                  <span>
                    <strong className="font-medium text-foreground">Dataset Health:</strong> <span className="text-muted-foreground">{classBalanceMetrics.message}</span>
                  </span>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0 uppercase tracking-wider bg-background/80 border-border/60 text-muted-foreground">
                  {classBalanceMetrics.status.replace("_", " ")}
                </Badge>
              </div>
            )}

            {isLoadingSamples ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading digitized samples…
              </div>
            ) : Object.keys(groupedSamples).length === 0 ? (
              <div className="rounded-lg border border-border/60 p-8 text-center text-muted-foreground text-xs">
                No training samples digitized yet. Select a class in the digitizer to begin collecting features.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedSamples)
                  .filter(([cName]) => !classFilter || cName.toLowerCase().includes(classFilter.toLowerCase()))
                  .map(([cName, group]) => {
                    const refinedColor = getRefinedColor(group.color);
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
                      <div key={cName} className={`rounded-lg border border-border/60 overflow-hidden bg-card shadow-2xs transition-opacity ${isHidden ? "opacity-60" : ""}`}>
                        {/* Class Sub-header */}
                        <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between border-b border-border/60">
                          <div className="flex items-center gap-2.5">
                            <span className="w-3 h-3 rounded-full inline-block shrink-0 shadow-2xs border border-white/20" style={{ backgroundColor: refinedColor }} />
                            <span className="font-medium text-xs tracking-wide text-foreground">{cName}</span>
                            <Badge variant="outline" className="text-[11px] bg-background font-mono px-2 py-0.5 border-border/60 text-muted-foreground">
                              {group.items.length} features
                            </Badge>
                            {group.items.length < 5 ? (
                              <Badge variant="outline" className="text-[10px] bg-muted/40 text-muted-foreground border-border/60">
                                Low count (&lt;5)
                              </Badge>
                            ) : group.items.length < 10 ? (
                              <Badge variant="outline" className="text-[10px] bg-muted/40 text-foreground border-border/60">
                                Adequate ({group.items.length})
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-muted/40 text-foreground border-border/60">
                                Robust ({group.items.length})
                              </Badge>
                            )}
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-2">
                              {typeCounts.polygons > 0 && <span className="bg-background border border-border/50 px-2 py-0.5 rounded font-mono text-[10px]">{typeCounts.polygons} Polygon</span>}
                              {typeCounts.points > 0 && <span className="bg-background border border-border/50 px-2 py-0.5 rounded font-mono text-[10px]">{typeCounts.points} Point</span>}
                              {typeCounts.lines > 0 && <span className="bg-background border border-border/50 px-2 py-0.5 rounded font-mono text-[10px]">{typeCounts.lines} Line</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleClassVisibility(cName)}
                              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 border shadow-2xs ${
                                !isHidden
                                  ? "bg-muted/60 text-foreground border-border/60 hover:bg-muted"
                                  : "bg-background text-muted-foreground border-border/40 hover:bg-muted/40"
                              }`}
                              title={!isHidden ? `Hide class '${cName}' on map` : `Show class '${cName}' on map`}
                            >
                              {!isHidden ? <Eye className="w-3.5 h-3.5 text-foreground" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                              {!isHidden ? "Visible" : "Hidden"}
                            </button>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1.5 px-2.5 font-medium text-muted-foreground hover:text-destructive"
                              title={`Delete all samples for class '${cName}'`}
                              disabled={deleteClassMut.isPending}
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete all ${group.items.length} sample(s) in class '${cName}'?`)) {
                                  deleteClassMut.mutate(cName);
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete Class
                            </Button>
                          </div>
                        </div>

                        {/* Class Sub-items Attribute Table */}
                        <table className="w-full text-xs">
                          <thead className="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border/60">
                            <tr>
                              <th className="text-left px-4 py-2 w-16">FID</th>
                              <th className="text-left px-4 py-2 w-36">Class</th>
                              <th className="text-left px-4 py-2">Geometry Coordinates</th>
                              <th className="text-right px-4 py-2 w-24">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((s, idx) => {
                              const gType = s.geometry?.type ?? "Point";
                              const fidNumber = idx + 1;
                              return (
                                <tr key={s.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                                  {/* Column 1: FID */}
                                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                    #{fidNumber}
                                  </td>
                                  {/* Column 2: Class Name */}
                                  <td className="px-4 py-2 font-medium text-xs flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0 border border-white/20" style={{ backgroundColor: refinedColor }} />
                                    <span>{cName}</span>
                                  </td>
                                  {/* Column 3: Geometry & Point Coordinates */}
                                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                                    {gType === "Point" ? (
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-foreground font-medium">Point</span>
                                        <span className="text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/40 text-[11px]">
                                          [{s.geometry?.coordinates?.[0]}, {s.geometry?.coordinates?.[1]}]
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-foreground font-medium">
                                          {gType}
                                        </span>
                                        <span className="text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/40 text-[11px] truncate max-w-xs inline-block">
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
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
        <TabsContent value="classify" className="h-full overflow-y-auto p-4 space-y-6">
          <div className="border border-border/60 rounded-lg p-5 bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-base flex items-center gap-2 text-foreground">
                  <Sparkles className="w-4 h-4 text-foreground" />
                  Random Forest Supervised Classification
                </h3>
                <p className="text-xs text-muted-foreground">
                  Trains a Random Forest classifier (50 decision trees) using your {samples.length} digitized training sample(s).
                </p>
              </div>
            </div>

            {previewDatasetName && (
              <div className="bg-muted/30 border border-border/60 p-3 rounded-lg text-xs text-foreground flex items-center justify-between animate-in fade-in">
                <span className="flex items-center gap-2 font-medium">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  Linked Imagery Source from RARE DATA: <strong className="text-foreground">{previewDatasetName}</strong>
                </span>
                <Badge variant="outline" className="border-border/60 text-muted-foreground bg-muted/40 font-mono text-[10px]">
                  Directly Compatible
                </Badge>
              </div>
            )}

            <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/60">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Imagery Source for ML Training</Label>
                <select
                  value={classificationSource}
                  onChange={(e) => setClassificationSource(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring font-medium"
                >
                  <option value="sentinel2">Sentinel-2 SR (10m Multi-spectral - Default)</option>
                  <option value="landsat8">Landsat 8 SR (30m Multi-spectral)</option>
                  <option value="custom">
                    {previewDatasetName ? `Imported RARE DATA: ${previewDatasetName}` : "Custom GEE Asset / Imported Imagery"}
                  </option>
                  <option value="native_cog">Native COG (Local scikit-learn Classification)</option>
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

              {/* 3x3 Majority Sieve (MMU Noise Filter) Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                <div className="space-y-0.5">
                  <Label htmlFor="apply-sieve" className="text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-primary" />
                    3×3 Majority Sieve (MMU Noise Filter)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Eliminates isolated speckle pixels ("salt-and-pepper" noise) using focal mode majority filtering for clean cartographic parcel boundaries.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="apply-sieve"
                  checked={applySieve}
                  onChange={(e) => setApplySieve(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer ml-3"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => spectralProfilesMut.mutate()}
                disabled={spectralProfilesMut.isPending || allCombinedSamples.length === 0}
                className="gap-2 border-border/60 text-foreground hover:bg-muted font-medium"
              >
                {spectralProfilesMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4 text-muted-foreground" />
                )}
                Analyze Spectral Curves
              </Button>

              <Button
                onClick={() => classifyMut.mutate()}
                disabled={classifyMut.isPending || samples.length === 0 || ((classificationSource === "custom" || classificationSource === "native_cog") && !customAssetId)}
                className="gap-2 bg-foreground text-background hover:bg-foreground/90 font-medium w-full sm:w-auto shadow-2xs"
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
              <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-md border border-border/50">
                Please digitize at least 2 samples with different class labels before running classification.
              </p>
            )}

            {classifyResult && (
              <div className="space-y-4 pt-4 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-400" /> Classification map rendered
                    
                    <div className="ml-4 flex items-center gap-2 text-foreground">
                      <input
                        type="checkbox"
                        id="show-classify"
                        checked={showClassifyResult}
                        onChange={(e) => setShowClassifyResult(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border text-foreground focus:ring-1 focus:ring-ring"
                      />
                      <Label htmlFor="show-classify" className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                        Show on Map
                      </Label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {classifyResult.accuracy && (
                      classifyResult.accuracy.is_evaluated && typeof classifyResult.accuracy.overall_accuracy === "number" ? (
                        <div className="flex items-center gap-2.5 text-xs font-mono">
                          <span className="bg-muted/40 border border-border/60 text-foreground px-2.5 py-1 rounded-md">
                            Accuracy: {(classifyResult.accuracy.overall_accuracy * 100).toFixed(1)}%
                          </span>
                          {typeof classifyResult.accuracy.kappa === "number" && (
                            <span className="bg-muted/40 border border-border/60 text-muted-foreground px-2.5 py-1 rounded-md">
                              Kappa: {classifyResult.accuracy.kappa.toFixed(3)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center text-xs">
                          <span className="bg-muted/40 border border-border/60 text-muted-foreground px-2.5 py-1 rounded-md">
                            Holdout validation unverified (small sample count)
                          </span>
                        </div>
                      )
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

                {classifyResult.accuracy && classifyResult.accuracy.matrix && classifyResult.accuracy.matrix_labels && (
                  <div className="border rounded-lg p-6 bg-background space-y-6 mt-4 overflow-x-auto">
                    <h4 className="text-center font-bold text-base">Table 1: Accuracy Assessment of Supervised Classification</h4>
                    
                    <div className="min-w-[600px]">
                      <table className="w-full border-collapse border border-gray-400 text-sm">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 p-2" colSpan={2} rowSpan={2}></th>
                            <th className="border border-gray-400 p-2 text-center bg-gray-100" colSpan={classifyResult.accuracy.matrix_labels.length}>Ground Reference Test Information</th>
                            <th className="border border-gray-400 p-2 text-center" rowSpan={2}>Row Total</th>
                          </tr>
                          <tr>
                            {classifyResult.accuracy.matrix_labels.map((label, i) => (
                              <th key={`col-${i}`} className="border border-gray-400 p-2 font-semibold text-center">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {classifyResult.accuracy.matrix[0].map((_, colIndex) => classifyResult.accuracy.matrix!.map(row => row[colIndex])).map((row, i) => {
                            const rowTotal = row.reduce((a, b) => a + b, 0);
                            return (
                              <tr key={`row-${i}`}>
                                {i === 0 && (
                                  <th className="border border-gray-400 p-2 font-semibold bg-gray-100 text-center relative" rowSpan={classifyResult.accuracy.matrix!.length}>
                                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Classification</div>
                                  </th>
                                )}
                                <th className="border border-gray-400 p-2 font-semibold text-left">{classifyResult.accuracy.matrix_labels![i]}</th>
                                {row.map((val, j) => {
                                  const isDiagonal = i === j;
                                  return (
                                    <td key={`cell-${i}-${j}`} className={`border border-gray-400 p-2 text-center ${isDiagonal ? 'border-2 border-black font-bold bg-green-50/50' : ''}`}>
                                      {val}
                                    </td>
                                  );
                                })}
                                <td className="border border-gray-400 p-2 text-center font-medium bg-gray-50">{rowTotal}</td>
                              </tr>
                            );
                          })}
                          <tr>
                            <th className="border border-gray-400 p-2 italic font-semibold text-left" colSpan={2}>Column Total</th>
                            {classifyResult.accuracy.matrix_labels.map((_, j) => {
                              const colTotal = classifyResult.accuracy.matrix!.map(row => row[j]).reduce((acc, val) => acc + val, 0);
                              return (
                                <td key={`coltot-${j}`} className="border border-gray-400 p-2 text-center font-medium bg-gray-50">{colTotal}</td>
                              );
                            })}
                            <td className="border border-gray-400 p-2 text-center font-bold bg-gray-100">
                              {classifyResult.accuracy.matrix.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
                        <div>
                          <p className="font-semibold mb-6">Overall Classification Accuracy: {((classifyResult.accuracy.overall_accuracy || 0) * 100).toFixed(0)}%</p>
                          <p className="font-semibold underline mb-2">Producer's Accuracy (Omission Error)</p>
                          <ul className="space-y-1">
                            {classifyResult.classes.map(cls => {
                              const pa = classifyResult.accuracy?.producers_accuracy?.[cls] || 0;
                              return (
                                <li key={`pa-${cls}`}>
                                  {cls}: {(pa * 100).toFixed(0)}%
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold mb-6">Overall Kappa Statistics: {(classifyResult.accuracy.kappa || 0).toFixed(2)}</p>
                          <p className="font-semibold underline mb-2">User's Accuracy (Commission Error)</p>
                          <ul className="space-y-1">
                            {classifyResult.classes.map(cls => {
                              const ua = classifyResult.accuracy?.users_accuracy?.[cls] || 0;
                              return (
                                <li key={`ua-${cls}`}>
                                  {cls}: {(ua * 100).toFixed(0)}%
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {classifyResult.accuracy && !classifyResult.accuracy.is_evaluated && (
                  <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/5 space-y-2 mt-4 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      Holdout Validation Assessment Notice
                    </div>
                    <p>
                      {classifyResult.accuracy.evaluation_note ||
                        "Insufficient test split samples: When working with few samples per class (< 10), withholding samples for an independent test error matrix deprives the classifier of essential training patterns. Digitize more training features per class (15–20+) to generate a statistically robust Confusion Matrix & Kappa statistic."}
                    </p>
                  </div>
                )}

                {classifyResult.samples_metadata && (
                  <div className="bg-muted/40 p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-3 text-muted-foreground mt-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <span><strong>Samples Submitted:</strong> {classifyResult.samples_metadata.total_submitted}</span>
                      <span><strong>Samples Processed:</strong> {classifyResult.samples_metadata.total_used}</span>
                      <span><strong>Balancing Cap:</strong> {classifyResult.samples_metadata.stratified_cap_per_class}/class max</span>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] bg-background">
                      Stratified Balancing Active
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 3. IMPORT RARE DATA & HARVESTER TAB */}
        {isAdmin && (
          <TabsContent value="import" className="h-full overflow-y-auto p-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Import from RARE DATA */}
            <div className="border border-border/60 rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                <Database className="w-4 h-4 text-foreground" />
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
                  disabled={importDatasetMut.isPending || !selectedDatasetId || !!isRasterSelected}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-1"
                >
                  {importDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push Features
                </Button>
              </div>
              
              {isRasterSelected && (
                <div className="text-xs text-amber-500 font-medium flex gap-1.5 pt-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Cannot push spatial features from a Raster dataset. Please select a Vector dataset (e.g., GeoJSON), or use the Harvester below to ingest Rasters.
                </div>
              )}
            </div>

            {/* Universal Spatial Data Harvester Card */}
            <div className="md:col-span-2">
              <DatasetHarvester
                defaultClassLabel={importClassLabel || classLabel || "Agriculture"}
                onPreviewRaster={(rawUrl, name) => {
                  const tileUrl = `${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}&gee_token=${getGeeToken() || ""}`;
                  setNativePreviewUrl(tileUrl);
                  setNativePreviewName(name || rawUrl.split("/").pop() || "GeoTIFF Layer");
                  setClassificationSource("native_cog");
                  setCustomAssetId(rawUrl);
                  setActiveTab("map");
                  toast({
                    title: "Loading Raster Preview 🗺️",
                    description: `Connecting '${name || "Dataset"}' and streaming native tiles...`,
                  });
                  fetch(`${BASE}/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}&gee_token=${getGeeToken() || ""}`)
                    .then((r) => {
                      if (!r.ok) throw new Error("Could not retrieve raster bounds.");
                      return r.json();
                    })
                    .then((bData) => {
                      if (bData.bbox && bData.bbox.length === 4) {
                        setActiveBbox(bData.bbox);
                        toast({
                          title: "Raster Layer Loaded! 🛰️",
                          description: `Centered view on '${name || "GeoTIFF"}' bounds.`,
                        });
                      }
                    })
                    .catch((err) => {
                      toast({
                        variant: "destructive",
                        title: "Raster Preview Notice",
                        description: err.message || "Failed to load raster overlay bounds.",
                      });
                    });
                }}
                onPreviewGeoJSON={(geojson) => {
                  setPreviewGeoJSON(geojson);
                  setNativePreviewUrl(null);
                  setActiveTab("map");
                  try {
                    const bbox = turf.bbox(geojson);
                    if (bbox && bbox.length === 4) setActiveBbox(bbox);
                  } catch {}
                }}
                onImportVectorSamples={(url, label) => {
                  api.samples
                    .ingestUrl({ url, class_label: label || "Harvested_Class" })
                    .then((res) => {
                      qc.invalidateQueries({ queryKey: ["samples"] });
                      toast({
                        title: "Samples Imported!",
                        description: `Imported ${res.imported_count || "vector"} features under class '${label}'.`,
                      });
                    })
                    .catch((err) => {
                      toast({
                        variant: "destructive",
                        title: "Vector Ingest Failed",
                        description: err.message,
                      });
                    });
                }}
              />
            </div>
          </div>
          </TabsContent>
        )}

        {/* 4. GEE ASSET UPLOAD TAB */}
        {isAdmin && (
          <TabsContent value="gee" className="h-full overflow-y-auto p-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
            {/* Card 1: Account & Project Config */}
            <div className="border border-border/60 rounded-lg p-5 bg-card space-y-4 md:col-span-2">
              <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                <Cloud className="w-4 h-4 text-foreground" />
                Google Earth Engine Account &amp; Project Authorization
              </div>
              <p className="text-xs text-muted-foreground">
                Specify your Google Earth Engine Cloud Project ID so that all asset uploads and computations are stored directly in your own GEE account.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">GEE Cloud Project ID</Label>
                  <input
                    value={targetGeeProjectId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTargetGeeProjectId(val);
                      setDestinationAssetId(`projects/${val || "YOUR_PROJECT"}/assets/rwanda_training_samples`);
                    }}
                    placeholder="e.g. ee-yourusername or your-gcp-project"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Target path: <code className="text-[11px] font-mono text-foreground">projects/{targetGeeProjectId || "YOUR_PROJECT"}/assets/...</code>
                  </p>
                </div>

                <div className="space-y-1 flex flex-col justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const r = await fetch(`${BASE}/gee/config`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ project_id: targetGeeProjectId.trim() }),
                        });
                        const res = await r.json();
                        if (r.ok && res.ok) {
                          toast({ title: "GEE Authenticated", description: `Active Project: ${res.status.project_id}` });
                        } else {
                          throw new Error(res.detail || "Authentication failed");
                        }
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Auth Error", description: e.message });
                      }
                    }}
                    className="gap-2 border-border/60 text-foreground hover:bg-muted font-medium text-xs h-9"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-400" /> Save &amp; Authenticate GEE Project
                  </Button>
                </div>
              </div>
            </div>

            {/* Card 2: Push Digitized Samples */}
            <div className="border border-border/60 rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                <Database className="w-4 h-4 text-foreground" />
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
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              <Button
                onClick={() => pushSamplesToGeeAssetMut.mutate()}
                disabled={pushSamplesToGeeAssetMut.isPending || samples.length === 0 || !destinationAssetId}
                className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90 font-medium text-xs h-9 shadow-2xs"
              >
                {pushSamplesToGeeAssetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Push {samples.length} Sample(s) to GEE Asset
              </Button>
            </div>

            {/* Card 3: Upload Spatial File (.tif / .zip) */}
            <div className="border border-border/60 rounded-lg p-5 bg-card space-y-4">
              <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                <Upload className="w-4 h-4 text-foreground" />
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
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              <Button
                onClick={() => geeMut.mutate()}
                disabled={geeMut.isPending || !geeFile || !assetName}
                className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90 font-medium text-xs h-9 shadow-2xs"
              >
                {geeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Push File to Earth Engine Asset
              </Button>
            </div>
          </div>
        </TabsContent>
        )}
      </Tabs>
      </div>

      {/* ADD DATA MODAL */}
      <Dialog open={isAddDataModalOpen} onOpenChange={setIsAddDataModalOpen}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Layers className="w-4 h-4 text-foreground" /> Add Data to Map
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Load imagery or vector features to the map for visualization or to use as the base for classification.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={addDataTab} onValueChange={setAddDataTab}>
            <TabsList className="w-full grid grid-cols-2 bg-muted/50 border border-border/50">
              <TabsTrigger value="upload" className="text-xs">Upload Local</TabsTrigger>
              <TabsTrigger value="rare" className="text-xs">Data Catalog</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4 pt-4">
              <Label className="cursor-pointer flex flex-col items-center justify-center p-12 border border-dashed rounded-lg border-border/60 hover:bg-muted/30 transition-colors">
                {uploadBusy ? <Loader2 className="w-7 h-7 animate-spin text-muted-foreground mb-2" /> : <Upload className="w-7 h-7 text-muted-foreground mb-2" />}
                <span className="text-xs font-medium text-foreground">{uploadBusy ? "Uploading..." : "Click to select file (.tif, .geojson, .zip)"}</span>
                <input type="file" className="hidden" accept=".tif,.tiff,.geojson,.zip,.csv" onChange={(e) => { handleFileUpload(e); setIsAddDataModalOpen(false); }} disabled={uploadBusy} />
              </Label>
            </TabsContent>
            
            <TabsContent value="rare" className="space-y-4 pt-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Select Dataset</Label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select a dataset...</option>
                  <optgroup label="Official Catalog">
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
                  fetch(`${BASE}/native/imagery/bounds?url=${encodeURIComponent(targetUrl)}`)
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.bbox) setActiveBbox(data.bbox);
                    })
                    .catch(() => {});

                  if (key.startsWith("url::")) {
                    const rawUrl = key.slice(5);
                    setClassificationSource("native_cog");
                    setCustomAssetId(rawUrl);
                    setNativePreviewUrl(`${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}`);
                    toast({
                      title: "Dataset Loaded",
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
                    setNativePreviewUrl(`${BASE}/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(key)}`);
                    toast({
                      title: "Local Dataset Selected",
                      description: `Loaded ${d.name}. Flying to dataset location...`,
                    });
                  }
                  setIsAddDataModalOpen(false);
                }}
                disabled={!selectedDatasetId}
                className="w-full gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium text-xs h-9 shadow-2xs"
              >
                <Database className="w-3.5 h-3.5" /> Classify by Here
              </Button>
            </TabsContent>
            

          </Tabs>
        </DialogContent>
      </Dialog>

      {/* SAVE DIGITIZATION SESSION MODAL */}
      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="sm:max-w-[520px] bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Save className="w-4 h-4 text-foreground" />
              Save Digitization Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              You have digitized {sessionSamples.length} feature(s) in this editing session. Name your training dataset batch to commit it to the database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/30 p-3 rounded-lg text-xs space-y-1.5 border border-border/50">
              <div className="font-medium text-foreground flex items-center justify-between">
                <span>Session Summary:</span>
                <Badge variant="outline" className="font-mono text-[10px] border-border/60 text-muted-foreground">{sessionSamples.length} feature(s) buffered</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(
                  sessionSamples.reduce((acc, curr) => {
                    const c = curr.class_label || "Unclassified";
                    acc[c] = (acc[c] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cName, count]) => {
                  const sampleObj = sessionSamples.find(s => s.class_label === cName);
                  const swatchColor = getRefinedColor(sampleObj?.color || "#64748b");
                  return (
                    <span key={cName} className="bg-background border border-border/60 px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1.5 text-foreground">
                      <span className="w-2 h-2 rounded-full inline-block border border-white/20" style={{ backgroundColor: swatchColor }} />
                      {cName}: {count}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataset-name-input" className="text-xs font-medium">
                Training Dataset / Batch Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dataset-name-input"
                value={datasetNameInput}
                onChange={(e) => setDatasetNameInput(e.target.value)}
                placeholder="e.g. Forest_Water_Batch_1"
                className="font-mono text-xs bg-background"
              />
              <p className="text-[11px] text-muted-foreground">
                This name tags all digitized features so you can filter, download, or train Supervised ML models on this specific batch.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-creator-input" className="text-xs font-medium">
                Creator / Author Name
              </Label>
              <Input
                id="session-creator-input"
                value={sessionCreatorInput}
                onChange={(e) => setSessionCreatorInput(e.target.value)}
                placeholder="Your name or team name"
                className="text-xs bg-background"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs font-medium border-border/60 hover:bg-muted text-muted-foreground"
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
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setIsSaveModalOpen(false)}>
                Continue Editing
              </Button>
              <Button
                size="sm"
                className="bg-foreground text-background hover:bg-foreground/90 font-medium gap-1.5 text-xs shadow-2xs"
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

      {/* MULTI-SPECTRAL SIGNATURE (Z-PROFILE) MODAL */}
      <Dialog open={showSpectralProfilesModal} onOpenChange={setShowSpectralProfilesModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  Multi-Spectral Signature Analysis (Z-Profile)
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Surface reflectance curves across Sentinel-2 multi-spectral bands (Blue → SWIR-2) for digitized classes.
                </DialogDescription>
              </div>
              {spectralProfilesData && (
                <Badge variant="outline" className="font-mono text-xs">
                  {spectralProfilesData.total_pixels_sampled} Pixels Sampled
                </Badge>
              )}
            </div>
          </DialogHeader>

          {spectralProfilesData && (
            <div className="space-y-6 py-2">
              {/* Spectral Curve Recharts Line Chart */}
              <div className="bg-card p-4 rounded-xl border shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-primary" />
                    Mean Surface Reflectance Curves
                  </h4>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Y-Axis: Reflectance (0.00 – 1.00) | X-Axis: Band &amp; Center Wavelength (nm)
                  </span>
                </div>

                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={spectralProfilesData.bands.map((b: any) => {
                        const row: Record<string, any> = {
                          bandLabel: `${b.band} (${b.wavelength}nm)`,
                          bandName: b.name,
                          desc: b.desc,
                        };
                        Object.entries(spectralProfilesData.classes).forEach(([cName, cData]: [string, any]) => {
                          row[cName] = cData.means[b.band] ?? 0;
                          row[`${cName}_std`] = cData.stds[b.band] ?? 0;
                        });
                        return row;
                      })}
                      margin={{ top: 15, right: 25, left: 0, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="bandLabel"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis
                        domain={[0, (dataMax: number) => Math.min(1.0, Math.ceil(dataMax * 1.2 * 10) / 10 || 0.6)]}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      />
                      <RechartsTooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const bandInfo = spectralProfilesData.bands.find(
                              (b: any) => `${b.band} (${b.wavelength}nm)` === label
                            );
                            return (
                              <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border text-xs space-y-2">
                                <div className="font-bold border-b pb-1">
                                  {label} - {bandInfo?.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground italic">
                                  {bandInfo?.desc}
                                </div>
                                <div className="space-y-1">
                                  {payload.map((entry: any) => (
                                    <div key={entry.name} className="flex items-center justify-between gap-4 font-mono">
                                      <span className="flex items-center gap-1.5 font-sans">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                        {entry.name}:
                                      </span>
                                      <strong>{(entry.value * 100).toFixed(1)}%</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <RechartsLegend verticalAlign="top" height={36} />
                      {Object.entries(spectralProfilesData.classes).map(([cName, cData]: [string, any]) => (
                        <Line
                          key={cName}
                          type="monotone"
                          dataKey={cName}
                          name={cName}
                          stroke={cData.color || "#3b82f6"}
                          strokeWidth={2.5}
                          dot={{ r: 4, strokeWidth: 1.5, fill: "#fff" }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Class Separability Diagnostics Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-medium flex items-center gap-2 text-foreground">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      Class Pairwise Separability Matrix (Spectral Distance)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Mathematical Euclidean separation across all 10 bands. Values &lt; 0.08 indicate high risk of ML confusion.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground font-medium border-b border-border/60">
                      <tr>
                        <th className="text-left px-3 py-2">Class Comparison</th>
                        <th className="text-center px-3 py-2 w-32">Spectral Distance</th>
                        <th className="text-center px-3 py-2 w-32">Separability</th>
                        <th className="text-left px-3 py-2">Analysis &amp; Guidance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {spectralProfilesData.separability.map((sep: any, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5 font-medium flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: getRefinedColor(spectralProfilesData.classes[sep.class_a]?.color || "#38bdf8") }} />
                            <span>{sep.class_a}</span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: getRefinedColor(spectralProfilesData.classes[sep.class_b]?.color || "#38bdf8") }} />
                            <span>{sep.class_b}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono">
                            {sep.distance.toFixed(4)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-mono ${
                                sep.status === "separable"
                                  ? "bg-muted/50 text-foreground border-border/60"
                                  : sep.status === "moderate"
                                  ? "bg-muted/30 text-muted-foreground border-border/50"
                                  : "bg-destructive/10 text-destructive border-destructive/30"
                              }`}
                            >
                              {sep.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground leading-relaxed text-[11px]">
                            {sep.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSpectralProfilesModal(false)} className="text-xs">
              Close
            </Button>
            <Button
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 font-medium gap-1.5 text-xs shadow-2xs"
              onClick={() => {
                setShowSpectralProfilesModal(false);
                trainSupervisedClassifierDirectly();
              }}
            >
              <Cpu className="w-3.5 h-3.5" />
              Train Classifier Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHARE & EXPORT STUDIO MODAL */}
      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border/60 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/60 border border-border/60 flex items-center justify-center text-foreground">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                  Share &amp; Export Studio
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/60 bg-muted/30">
                    Live
                  </Badge>
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 1. Shareable Session URL */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/60 space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                Direct Session Link
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={typeof window !== "undefined" ? window.location.href : ""}
                  className="h-8 text-xs font-mono bg-background border-border/60"
                />
                <Button
                  size="sm"
                  onClick={handleCopyShareLink}
                  className="h-8 gap-1.5 text-xs font-medium px-3 shrink-0 bg-foreground text-background hover:bg-foreground/90 shadow-2xs"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                </Button>
              </div>
            </div>

            {/* 2. Standard Vector GIS Formats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  Export Training Samples ({allCombinedSamples.length} Total)
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {Object.keys(groupedSamples).length} Classes
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* ESRI Shapefile */}
                <div className="p-3 rounded-lg border border-border/60 bg-card/60 hover:border-border transition-colors flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Shapefile (.zip)</span>
                    <Badge variant="outline" className="text-[9px] font-mono border-border/60 text-muted-foreground">ESRI</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadShapefile}
                    disabled={allCombinedSamples.length === 0}
                    className="w-full h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground"
                  >
                    <Download className="w-3 h-3" />
                    Download .zip
                  </Button>
                </div>

                {/* GeoJSON */}
                <div className="p-3 rounded-lg border border-border/60 bg-card/60 hover:border-border transition-colors flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">GeoJSON</span>
                    <Badge variant="outline" className="text-[9px] font-mono border-border/60 text-muted-foreground">RFC 7946</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadGeoJSON}
                    disabled={allCombinedSamples.length === 0}
                    className="w-full h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground"
                  >
                    <Download className="w-3 h-3" />
                    Download .geojson
                  </Button>
                </div>

                {/* CSV Table */}
                <div className="p-3 rounded-lg border border-border/60 bg-card/60 hover:border-border transition-colors flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">CSV Spreadsheet</span>
                    <Badge variant="outline" className="text-[9px] font-mono border-border/60 text-muted-foreground">Tabular</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadCSV}
                    disabled={allCombinedSamples.length === 0}
                    className="w-full h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground"
                  >
                    <Download className="w-3 h-3" />
                    Download .csv
                  </Button>
                </div>
              </div>
            </div>

            {/* 3. Cartography & Desktop GIS Package */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-foreground" />
                Cartographic Symbology &amp; QGIS Styles
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* QGIS Style .qml */}
                <div className="p-3 rounded-lg border border-border/60 bg-card/60 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-foreground">QGIS Palette Style (.qml)</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadQMLStyle}
                    disabled={allCombinedSamples.length === 0 && !classifyResult}
                    className="h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    Export .qml
                  </Button>
                </div>

                {/* Classified GeoTIFF (if available) */}
                <div className="p-3 rounded-lg border border-border/60 bg-card/60 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-foreground">Classified GeoTIFF Raster</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (classifyResult?.download_url) {
                        window.open(classifyResult.download_url, "_blank");
                      }
                    }}
                    disabled={!classifyResult?.download_url}
                    className="h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-muted text-foreground shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    GeoTIFF
                  </Button>
                </div>
              </div>
            </div>

            {/* 4. Dataset Overview Summary Pill */}
            <div className="bg-muted/40 p-2.5 rounded-lg border border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Session contains <strong>{allCombinedSamples.length}</strong> total samples across <strong>{Object.keys(groupedSamples).length}</strong> classes</span>
              </span>
              <span className="font-mono text-[10px]">CRS: EPSG:4326 (WGS84)</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Option 1: Study Area (AOI) Configuration Modal ─────────────── */}
      <Dialog open={isStudyAreaModalOpen} onOpenChange={setIsStudyAreaModalOpen}>
        <DialogContent className="max-w-xl bg-card border-border/60 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MapPin className="w-4 h-4 text-sky-400" />
              Define &amp; Select Study Area (AOI)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status & Boundary Overview Card */}
            <div className={`p-3 rounded-lg border transition-all ${
              studyArea 
                ? "border-emerald-500/30 bg-emerald-500/5 ring-1 ring-emerald-500/10" 
                : "border-sky-500/30 bg-sky-500/5 ring-1 ring-sky-500/10"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${studyArea ? "bg-emerald-400 animate-pulse" : "bg-sky-400"}`} />
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      {studyArea ? "Study Area Boundary Active" : "No Study Area Configured"}
                    </span>
                    {studyArea && (
                      <span className="text-[11px] text-muted-foreground">
                        {studyArea.features?.length || 1} feature(s) defined{aoiAreaKm2 ? ` • ~${aoiAreaKm2} km²` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`text-[10px] font-mono px-2 py-0.5 ${
                    studyArea 
                      ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" 
                      : "border-sky-500/40 text-sky-300 bg-sky-500/10"
                  }`}>
                    {studyArea ? "Active" : "Required"}
                  </Badge>
                  {studyArea && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearStudyArea}
                      className="h-6 text-[11px] px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Clear current boundary"
                    >
                      Clear AOI
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <Tabs value={studyAreaModalTab} onValueChange={setStudyAreaModalTab} className="w-full">
              <TabsList className="w-full grid grid-cols-3 bg-muted/40 p-0.5 border border-border/60 rounded-lg h-9">
                <TabsTrigger value="presets" className="text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-2xs">
                  Regional Presets
                </TabsTrigger>
                <TabsTrigger value="draw" className="text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-2xs">
                  Interactive Draw
                </TabsTrigger>
                <TabsTrigger value="upload" className="text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-2xs">
                  Upload File
                </TabsTrigger>
              </TabsList>

              {/* ── Tab 1: Regional Presets & Viewport Extent ── */}
              <TabsContent value="presets" className="space-y-3 pt-2">
                {/* 1-Click: Use Map Viewport */}
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/30 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-xs font-semibold text-foreground">Current Map Viewport</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={applyCurrentViewportAsStudyArea}
                    className="h-8 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 shrink-0 px-3 shadow-2xs"
                  >
                    Use Viewport
                  </Button>
                </div>

                {/* Regional Extent Presets */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium px-0.5">
                    <span>Curated Rwanda Regional Extents</span>
                    <span>5 Available</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {STUDY_AREA_PRESETS.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => applyStudyAreaPreset(preset)}
                        className="p-2.5 rounded-lg border border-border/60 bg-muted/15 hover:bg-muted/30 hover:border-sky-500/50 cursor-pointer transition-all group flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground group-hover:text-sky-300 transition-colors">
                            {preset.name}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
                          <span>[{preset.bbox[0]}, {preset.bbox[1]}]</span>
                          <span className="text-sky-400 font-sans font-medium text-[10px]">Select &rarr;</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab 2: Interactive Draw ── */}
              <TabsContent value="draw" className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Box (Rectangle) */}
                  <div
                    onClick={() => startAoiDrawing("rectangle")}
                    className="p-3.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-sky-500/60 transition-all cursor-pointer group flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                        <Square className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-foreground block">
                        Box (Rectangle AOI)
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs font-medium border-border/60 group-hover:border-sky-500/50 group-hover:text-sky-300"
                    >
                      Draw Rectangle Box
                    </Button>
                  </div>

                  {/* Option B: Freeform Polygon */}
                  <div
                    onClick={() => startAoiDrawing("polygon")}
                    className="p-3.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-sky-500/60 transition-all cursor-pointer group flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-foreground block">
                        Freeform Polygon AOI
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs font-medium border-border/60 group-hover:border-sky-500/50 group-hover:text-sky-300"
                    >
                      Draw Freeform Polygon
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab 3: Upload File ── */}
              <TabsContent value="upload" className="space-y-3 pt-2">
                <div className="relative border-2 border-dashed border-border/70 hover:border-sky-500/60 rounded-xl p-6 text-center bg-muted/15 transition-all group">
                  <input
                    type="file"
                    accept=".geojson,.json,.zip"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAoiFileUpload(file);
                      e.target.value = "";
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground group-hover:text-sky-400 group-hover:scale-110 transition-all">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Click or drag boundary file to upload
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-border/60 text-muted-foreground">
                      .geojson • .json • zipped .shp (.zip)
                    </Badge>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2 border-t border-border/40">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="modal-show-study-area"
                checked={showStudyArea}
                disabled={!studyArea}
                onChange={(e) => setShowStudyArea(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-foreground focus:ring-1 focus:ring-ring cursor-pointer"
              />
              <Label htmlFor="modal-show-study-area" className={`text-xs ${!studyArea ? "text-muted-foreground/50" : "text-muted-foreground cursor-pointer"}`}>
                Show boundary vector overlay on map
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsStudyAreaModalOpen(false)} className="text-xs h-8">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Option 1: Land Cover Class Palette Studio Modal ────────────── */}
      <Dialog open={isClassPaletteModalOpen} onOpenChange={setIsClassPaletteModalOpen}>
        <DialogContent className="max-w-xl bg-card border-border/60 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Palette className="w-4 h-4 text-foreground" />
              Land Cover Class Palette &amp; Symbology
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select an active class swatch to digitize, or customize class labels, colors, and numerical codes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            {/* Active Class Highlight Banner */}
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full inline-block shadow-2xs border border-white/20 shrink-0" style={{ backgroundColor: getRefinedColor(color) }} />
                <div>
                  <span className="text-[11px] text-muted-foreground block">Active Digitizing Class:</span>
                  <span className="text-sm font-semibold text-foreground">{classLabel} (ID #{classValue})</span>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 border-border/60 text-muted-foreground bg-muted/40">
                {groupedSamples[classLabel]?.items.length || 0} samples ready
              </Badge>
            </div>

            {/* 19 Land Cover Preset Swatches */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-[10px] flex items-center justify-between">
                <span>Select Land Cover Class ({LAND_COVER_PRESETS.length} Presets)</span>
                <span className="font-mono text-[10px]">{Object.keys(groupedSamples).length} defined in dataset</span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1.5 rounded-lg border border-border/60 bg-background/50">
                {LAND_COVER_PRESETS.map((p, idx) => {
                  const isSelected = classLabel.toLowerCase() === p.name.toLowerCase();
                  const count = groupedSamples[p.name]?.items.length || 0;
                  const refinedColor = getRefinedColor(p.color);
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setClassLabel(p.name);
                        setColor(p.color);
                        setClassValue(idx + 1);
                        if (isEditing) {
                          setTimeout(() => autoStartDrawMode(drawMode, true), 50);
                        }
                      }}
                      className={`text-[11px] px-2 py-1.5 rounded-md border flex items-center justify-between transition-all text-left ${
                        isSelected
                          ? "border-foreground bg-muted text-foreground font-medium ring-1 ring-border/80 shadow-2xs"
                          : "border-border/50 bg-background/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate mr-1">
                        <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0 border border-white/20" style={{ backgroundColor: refinedColor }} />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className={`text-[10px] font-mono px-1 rounded ${count > 0 ? "bg-muted text-foreground font-medium" : "text-muted-foreground/40"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Class Inputs */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class Label</Label>
                <Input
                  value={classLabel}
                  onChange={(e) => setClassLabel(e.target.value)}
                  placeholder="e.g. Forest, Urban"
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Numerical ID</Label>
                <Input
                  type="number"
                  value={classValue}
                  onChange={(e) => setClassValue(parseInt(e.target.value) || 1)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Color Swatch</Label>
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 p-0.5 cursor-pointer bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Creator Tag</Label>
                <Input
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  placeholder="Your initials/name"
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClassPaletteModalOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
            <Button
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 font-medium gap-1.5 text-xs shadow-2xs"
              onClick={() => {
                setIsClassPaletteModalOpen(false);
                if (!isEditing && studyArea) {
                  setIsEditing(true);
                  setSessionSamples([]);
                  toast({ title: "Digitizing Started", description: `Collecting samples for '${classLabel}'` });
                  setTimeout(() => autoStartDrawMode(drawMode === "pan" ? "point" : drawMode, true), 200);
                }
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Select &amp; Apply ({classLabel})</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Option 1: Dataset Readiness & Quality Inspector Modal ───────── */}
      <Dialog open={isReadinessModalOpen} onOpenChange={setIsReadinessModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border/60 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Activity className="w-4 h-4 text-foreground" />
              Dataset Readiness &amp; Quality Inspector
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Evaluates class balance, sample volume, and generalization feasibility for Supervised Machine Learning.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status Summary Banner */}
            <div className="p-3.5 rounded-lg border border-border/60 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wider text-[11px] flex items-center gap-1.5 text-foreground">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Overall Quality Status
                </span>
                <Badge variant="outline" className="font-mono text-xs border-border/60 bg-muted/50 text-foreground font-medium">
                  {classBalanceMetrics.status === "healthy" ? "Healthy & Balanced" : classBalanceMetrics.status === "imbalanced" ? "High Imbalance" : classBalanceMetrics.status === "low_samples" ? "Low Sample Volume" : "Insufficient"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {classBalanceMetrics.message}
              </p>
            </div>

            {/* Per-Class Distribution & Progress Bars */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                  Class Distribution ({Object.keys(groupedSamples).length} Classes • {allCombinedSamples.length} Samples)
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">Target: 10–20 samples/class</span>
              </div>

              {Object.keys(groupedSamples).length === 0 ? (
                <div className="p-4 rounded-lg border border-border/60 text-center text-xs text-muted-foreground">
                  No samples digitized yet. Click "Start Draw" on the top bar to begin.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {Object.entries(groupedSamples).map(([label, grp]) => {
                    const count = grp.items.length;
                    const target = 15;
                    const pct = Math.min(100, Math.round((count / target) * 100));
                    const isLow = count < 5;
                    const refinedColor = getRefinedColor(grp.color);
                    return (
                      <div key={label} className="p-2.5 rounded-lg border border-border/60 bg-muted/20 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 font-medium text-foreground">
                            <span className="w-2.5 h-2.5 rounded-full inline-block border border-white/20" style={{ backgroundColor: refinedColor }} />
                            <span>{label}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-foreground">
                              {count} sample{count === 1 ? "" : "s"}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setClassLabel(label);
                                setColor(grp.color);
                                setIsReadinessModalOpen(false);
                                toast({ title: `Active Class: ${label}`, description: "Selected for digitizing." });
                              }}
                            >
                              Digitize More
                            </Button>
                          </div>
                        </div>
                        <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${isLow ? "bg-muted-foreground/60" : "bg-foreground"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Generalization Guidance Alert */}
            <div className="bg-muted/30 p-2.5 rounded-lg border border-border/60 text-[11px] text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4 text-foreground shrink-0" />
              <span>
                <strong>ML Generalization Tip:</strong> Aim for 10–20 samples per class to achieve reliable holdout cross-validation in Random Forest and CART.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsReadinessModalOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


