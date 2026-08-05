import os
import re

file_path = "SampleDigitizationPage.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { MapContainer, TileLayer, GeoJSON, Polyline as LeafletPolyline, Polygon as LeafletPolygon, useMapEvents, useMap } from "react-leaflet";',
    'import { MapContainer, TileLayer, GeoJSON, Polyline as LeafletPolyline, Polygon as LeafletPolygon, useMapEvents, useMap, FeatureGroup } from "react-leaflet";\nimport { EditControl } from "react-leaflet-draw";'
)
content = content.replace(
    'import "leaflet/dist/leaflet.css";',
    'import "leaflet/dist/leaflet.css";\nimport "leaflet-draw/dist/leaflet.draw.css";'
)
content = content.replace(
    'import {\n  Loader2,',
    'import {\n  Circle,\n  Loader2,'
)

# 2. Draw mode state & autoStart
content = content.replace(
    'const [drawMode, setDrawMode] = useState<"point" | "polyline" | "polygon" | "rectangle">("point");',
    'const [drawMode, setDrawMode] = useState<"point" | "polyline" | "polygon" | "rectangle" | "circle">("point");\n  const [pendingFeature, setPendingFeature] = useState<{ layer: any; type: string } | null>(null);\n  const editGroupRef = useRef<any>(null);\n\n  const autoStartDrawMode = useCallback((tool: string, editing: boolean) => {\n    if (!editing) return;\n    const toolToCss: Record<string, string> = {\n      point: "leaflet-draw-draw-marker",\n      polyline: "leaflet-draw-draw-polyline",\n      polygon: "leaflet-draw-draw-polygon",\n      rectangle: "leaflet-draw-draw-rectangle",\n      circle: "leaflet-draw-draw-circle",\n    };\n    const cssClass = toolToCss[tool];\n    if (!cssClass) return;\n\n    let retries = 10;\n    const tryClick = () => {\n      const btn = document.querySelector(`a.${cssClass}`) as HTMLElement;\n      if (btn) btn.click();\n      else if (retries > 0) {\n        retries--;\n        setTimeout(tryClick, 200);\n      }\n    };\n    tryClick();\n  }, []);'
)

# 3. Update activePoints usage/mapclick (remove MapClickHandler rendering)
content = content.replace(
    '<MapClickHandler onMapClick={handleMapClick} />',
    '{/* MapClickHandler replaced by EditControl */}'
)

content = content.replace(
    '{activePoints.length >= 2 && (drawMode === "polyline" || drawMode === "polygon") && (\n                    <LeafletPolyline\n                      positions={activePoints}\n                      pathOptions={{ color: "#f59e0b", weight: 3, dashArray: "5, 5" }}\n                    />\n                  )}\n                  {activePoints.length >= 3 && drawMode === "polygon" && (\n                    <LeafletPolygon\n                      positions={activePoints}\n                      pathOptions={{ color: "#22c55e", fillOpacity: 0.1, weight: 1, dashArray: "4, 4" }}\n                    />\n                  )}',
    ''
)

# 4. Inject EditControl in MapContainer
edit_control_jsx = """
                  <FeatureGroup ref={editGroupRef}>
                    {isEditing && (
                      <EditControl
                        position="topright"
                        onCreated={(e: any) => {
                          setPendingFeature({ layer: e.layer, type: e.layerType });
                          toast({ title: `${e.layerType} drawn`, description: "Adjust if needed, then click Confirm Capture." });
                        }}
                        onEdited={(e: any) => {
                          toast({ title: `Shape updated`, description: "Click Confirm Capture when ready." });
                        }}
                        onDeleted={() => {
                          setPendingFeature(null);
                          toast({ title: "Shape removed" });
                        }}
                        draw={{
                          marker: drawMode === "point" ? { repeatMode: false } : false,
                          polyline: drawMode === "polyline" ? { shapeOptions: { color: "#f59e0b", weight: 3 } } : false,
                          polygon: drawMode === "polygon" ? { shapeOptions: { color: "#22c55e", fillOpacity: 0.3 } } : false,
                          rectangle: drawMode === "rectangle" ? { shapeOptions: { color: "#eab308", fillOpacity: 0.1 } } : false,
                          circle: drawMode === "circle" ? { shapeOptions: { color: "#06b6d4", fillOpacity: 0.2 } } : false,
                          circlemarker: false,
                        }}
                        edit={{
                          edit: true,
                          remove: true,
                        }}
                      />
                    )}
                  </FeatureGroup>
"""
content = content.replace(
    '<MapBoundsController bbox={activeBbox} />',
    '<MapBoundsController bbox={activeBbox} />\n' + edit_control_jsx
)

