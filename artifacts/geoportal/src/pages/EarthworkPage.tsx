import { useState, useRef, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Box, Info, Map as MapIcon, Sliders, DollarSign, Calculator } from "lucide-react";
import { MapContainer, TileLayer, FeatureGroup, LayersControl, Polygon, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { api } from "@/lib/api";

export default function EarthworkPage() {
  const [polygonCoords, setPolygonCoords] = useState<number[][] | null>(null);
  const [targetElevation, setTargetElevation] = useState<number | "">("");
  
  // Phase 1 & 2 states
  const [topsoilDepth, setTopsoilDepth] = useState<number>(0);
  const [slopeGrade, setSlopeGrade] = useState<number>(0);
  const [slopeAngle, setSlopeAngle] = useState<number>(0);
  
  const [swellFactor, setSwellFactor] = useState<number>(1.2);
  const [shrinkFactor, setShrinkFactor] = useState<number>(0.9);
  
  const [strataLayers, setStrataLayers] = useState<any[]>([
    { name: "Common Earth", thickness: 2.0, swell: 1.2 },
    { name: "Soft Rock", thickness: 3.0, swell: 1.4 }
  ]);
  
  const [costCut, setCostCut] = useState<number>(15); // $15 per m3
  const [costFill, setCostFill] = useState<number>(20); // $20 per m3

  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    // Ensure only one polygon is drawn at a time
    if (featureGroupRef.current) {
      const fg = featureGroupRef.current;
      fg.clearLayers();
      fg.addLayer(layer);
    }

    const latlngs = layer.getLatLngs()[0];
    // IMPORTANT: Earth Engine expects [longitude, latitude]
    const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
    // Close the polygon
    coords.push([latlngs[0].lng, latlngs[0].lat]);
    setPolygonCoords(coords);
    
    // Reset result and target elevation when a new polygon is drawn
    setResult(null);
    setTargetElevation("");
  };

  const onEdited = (e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: any) => {
      const latlngs = layer.getLatLngs()[0];
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      coords.push([latlngs[0].lng, latlngs[0].lat]);
      setPolygonCoords(coords);
    });
    setResult(null);
  };

  const onDeleted = () => {
    setPolygonCoords(null);
    setResult(null);
    setTargetElevation("");
  };

  const handleAnalyze = async () => {
    if (!polygonCoords) {
      setError("Please draw a polygon on the map first.");
      return;
    }
    setError(null);
    setIsPending(true);
    
    try {
      const data = await api.earthwork.analyze({
        polygon: polygonCoords,
        target_elevation: targetElevation === "" ? undefined : Number(targetElevation),
        swell_factor: swellFactor,
        shrink_factor: shrinkFactor,
        topsoil_depth: topsoilDepth,
        slope_grade: slopeGrade,
        slope_angle: slopeAngle,
        strata_layers: strataLayers
      });
      setResult(data);
      if (targetElevation === "") {
        setTargetElevation(data.mean_elevation);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze earthwork.");
    } finally {
      setIsPending(false);
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

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full border-r bg-card flex flex-col gap-6 p-5 overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-xl">
            <Box className="w-6 h-6" />
            Earthwork Estimator
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Professional Cut & Fill analysis using highly accurate Copernicus GLO-30 DEM. Draw a polygon on the map to begin.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <MapIcon className="w-4 h-4 text-primary" /> 1. Define Site Area
              </Label>
              <p className="text-xs text-muted-foreground">
                Use the drawing tools on the map to draw your site boundary.
              </p>
              <div className="h-8 flex items-center px-3 bg-muted rounded border text-xs font-mono">
                {polygonCoords ? `Polygon: ${polygonCoords.length - 1} vertices` : "No area selected"}
              </div>
            </div>

            <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-primary" /> 2. Pad Grading & Elevation
              </Label>
              <div className="space-y-2 mt-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Target Elevation (m)</Label>
                  <input
                    type="number"
                    value={targetElevation}
                    onChange={(e) => setTargetElevation(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                    placeholder="Auto (Mean Elevation)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Slope Grade (%)</Label>
                    <input
                      type="number"
                      step="0.5"
                      value={slopeGrade}
                      onChange={(e) => setSlopeGrade(Number(e.target.value))}
                      className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Direction (Azimuth °)</Label>
                    <input
                      type="number"
                      value={slopeAngle}
                      onChange={(e) => setSlopeAngle(Number(e.target.value))}
                      className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                      placeholder="e.g. 180 for South"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-primary" /> 3. Topsoil & Strata
              </Label>
              <div className="space-y-3 mt-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground font-semibold text-orange-500">Topsoil Stripping Depth (m)</Label>
                  <input
                    type="number"
                    step="0.1"
                    value={topsoilDepth}
                    onChange={(e) => setTopsoilDepth(Number(e.target.value))}
                    className="w-full h-8 text-xs rounded border border-orange-500/50 bg-orange-500/5 px-2"
                    title="Amount of topsoil to strip across the entire site before excavation"
                  />
                </div>
                <div className="border-t pt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Sub-Surface Strata Layers (Cut)</Label>
                  {strataLayers.map((layer, idx) => (
                    <div key={idx} className="flex gap-1 mb-1">
                      <input 
                        type="text" 
                        value={layer.name} 
                        onChange={(e) => { const newLayers = [...strataLayers]; newLayers[idx].name = e.target.value; setStrataLayers(newLayers); }}
                        className="w-1/2 h-7 text-[10px] rounded border px-1 bg-background" 
                        placeholder="Name" 
                      />
                      <input 
                        type="number" 
                        step="0.5" 
                        value={layer.thickness} 
                        onChange={(e) => { const newLayers = [...strataLayers]; newLayers[idx].thickness = Number(e.target.value); setStrataLayers(newLayers); }}
                        className="w-1/4 h-7 text-[10px] rounded border px-1 bg-background" 
                        title="Thickness (m)" 
                      />
                      <input 
                        type="number" 
                        step="0.1" 
                        value={layer.swell} 
                        onChange={(e) => { const newLayers = [...strataLayers]; newLayers[idx].swell = Number(e.target.value); setStrataLayers(newLayers); }}
                        className="w-1/4 h-7 text-[10px] rounded border px-1 bg-background" 
                        title="Swell Factor" 
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setStrataLayers([...strataLayers, {name: "New Layer", thickness: 1.0, swell: 1.2}])}>
                      + Add Strata
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setStrataLayers(strataLayers.slice(0, -1))} disabled={strataLayers.length === 0}>
                      - Remove
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-primary" /> 4. Cost Estimation
              </Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Cut Cost ($/m³)</Label>
                  <input
                    type="number"
                    value={costCut}
                    onChange={(e) => setCostCut(Number(e.target.value))}
                    className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Fill Cost ($/m³)</Label>
                  <input
                    type="number"
                    value={costFill}
                    onChange={(e) => setCostFill(Number(e.target.value))}
                    className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full gap-2 mt-2"
              onClick={handleAnalyze}
              disabled={isPending || !polygonCoords}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
              {isPending ? "Computing..." : "Calculate Earthwork"}
            </Button>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded p-2 border border-destructive/20 mt-2">
                {error}
              </p>
            )}
          </div>
        </aside>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={75} className="relative flex flex-col">
        <div className="flex-1 relative z-0">
          <MapContainer center={[-1.9441, 30.0619]} zoom={11} className="w-full h-full">
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Satellite">
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution="Tiles &copy; Esri"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Street Map">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topleft"
                onCreated={onCreated}
                onEdited={onEdited}
                onDeleted={onDeleted}
                draw={{
                  polyline: false,
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

            {/* Display Cut/Fill Heatmap Layer */}
            {result && result.heatmap_tile_url && (
              <TileLayer 
                key={result.heatmap_tile_url}
                url={result.heatmap_tile_url} 
                opacity={0.85} 
                zIndex={10} 
              />
            )}

            {/* Pinpoint Max Cut */}
            {result && result.max_cut_point && (
              <Marker position={[result.max_cut_point.lat, result.max_cut_point.lon]} icon={cutIcon}>
                <Tooltip permanent direction="top" className="bg-red-900/90 text-red-100 border-red-500 font-bold">
                  Max Cut: {result.max_cut_point.depth}m
                </Tooltip>
              </Marker>
            )}

            {/* Pinpoint Max Fill */}
            {result && result.max_fill_point && (
              <Marker position={[result.max_fill_point.lat, result.max_fill_point.lon]} icon={fillIcon}>
                <Tooltip permanent direction="bottom" className="bg-blue-900/90 text-blue-100 border-blue-500 font-bold">
                  Max Fill: {result.max_fill_point.depth}m
                </Tooltip>
              </Marker>
            )}
          </MapContainer>

          {/* Professional Cut/Fill Legend */}
          {result && (
            <div className="absolute top-24 right-6 z-[2000] bg-[#1a1f2e]/95 backdrop-blur-md border border-[#3b82f6]/30 rounded-xl shadow-2xl p-4 w-64 pointer-events-none">
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
                <MapIcon className="w-4 h-4 text-[#3b82f6]" />
                Cut / Fill Depth Map
              </h4>
              
              <div className="space-y-4 text-xs font-medium">
                {/* Cut Section */}
                <div>
                  <div className="flex justify-between text-red-200 mb-1.5">
                    <span>Deep Cut</span>
                    <span>0m</span>
                  </div>
                  <div className="h-3 rounded-full w-full bg-gradient-to-r from-[#fc9272] via-[#ef3b2c] to-[#99000d] border border-red-500/20"></div>
                </div>

                {/* Fill Section */}
                <div>
                  <div className="flex justify-between text-blue-200 mb-1.5">
                    <span>0m</span>
                    <span>Deep Fill</span>
                  </div>
                  <div className="h-3 rounded-full w-full bg-gradient-to-r from-[#9ecae1] via-[#4292c6] to-[#084594] border border-blue-500/20"></div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-4 leading-tight">
                Areas in red require excavation (cut). Areas in blue require additional material (fill).
              </p>
            </div>
          )}
        </div>

        {/* Floating Results Panel */}
        {result && (
          <div className="absolute bottom-6 left-6 z-[1000] w-96 bg-background/95 backdrop-blur shadow-2xl border border-primary/20 rounded-xl overflow-hidden flex flex-col">
            <div className="bg-primary px-4 py-2 text-primary-foreground font-semibold flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Earthwork Report
            </div>
            
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Site Area</p>
                  <p className="text-lg font-mono">{(result.area_m2 / 10000).toFixed(2)} <span className="text-sm text-muted-foreground">ha</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Target Elevation</p>
                  <p className="text-lg font-mono">{result.target_elevation} <span className="text-sm text-muted-foreground">m</span></p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-destructive flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-destructive/80"></div> Total Cut (Excavation)</span>
                  <span className="font-mono text-base">{result.adjusted_cut_m3.toLocaleString()} m³</span>
                </div>
                <div className="text-xs text-muted-foreground pl-4 border-l-2 ml-1 space-y-1">
                  {result.strata_results && result.strata_results.map((strata: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>↳ {strata.name}</span>
                      <span>{strata.adjusted_m3.toLocaleString()} m³</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-1 border-t mt-1 text-foreground">
                    <span>Est. Cost</span>
                    <span>${(result.adjusted_cut_m3 * costCut).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm pt-2">
                  <span className="font-semibold text-blue-600 flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-600/80"></div> Total Fill (Embankment)</span>
                  <span className="font-mono text-base">{result.adjusted_fill_m3.toLocaleString()} m³</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground pl-4 border-l-2 ml-1">
                  <span>Raw Vol: {result.raw_fill_m3.toLocaleString()} m³</span>
                  <span>Cost: ${(result.adjusted_fill_m3 * costFill).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">Net Balance:</span>
                  <span className={`font-bold font-mono ${result.net_balance_m3 > 0 ? "text-destructive" : "text-blue-600"}`}>
                    {Math.abs(result.net_balance_m3).toLocaleString()} m³ {result.net_balance_m3 > 0 ? "(Export)" : "(Import)"}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-bold text-sm">Total Est. Cost:</span>
                  <span className="font-bold font-mono text-lg text-primary">
                    ${((result.adjusted_cut_m3 * costCut) + (result.adjusted_fill_m3 * costFill)).toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {result.logistics && result.logistics.haul_distance_m > 0 && (
                <div className="pt-3 border-t bg-muted/20 -mx-4 -mb-4 p-4 mt-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Mass Haul Logistics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Avg. Haul Distance</p>
                      <p className="font-mono text-sm">{result.logistics.haul_distance_m.toLocaleString()} m</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Haul Effort</p>
                      <p className="font-mono text-sm">{result.logistics.haul_effort_m3_km.toLocaleString()} <span className="text-[10px]">m³·km</span></p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
