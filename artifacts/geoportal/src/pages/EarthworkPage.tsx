import { useState, useRef, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Box, Info, Map as MapIcon, Sliders, DollarSign, Calculator, Leaf, ArrowRight, ArrowDown } from "lucide-react";
import { MapContainer, TileLayer, FeatureGroup, LayersControl, Polygon, Marker, Popup, Tooltip, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { Earthwork3DViewer } from "@/components/Earthwork3DViewer";

function MapBoundsUpdater({ coords }: { coords: number[][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      const latlngs = coords.map(c => [c[1], c[0]]);
      const bounds = L.latLngBounds(latlngs as [number, number][]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

export default function EarthworkPage() {
  const [polygonCoords, setPolygonCoords] = useState<number[][] | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [isTerracing, setIsTerracing] = useState<boolean>(false);
  const isTerracingRef = useRef<boolean>(false);
  const targetElevationRef = useRef<number | "">("");
  const autoBalanceRef = useRef<boolean>(false);

  const [industryMode, setIndustryMode] = useState<"civil" | "hydrology" | "mining">("civil");

  const [targetElevation, setTargetElevation] = useState<number | "">("");
  const [customDemId, setCustomDemId] = useState<string>("");
  const [autoBalance, setAutoBalance] = useState<boolean>(false);
  const [lineCoords, setLineCoords] = useState<number[][] | null>(null);
  const [profileData, setProfileData] = useState<any[] | null>(null);
  const [isProfilePending, setIsProfilePending] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<"earthwork" | "drainage">("earthwork");
  const [show3DViewer, setShow3DViewer] = useState(false);

  // Sync refs so Leaflet callbacks don't have stale state
  useEffect(() => { isTerracingRef.current = isTerracing; }, [isTerracing]);
  useEffect(() => { targetElevationRef.current = targetElevation; }, [targetElevation]);
  useEffect(() => { autoBalanceRef.current = autoBalance; }, [autoBalance]);
  
  // Phase 1 & 2 states
  const [topsoilDepth, setTopsoilDepth] = useState<number>(0);
  const [slopeGrade, setSlopeGrade] = useState<number>(0);
  const [slopeAngle, setSlopeAngle] = useState<number>(0);
  const [batterRatio, setBatterRatio] = useState<number>(3.0);
  
  const [swellFactor, setSwellFactor] = useState<number>(1.2);
  const [shrinkFactor, setShrinkFactor] = useState<number>(0.9);
  const [soilPreset, setSoilPreset] = useState<string>("Custom");

  const SOIL_PRESETS = [
    { name: "Custom", swell: swellFactor, shrink: shrinkFactor },
    { name: "Sand", swell: 1.12, shrink: 0.88 },
    { name: "Gravel", swell: 1.12, shrink: 0.92 },
    { name: "Loam / Earth", swell: 1.25, shrink: 0.85 },
    { name: "Clay (Dry)", swell: 1.35, shrink: 0.80 },
    { name: "Clay (Wet)", swell: 1.35, shrink: 0.75 },
    { name: "Rock (Blasted)", swell: 1.60, shrink: 1.00 },
  ];
  
  const [waterTableDepth, setWaterTableDepth] = useState<number>(0);
  const [strataLayers, setStrataLayers] = useState<any[]>([
    { name: "Common Earth", thickness: 2.0, swell: 1.2 },
    { name: "Soft Rock", thickness: 3.0, swell: 1.4 }
  ]);
  
  const [costCut, setCostCut] = useState<number>(15); // $15 per m3
  const [costFill, setCostFill] = useState<number>(20); // $20 per m3

  // New Hydrology States
  const [pondMaxDepth, setPondMaxDepth] = useState<number>(5);
  const [pondSideSlope, setPondSideSlope] = useState<number>(4);

  // New Mining States
  const [stockpileReposeAngle, setStockpileReposeAngle] = useState<number>(35);
  const [stockpileBenchWidth, setStockpileBenchWidth] = useState<number>(5);

  // Ribbon State
  const [activeTab, setActiveTab] = useState<"analysis" | "geotechnical" | "reporting">("analysis");

  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReportPending, setIsReportPending] = useState(false);
  const [boreholes, setBoreholes] = useState<any[]>([]);

  const featureGroupRef = useRef<any>(null);

  // Custom icons since default Leaflet icons are broken in Vite
  const cutIcon = L.divIcon({
    html: `<div style="background-color: #ef4444; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const fillIcon = L.divIcon({
    html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const onCreated = (e: any) => {
    const layer = e.layer;
    const fg = featureGroupRef.current;
    
    if (e.layerType === "polygon" || e.layerType === "rectangle") {
      const isMulti = isTerracingRef.current;
      if (fg && !isMulti) {
        fg.getLayers().forEach((l: any) => {
          if (l instanceof L.Polygon && l !== layer) fg.removeLayer(l);
        });
      }
      const latlngs = layer.getLatLngs()[0];
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      coords.push([latlngs[0].lng, latlngs[0].lat]);
      
      setZones(prev => {
        const newZones = isMulti ? [...prev] : [];
        newZones.push({
          id: layer._leaflet_id,
          polygon: coords,
          target_elevation: targetElevationRef.current,
          auto_balance: autoBalanceRef.current
        });
        return newZones;
      });

      setPolygonCoords(coords);
      setResult(null);
      setProfileData(null);
    } else if (e.layerType === "polyline") {
      if (fg) {
        fg.getLayers().forEach((l: any) => {
          if (l instanceof L.Polyline && !(l instanceof L.Polygon) && l !== layer) fg.removeLayer(l);
        });
      }
      const latlngs = layer.getLatLngs();
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      setLineCoords(coords);
      fetchProfile(coords);
    }
  };

  const getApproxArea = (coords: number[][]) => {
    if (!coords || coords.length < 3) return 0;
    const centerLat = coords[0][1] * Math.PI / 180;
    const m_per_deg_lat = 111320;
    const m_per_deg_lng = 111320 * Math.cos(centerLat);
    
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const x1 = coords[i][0] * m_per_deg_lng;
      const y1 = coords[i][1] * m_per_deg_lat;
      const x2 = coords[i+1][0] * m_per_deg_lng;
      const y2 = coords[i+1][1] * m_per_deg_lat;
      area += (x1 * y2 - x2 * y1);
    }
    return Math.abs(area / 2);
  };

  const handleAutoSectionNS = () => {
    if (!polygonCoords || polygonCoords.length < 3) return;
    const lats = polygonCoords.map(c => c[1]);
    const lngs = polygonCoords.map(c => c[0]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    fetchProfile([[midLng, minLat], [midLng, maxLat]]);
  };

  const handleAutoSectionEW = () => {
    if (!polygonCoords || polygonCoords.length < 3) return;
    const lats = polygonCoords.map(c => c[1]);
    const lngs = polygonCoords.map(c => c[0]);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    fetchProfile([[minLng, midLat], [maxLng, midLat]]);
  };

  const onEdited = (e: any) => {
    const layers = e.layers;
    let lastCoords: any = null;
    setZones(prev => {
      const next = [...prev];
      layers.eachLayer((layer: any) => {
        const latlngs = layer.getLatLngs()[0];
        const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
        coords.push([latlngs[0].lng, latlngs[0].lat]);
        lastCoords = coords;
        
        const idx = next.findIndex(z => z.id === layer._leaflet_id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], polygon: coords };
        }
      });
      return next;
    });
    if (lastCoords) setPolygonCoords(lastCoords);
    setResult(null);
  };

  const onDeleted = (e: any) => {
    const layers = e.layers;
    setZones(prev => {
      const next = [...prev];
      layers.eachLayer((layer: any) => {
        const idx = next.findIndex(z => z.id === layer._leaflet_id);
        if (idx >= 0) next.splice(idx, 1);
      });
      return next;
    });
    setResult(null);
  };

  const fetchProfile = async (coords: number[][]) => {
    if (!polygonCoords) return;
    setIsProfilePending(true);
    try {
      const data = await api.earthwork.profile({
        polygon: polygonCoords,
        line: coords,
        target_elevation: Number(targetElevation) || 0,
        slope_grade: slopeGrade,
        slope_angle: slopeAngle,
        batter_ratio: batterRatio,
        topsoil_depth: topsoilDepth,
        custom_dem_id: customDemId.trim() || undefined
      });
      setProfileData(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch profile");
    } finally {
      setIsProfilePending(false);
    }
  };

  const handleAnalyze = async () => {
    if (zones.length === 0 && !polygonCoords) {
      setError("Please draw a polygon on the map first.");
      return;
    }
    setError(null);
    setIsPending(true);
    
    try {
      const payload: any = {
        polygon: polygonCoords,
        target_elevation: targetElevation === "" || autoBalance ? undefined : Number(targetElevation),
        auto_balance: autoBalance,
        swell_factor: swellFactor,
        shrink_factor: shrinkFactor,
        topsoil_depth: topsoilDepth,
        slope_grade: slopeGrade,
        slope_angle: slopeAngle,
        batter_ratio: batterRatio,
        strata_layers: strataLayers,
        water_table_depth: waterTableDepth,
        boreholes: boreholes.length > 0 ? boreholes : undefined,
        custom_dem_id: customDemId.trim() || undefined
      };
      
      if (isTerracing && zones.length > 0) {
        payload.zones = zones.map(z => ({
          polygon: z.polygon,
          target_elevation: z.target_elevation === "" || z.auto_balance ? undefined : Number(z.target_elevation),
          auto_balance: z.auto_balance
        }));
      }

      if (industryMode === "hydrology") {
        payload.pond_max_depth = pondMaxDepth;
        payload.pond_side_slope = pondSideSlope;
      } else if (industryMode === "mining") {
        payload.stockpile_repose_angle = stockpileReposeAngle;
        payload.stockpile_bench_width = stockpileBenchWidth;
      }

      const data = await api.earthwork.analyze(payload);
      setResult(data);
      if (!isTerracing && (targetElevation === "" || autoBalance)) {
        setTargetElevation(data.target_elevation);
        if (data.optimized_slope_grade !== undefined && data.optimized_slope_grade !== null) {
          setSlopeGrade(data.optimized_slope_grade);
        }
        if (data.optimized_slope_angle !== undefined && data.optimized_slope_angle !== null) {
          setSlopeAngle(data.optimized_slope_angle);
        }
        setAutoBalance(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze earthwork.");
    } finally {
      setIsPending(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!result) return;
    setIsReportPending(true);
    try {
      const stats: Record<string, number> = {
        "Total Cut (m3)": result.adjusted_cut_m3,
        "Total Fill (m3)": result.adjusted_fill_m3,
        "Net Balance (m3)": result.net_balance_m3,
        "Est. Cost Cut ($)": result.adjusted_cut_m3 * costCut,
        "Est. Cost Fill ($)": result.adjusted_fill_m3 * costFill
      };
      
      const class_areas: Record<string, number> = {};
      if (result.strata_results) {
        result.strata_results.forEach((s: any) => {
          class_areas[`Strata: ${s.name} (m3)`] = s.adjusted_m3;
        });
      }
      
      let extraNotes = "Mass Haul Logistics:\n";
      if (result.logistics) {
        extraNotes += `- Haul Distance: ${result.logistics.haul_distance_m} m\n`;
        extraNotes += `- Haul Effort: ${result.logistics.haul_effort_m3_km} m3.km\n`;
      }

      const mapUrl = result.heatmap_tile_url || "";

      const blob = await api.report({
        module_name: "Earthwork Analysis",
        aoi: { type: "polygon", coordinates: polygonCoords || [] },
        date_range: new Date().toISOString().split("T")[0],
        stats,
        class_areas,
        extra_notes: extraNotes,
        maps: mapUrl ? [["Cut/Fill Depth Map", mapUrl]] : undefined
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "earthwork_report.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Failed to generate report");
    } finally {
      setIsReportPending(false);
    }
  };

  // Re-run analysis automatically if user adjusts slider and we already have a result
  useEffect(() => {
    if (result && targetElevation !== "" && targetElevation !== result.target_elevation) {
      const timer = setTimeout(() => {
        handleAnalyze();
      }, 500); // debounce slider
      return () => clearTimeout(timer);
    }
  }, [targetElevation]);

  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const extractPolygonCoords = (geojson: any) => {
    if (geojson.type === "FeatureCollection" && geojson.features.length > 0) {
      const geom = geojson.features[0].geometry;
      if (geom.type === "Polygon") {
        return geom.coordinates[0].map((coord: number[]) => [coord[0], coord[1]]);
      } else if (geom.type === "MultiPolygon") {
        return geom.coordinates[0][0].map((coord: number[]) => [coord[0], coord[1]]);
      }
    }
    return null;
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file) return;
    
    try {
      setIsPending(true);
      if (file.name.toLowerCase().endsWith(".zip")) {
        const { geojson } = await api.uploadShapefile(file);
        const coords = extractPolygonCoords(geojson);
        if (coords) {
          setPolygonCoords(coords);
          setError(null);
          
          if (featureGroupRef.current) {
            const fg = featureGroupRef.current;
            fg.clearLayers();
            const latlngs = coords.map((c: any) => [c[1], c[0]]);
            const polygon = L.polygon(latlngs as [number, number][], { color: "#facc15", weight: 3, dashArray: "5, 5", fillOpacity: 0 });
            fg.addLayer(polygon);
            
            setZones([{
              id: (polygon as any)._leaflet_id,
              polygon: coords,
              target_elevation: targetElevationRef.current,
              auto_balance: autoBalanceRef.current
            }]);
          }
        } else {
          setError("No valid polygon found in the uploaded shapefile.");
        }
      } else if (file.name.toLowerCase().endsWith(".tif") || file.name.toLowerCase().endsWith(".tiff")) {
        const { asset_id } = await api.uploadTiff(file);
        setCustomDemId(asset_id);
        setError(null);
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 1) {
          const parsed = lines.slice(1).map(line => {
            const parts = line.split(',');
            return {
               lon: parseFloat(parts[0]),
               lat: parseFloat(parts[1]),
               depth: parseFloat(parts[2])
            };
          }).filter(b => !isNaN(b.lat) && !isNaN(b.lon) && !isNaN(b.depth));
          setBoreholes(parsed);
          setError(null);
        } else {
          setError("CSV must contain header and data rows.");
        }
      } else {
        setError("Only .zip (shapefile), .tif/.tiff, or .csv files are supported.");
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setIsPending(false);
    }
  };



  return (
    <div 
      className="flex flex-col h-full w-full bg-background dark:bg-slate-950 overflow-hidden font-sans relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-[9999] flex items-center justify-center border-4 border-dashed border-blue-500 pointer-events-none">
          <div className="bg-card dark:bg-slate-900 p-8 rounded-xl shadow-2xl flex flex-col items-center">
            <MapIcon className="w-16 h-16 text-blue-500 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Drop data here</h2>
            <p className="text-gray-500 text-center">.zip (Shapefile) for Site Boundary<br/>.tif / .tiff for Custom DEM Surface<br/>.csv (Lon,Lat,Depth) for Boreholes</p>
          </div>
        </div>
      )}
      {/* Top Ribbon (ArcGIS Style) */}
      <div className="flex flex-col border-b dark:border-slate-800 shadow-sm z-[1000] relative bg-[#f5f5f5] dark:bg-slate-900">
        
        {/* Top Header / Module Title */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1e293b] dark:bg-slate-950 text-white">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Box className="w-4 h-4 text-[#ff5a5f]" />
            <span>Advanced Earthwork & Grading</span>
          </div>
          <select 
            value={industryMode} 
            onChange={(e) => {
              setIndustryMode(e.target.value as any);
              setResult(null);
              setIsTerracing(false);
            }}
            className="h-6 text-[11px] rounded bg-white/10 text-white font-semibold px-2 border-0 focus:ring-0 outline-none cursor-pointer"
          >
            <option value="civil" className="text-black">🚧 Civil Grading</option>
            <option value="hydrology" className="text-black">💧 Hydrology & Water</option>
            <option value="mining" className="text-black">⛏️ Mining & Stockpiles</option>
          </select>
        </div>

        {/* Ribbon Tabs */}
        <div className="flex px-4 pt-2 gap-1 border-b dark:border-slate-800 bg-card dark:bg-slate-900">
          <button 
            onClick={() => setActiveTab("analysis")}
            className={`px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 uppercase tracking-wider ${activeTab === "analysis" ? "border-[#007AC2] bg-[#f3f4f6] dark:bg-slate-800 text-[#007AC2]" : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
            Analysis & Design
          </button>
          <button 
            onClick={() => setActiveTab("geotechnical")}
            className={`px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 uppercase tracking-wider ${activeTab === "geotechnical" ? "border-[#007AC2] bg-[#f3f4f6] dark:bg-slate-800 text-[#007AC2]" : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
            Geotechnical
          </button>
          <button 
            onClick={() => setActiveTab("reporting")}
            className={`px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 uppercase tracking-wider ${activeTab === "reporting" ? "border-[#007AC2] bg-[#f3f4f6] dark:bg-slate-800 text-[#007AC2]" : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
            Reporting
          </button>
        </div>
        
        {/* Ribbon Toolbar Content */}
        <div className="p-2 flex gap-4 items-stretch h-[85px] overflow-x-auto bg-card dark:bg-slate-900 shrink-0 border-b dark:border-slate-800">
           
           {activeTab === "analysis" && (
             <>
               {/* Tool Group: Site Area */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">Site Boundary</span>
                    <label className="flex items-center gap-1 text-[9px] font-bold text-[#007AC2] cursor-pointer hover:underline" title="Enable multiple grading zones">
                      <input type="checkbox" checked={isTerracing} onChange={(e) => setIsTerracing(e.target.checked)} className="w-2.5 h-2.5 accent-[#007AC2]" />
                      Terracing
                    </label>
                  </div>
                  <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600 border-dashed px-2 text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">
                    {polygonCoords ? "Selected:" + (polygonCoords.length - 1) + " vertices" : "Draw Polygon On Map"}
                  </div>
               </div>

               {industryMode === "civil" && (
                 <>
                   {/* Tool Group: Grading Constraints */}
                   <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[340px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Grading Constraints</span>
                        <label className="flex items-center gap-1 text-[9px] font-bold text-[#ff5a5f] cursor-pointer hover:underline" title="Generative Design optimization">
                          <input type="checkbox" checked={autoBalance} onChange={(e) => setAutoBalance(e.target.checked)} className="w-2.5 h-2.5 accent-[#ff5a5f]" />
                          Auto-Balance
                        </label>
                      </div>
                      <div className="flex gap-2 items-center flex-1">
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Target Elev (m)</span>
                            <input type="number" value={targetElevation} onChange={(e) => setTargetElevation(e.target.value === "" ? "" : Number(e.target.value))} disabled={autoBalance} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1 disabled:opacity-50" placeholder="Auto" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Grade (%)</span>
                            <input type="number" step="0.5" value={slopeGrade} onChange={(e) => setSlopeGrade(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Azimuth (Â°)</span>
                            <input type="number" value={slopeAngle} onChange={(e) => setSlopeAngle(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Batter (H:1V)</span>
                            <input type="number" step="0.5" value={batterRatio} onChange={(e) => setBatterRatio(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1 text-green-600 dark:text-green-400" />
                         </div>
                      </div>
                   </div>

                   {/* Tool Group: Soils */}
                   <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[220px]">
                      <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Material Properties</span>
                      <div className="flex gap-2 items-center flex-1">
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Topsoil Strip (m)</span>
                            <input type="number" step="0.1" value={topsoilDepth} onChange={(e) => setTopsoilDepth(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 px-1 text-orange-600 dark:text-orange-400" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Swell Factor</span>
                            <input type="number" step="0.01" value={swellFactor} onChange={(e) => setSwellFactor(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Shrink Factor</span>
                            <input type="number" step="0.01" value={shrinkFactor} onChange={(e) => setShrinkFactor(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                      </div>
                   </div>
                 </>
               )}

               {industryMode === "hydrology" && (
                 <>
                   {/* Tool Group: Water Capacity */}
                   <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[240px]">
                      <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pond Constraints</span>
                      <div className="flex gap-2 items-center flex-1">
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Max Depth (m)</span>
                            <input type="number" value={pondMaxDepth} onChange={(e) => setPondMaxDepth(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Side Slope (H:1V)</span>
                            <input type="number" step="0.5" value={pondSideSlope} onChange={(e) => setPondSideSlope(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                      </div>
                   </div>
                 </>
               )}

               {industryMode === "mining" && (
                 <>
                   {/* Tool Group: Stockpile Constraints */}
                   <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[240px]">
                      <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Stockpile Parameters</span>
                      <div className="flex gap-2 items-center flex-1">
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Repose Angle (Â°)</span>
                            <input type="number" value={stockpileReposeAngle} onChange={(e) => setStockpileReposeAngle(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                         <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Bench Width (m)</span>
                            <input type="number" value={stockpileBenchWidth} onChange={(e) => setStockpileBenchWidth(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                         </div>
                      </div>
                   </div>
                 </>
               )}
               
               {/* Tool Group: Actions */}
               <div className="flex items-center h-full min-w-[200px] pl-2 gap-2">
                  <Button onClick={handleAnalyze} disabled={isPending || !polygonCoords} className="h-[40px] flex-1 bg-[#007AC2] hover:bg-[#005a8f] text-white font-bold text-[11px] shadow-sm rounded">
                     {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calculator className="w-4 h-4 mr-1.5" />}
                     {isPending ? "Computing..." : "Run Analysis"}
                  </Button>
                  {result && (
                    <Button onClick={() => setShow3DViewer(!show3DViewer)} variant="outline" className="h-[40px] w-[40px] p-0 border-[#007AC2] text-[#007AC2] shadow-sm" title="3D Viewer">
                      <Box className="w-5 h-5" />
                    </Button>
                  )}
               </div>
             </>
           )}

           {activeTab === "geotechnical" && (
             <>
               {/* Tool Group: Soil Presets */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[150px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Soil Presets</span>
                  <div className="flex gap-2 items-center flex-1">
                     <select 
                       value={soilPreset} 
                       onChange={(e) => {
                         setSoilPreset(e.target.value);
                         const preset = SOIL_PRESETS.find(p => p.name === e.target.value);
                         if (preset && preset.name !== "Custom") {
                           setSwellFactor(preset.swell);
                           setShrinkFactor(preset.shrink);
                         }
                       }} 
                       className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1"
                     >
                       {SOIL_PRESETS.map(p => (
                         <option key={p.name} value={p.name}>{p.name}</option>
                       ))}
                     </select>
                  </div>
               </div>

               {/* Tool Group: Boreholes */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[150px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Borehole Data</span>
                  <div className="flex flex-col flex-1 items-center justify-center">
                     <span className="text-[10px] text-gray-600 dark:text-gray-400">{boreholes.length > 0 ? `${boreholes.length} boreholes loaded` : "Drag & drop CSV (Lon,Lat,Depth)"}</span>
                     {boreholes.length > 0 && <Button variant="outline" size="sm" onClick={() => setBoreholes([])} className="h-5 text-[9px] mt-1 py-0 px-2">Clear</Button>}
                  </div>
               </div>



               {/* Tool Group: Water Table */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[150px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Hydrology</span>
                  <div className="flex gap-2 items-center flex-1">
                     <div className="flex flex-col flex-1">
                        <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Water Table Depth (m)</span>
                        <input type="number" step="0.5" value={waterTableDepth} onChange={(e) => setWaterTableDepth(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 px-1 text-blue-600 dark:text-blue-400" />
                     </div>
                  </div>
               </div>

               {/* Tool Group: Strata Layers */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[300px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Subsurface Strata</span>
                  <div className="flex gap-2 items-center flex-1 overflow-x-auto">
                     {strataLayers.map((layer, idx) => (
                       <div key={idx} className="flex flex-col flex-1 min-w-[80px] p-1 bg-gray-50 dark:bg-slate-800 border rounded">
                          <span className="text-[9px] font-semibold text-gray-700 dark:text-gray-300 mb-0.5 truncate">{layer.name}</span>
                          <span className="text-[9px] text-gray-500">{layer.thickness}m (x{layer.swell})</span>
                       </div>
                     ))}
                  </div>
               </div>
             </>
           )}

           {activeTab === "reporting" && (
             <>
               {/* Tool Group: Economics */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[200px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Unit Costs</span>
                  <div className="flex gap-2 items-center flex-1">
                     <div className="flex flex-col flex-1">
                        <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Cut Rate ($/mÂ³)</span>
                        <input type="number" value={costCut} onChange={(e) => setCostCut(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1 text-red-600" />
                     </div>
                     <div className="flex flex-col flex-1">
                        <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">Fill Rate ($/mÂ³)</span>
                        <input type="number" value={costFill} onChange={(e) => setCostFill(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1 text-blue-600" />
                     </div>
                  </div>
               </div>

               {/* Tool Group: Custom DEM */}
               <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-4 h-full min-w-[200px]">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Custom Surface</span>
                  <div className="flex gap-2 items-center flex-1">
                     <div className="flex flex-col flex-1">
                        <span className="text-[9px] text-gray-600 dark:text-gray-400 mb-0.5">DEM Layer ID</span>
                        <input type="text" value={customDemId} onChange={(e) => setCustomDemId(e.target.value)} placeholder="e.g. drone_survey_2024" className="w-full h-6 text-[11px] rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-1" />
                     </div>
                  </div>
               </div>
             </>
           )}
        </div>
      </div>

      {/* Main Content Area (Map + Floating Results) */}
      <div className="flex-1 relative flex bg-gray-100">
         
         {/* Map Container */}
         <MapContainer center={[-1.9441, 30.0619]} zoom={11} className="w-full h-full z-[0]">
            <MapBoundsUpdater coords={polygonCoords} />
            <LayersControl position="bottomleft">
              <LayersControl.BaseLayer checked name="Satellite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Street Map">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              </LayersControl.BaseLayer>
            </LayersControl>

            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topleft"
                onCreated={onCreated}
                onEdited={onEdited}
                onDeleted={onDeleted}
                draw={{
                  polyline: { shapeOptions: { color: "#f97316", weight: 3 } },
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polygon: {
                    allowIntersection: false,
                    showArea: false,
                    shapeOptions: { color: "#facc15", weight: 3, dashArray: "5, 5", fillOpacity: 0 }
                  },
                  rectangle: {
                    showArea: false,
                    shapeOptions: { color: "#facc15", weight: 3, dashArray: "5, 5", fillOpacity: 0 }
                  }
                }}
              />
            </FeatureGroup>

            {result && result.heatmap_tile_url && (
              <TileLayer key={result.heatmap_tile_url} url={result.heatmap_tile_url} opacity={0.85} zIndex={10} />
            )}
            
            {result && result.max_cut_point && (
              <Marker position={[result.max_cut_point.lat, result.max_cut_point.lon]} icon={cutIcon}>
                <Tooltip permanent direction="top" className="bg-red-900/90 text-red-100 border-red-500 font-bold">
                  Max Cut: {result.max_cut_point.depth}m
                </Tooltip>
              </Marker>
            )}

            {result && result.max_fill_point && (
              <Marker position={[result.max_fill_point.lat, result.max_fill_point.lon]} icon={fillIcon}>
                <Tooltip permanent direction="bottom" className="bg-blue-900/90 text-blue-100 border-blue-500 font-bold">
                  Max Fill: {result.max_fill_point.depth}m
                </Tooltip>
              </Marker>
            )}

            {result?.logistics?.cut_centroid && result?.logistics?.fill_centroid && (
              <FeatureGroup>
                <Polyline 
                  positions={[
                    [result.logistics.cut_centroid.lat, result.logistics.cut_centroid.lon],
                    [result.logistics.fill_centroid.lat, result.logistics.fill_centroid.lon]
                  ]}
                  color="#ef4444" 
                  weight={4} 
                  dashArray="10, 10" 
                />
                <Marker position={[result.logistics.cut_centroid.lat, result.logistics.cut_centroid.lon]}>
                  <Tooltip permanent direction="top" className="bg-yellow-900/90 text-yellow-100 border-yellow-500 text-xs">Primary Cut Area</Tooltip>
                </Marker>
                <Marker position={[result.logistics.fill_centroid.lat, result.logistics.fill_centroid.lon]}>
                  <Tooltip permanent direction="bottom" className="bg-yellow-900/90 text-yellow-100 border-yellow-500 text-xs">Primary Fill Area</Tooltip>
                </Marker>
              </FeatureGroup>
            )}
         </MapContainer>
         
         {/* Floating Cross-Section Profile (Bottom) */}
         {profileData && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] h-48 bg-white/95 backdrop-blur shadow-xl border rounded-lg z-[1000] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-gray-50">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><Sliders className="w-3 h-3" /> Cross-Section Profile</span>
              <button className="text-gray-400 hover:text-red-500" onClick={() => setProfileData(null)}>âœ–</button>
            </div>
            <div className="flex-1 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profileData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="distance" tick={{fontSize: 9, fill: "#6b7280"}} axisLine={{stroke: "#d1d5db"}} tickLine={false} />
                  <YAxis tick={{fontSize: 9, fill: "#6b7280"}} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{fontSize: 10, padding: 4, borderRadius: 4, border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}} />
                  <Line type="monotone" dataKey="existing_elev" stroke="#10b981" name="Existing Terrain" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="proposed_elev" stroke="#3b82f6" name="Proposed Grade" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
         )}

         {/* ArcGIS Dockable Contents Pane (Right Side) */}
         {result && (
           <div className="absolute top-4 right-4 z-[1000] w-[320px] bg-card shadow-xl rounded-md border flex flex-col max-h-[calc(100%-2rem)] overflow-hidden">
             {/* Header */}
             <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between shrink-0">
               <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                 <Calculator className="w-4 h-4 text-[#007AC2]" /> Volumetric Report
               </h3>
               <button onClick={handleGenerateReport} disabled={isReportPending} className="text-[#007AC2] hover:text-[#005a8f] disabled:opacity-50" title="Export PDF">
                 {isReportPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>}
               </button>
             </div>
             
             {/* Body */}
             <div className="flex-1 overflow-y-auto p-3 space-y-4">
                
                {/* Volumes Block */}
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Cut & Fill Quantities</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-red-50 p-2 rounded border border-red-100 flex flex-col items-center">
                      <span className="text-red-800 font-bold text-[10px] uppercase">Total Cut</span>
                      <span className="text-red-600 font-mono text-sm mt-1">{result.adjusted_cut_m3.toLocaleString()} mÂ³</span>
                    </div>
                    <div className="bg-blue-50 p-2 rounded border border-blue-100 flex flex-col items-center">
                      <span className="text-blue-800 font-bold text-[10px] uppercase">Total Fill</span>
                      <span className="text-blue-600 font-mono text-sm mt-1">{result.adjusted_fill_m3.toLocaleString()} mÂ³</span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-[11px] bg-gray-50 p-1.5 rounded border">
                    <span className="font-semibold text-gray-600">Net Balance:</span>
                    <span className={`font-mono font-bold ${result.net_balance_m3 > 0 ? "text-red-600" : "text-blue-600"}`}>
                      {Math.abs(result.net_balance_m3).toLocaleString()} mÂ³ {result.net_balance_m3 > 0 ? "(Export)" : "(Import)"}
                    </span>
                  </div>
                </div>

                {/* Logistics */}
                {result.logistics && result.logistics.haul_distance_m > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Mass Haul Logistics</h4>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-gray-600">Avg Haul Distance:</span>
                      <span className="font-mono text-gray-800">{result.logistics.haul_distance_m.toLocaleString()} m</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-600">Haul Effort:</span>
                      <span className="font-mono text-gray-800">{result.logistics.haul_effort_m3_km.toLocaleString()} mÂ³Â·km</span>
                    </div>
                  </div>
                )}
                
                {/* Land Cover */}
                {result.land_cover && result.land_cover.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Site Clearance</h4>
                    <div className="space-y-1">
                      {result.land_cover.map((lc: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span> {lc.class_name}
                          </span>
                          <span className="font-mono text-gray-800">{lc.area_ha.toLocaleString()} ha</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
             </div>
           </div>
         )}
         
         {/* 3D Viewer Popup */}
         {show3DViewer && polygonCoords && (
          <div className="absolute inset-0 z-[2000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full h-full bg-card rounded-lg border shadow-2xl overflow-hidden relative">
              <Earthwork3DViewer 
                polygon={polygonCoords}
                targetElevation={targetElevation === "" ? undefined : targetElevation}
                slopeGrade={slopeGrade}
                slopeAngle={slopeAngle}
                topsoilDepth={topsoilDepth}
                batterRatio={batterRatio}
                customDemId={customDemId}
                onClose={() => setShow3DViewer(false)}
              />
            </div>
          </div>
         )}

      </div>
    </div>
  );
}