# 5. UI Updates for pendingFeature and mode switching
content = content.replace(
    'onClick={() => { setDrawMode("point"); setActivePoints([]); }}',
    'onClick={() => { setDrawMode("point"); autoStartDrawMode("point", isEditing); }}'
)
content = content.replace(
    'onClick={() => { setDrawMode("polyline"); setActivePoints([]); }}',
    'onClick={() => { setDrawMode("polyline"); autoStartDrawMode("polyline", isEditing); }}'
)
content = content.replace(
    'onClick={() => { setDrawMode("polygon"); setActivePoints([]); }}',
    'onClick={() => { setDrawMode("polygon"); autoStartDrawMode("polygon", isEditing); }}'
)
content = content.replace(
    'onClick={() => { setDrawMode("rectangle"); setActivePoints([]); }}',
    'onClick={() => { setDrawMode("rectangle"); autoStartDrawMode("rectangle", isEditing); }}'
)

# Add Circle Button
circle_btn = """
                  <button
                    type="button"
                    onClick={() => { setDrawMode("circle"); autoStartDrawMode("circle", isEditing); }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      drawMode === "circle" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Circle className="w-3.5 h-3.5" /> Circle
                  </button>
"""
content = content.replace(
    '<Square className="w-3.5 h-3.5" /> Rectangle\n                  </button>',
    '<Square className="w-3.5 h-3.5" /> Rectangle\n                  </button>' + circle_btn
)

# Start Editing Session update
content = content.replace(
    'setIsEditing(true);\n                        setSessionSamples([]);\n                        toast({ title: "Edit Session Started 🟢", description: "Digitize features and click Stop Edit when finished." });',
    'setIsEditing(true);\n                        setSessionSamples([]);\n                        toast({ title: "Edit Session Started 🟢", description: "Digitize features and click Stop Edit when finished." });\n                        setTimeout(() => autoStartDrawMode(drawMode, true), 300);'
)

# Replace activePoints UI with pendingFeature UI
pending_ui = """
              {pendingFeature && (
                <div className="flex items-center justify-between bg-amber-950/50 border border-amber-500/40 p-2.5 rounded-lg text-xs animate-in fade-in">
                  <span className="flex items-center gap-2 text-amber-300 font-medium">
                    <Activity className="w-4 h-4 animate-pulse text-amber-400" />
                    Pending {pendingFeature.type} drawn. Adjust if needed.
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-500 text-white font-bold" onClick={() => {
                      const { layer, type } = pendingFeature;
                      let geojson = layer.toGeoJSON();
                      
                      // Handle Leaflet Draw circle which exports Point instead of Polygon by default
                      if (type === 'circle') {
                         const radius = layer.getRadius();
                         // Create a basic GeoJSON representation for the circle
                         // (Usually stored as a Point with a radius property, or converted to a Polygon)
                         // Here we store it as a Polygon approximating the circle
                         const center = layer.getLatLng();
                         const points = 64;
                         const coords = [];
                         for (let i = 0; i < points; i++) {
                           const angle = (i * 360) / points;
                           const pt = L.GeometryUtil.destination(center, angle, radius);
                           coords.push([pt.lng, pt.lat]);
                         }
                         coords.push(coords[0]); // Close the polygon
                         geojson = {
                            type: 'Feature',
                            properties: { radius: radius },
                            geometry: {
                                type: 'Polygon',
                                coordinates: [coords]
                            }
                         };
                      }
                      
                      commitGeometryDirectly(geojson.geometry);
                      if (editGroupRef.current) editGroupRef.current.removeLayer(layer);
                      setPendingFeature(null);
                      autoStartDrawMode(drawMode, isEditing);
                    }}>
                      <Check className="w-3.5 h-3.5" /> Confirm Capture
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
                      if (editGroupRef.current) editGroupRef.current.removeLayer(pendingFeature.layer);
                      setPendingFeature(null);
                      toast({ title: "Drawing discarded." });
                      autoStartDrawMode(drawMode, isEditing);
                    }}>
                      <X className="w-3.5 h-3.5" /> Discard
                    </Button>
                  </div>
                </div>
              )}
"""

content = re.sub(
    r'\{activePoints\.length > 0 && \(\s*<div.*?ActivePoints.*?</div>\s*\)}',
    '',
    content,
    flags=re.DOTALL
)

# The active points block looks like this: {activePoints.length > 0 && ( ... )}
# Let's just find the exact block from the view_file.
# " {activePoints.length > 0 && ("
content = re.sub(
    r'\{activePoints\.length > 0 && \([\s\S]*?Cancel[\s\S]*?</Button>\s*</div>\s*</div>\s*\)\}',
    pending_ui,
    content
)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Refactor complete.")
