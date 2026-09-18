import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, CircleMarker, Popup, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default icon path broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface LegendItem {
  color: string;
  label: string;
}

export interface MapFacility {
  lon: number;
  lat: number;
  name: string;
  type: string;
  isNearest?: boolean;
  isFarthest?: boolean;
}

interface Props {
  center?: [number, number];
  bbox?: number[][];
  tileUrl?: string;
  zoom?: number;
  title?: string;
  legend?: LegendItem[];
  dataSource?: string;
  overlayUrl?: string;
  facilities?: MapFacility[];
  nearestRoadGeojson?: any;
  farthestRoadGeojson?: any;
  incidents?: { lon: number; lat: number; name: string }[];
  routes?: { geometry: any; incident_name: string; facility_name: string; distance_km: number }[];
  aoi?: any;
  basemap?: string;
}

/** Updates the GEE tile layer when tileUrl changes. */
function GEELayer({ tileUrl }: { tileUrl: string }) {
  const map = useMap();
  const layersRef = useRef<Record<string, L.TileLayer>>({});

  useEffect(() => {
    if (!tileUrl) return;

    if (!layersRef.current[tileUrl]) {
      const layer = L.tileLayer(tileUrl, {
        attribution: "Google Earth Engine",
        opacity: 0, // Add hidden initially
      });
      layer.addTo(map);
      layersRef.current[tileUrl] = layer;
    }

    // Hide all layers
    Object.values(layersRef.current).forEach(layer => layer.setOpacity(0));
    
    // Show active layer
    const activeLayer = layersRef.current[tileUrl];
    activeLayer.setOpacity(0.85);

    // We purposely do NOT return map.removeLayer() here.
    // Keeping inactive layers on the map with opacity 0 ensures Leaflet
    // retains the DOM nodes and image data, making switching back 100% instant.
    return () => {
      // Only clean up layers when the map completely unmounts
    };
  }, [tileUrl, map]);
  
  return null;
}

/** Fly to a new center/bounds when it changes. */
function FlyTo({ center, zoom, bbox }: { center?: [number, number]; zoom: number; bbox?: number[][] }) {
  const map = useMap();
  const safeCenter = center || [-1.94, 29.87]; // Default to Rwanda center
  const centerStr = JSON.stringify(safeCenter);
  const bboxStr = JSON.stringify(bbox || null);

  useEffect(() => {
    if (!centerStr) return;
    const parsedCenter = JSON.parse(centerStr);
    const parsedBbox = JSON.parse(bboxStr);

    if (parsedBbox && parsedBbox.length >= 4) {
      const latMin = Math.min(...parsedBbox.map((c: any) => c[1]));
      const latMax = Math.max(...parsedBbox.map((c: any) => c[1]));
      const lonMin = Math.min(...parsedBbox.map((c: any) => c[0]));
      const lonMax = Math.max(...parsedBbox.map((c: any) => c[0]));
      map.flyToBounds([[latMin, lonMin], [latMax, lonMax]], { duration: 1.2, maxZoom: 14 });
    } else {
      map.flyTo(parsedCenter, zoom, { duration: 1.2 });
    }
  }, [centerStr, zoom, bboxStr, map]);
  return null;
}

/** Leaflet scale bar (metric). */
function ScaleBar() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control.scale({ imperial: false, position: "bottomleft" });
    ctrl.addTo(map);
    return () => { map.removeControl(ctrl); };
  }, [map]);
  return null;
}

/** North arrow SVG. */
function NorthArrow() {
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="14,2 20,18 14,14 8,18" fill="#1a1a1a" />
      <polygon points="14,34 8,18 14,22 20,18" fill="#888" />
      <text x="14" y="10" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#fff" dy="-1">N</text>
    </svg>
  );
}

export function DistrictMap({
  center = [-1.94, 29.87],
  bbox,
  tileUrl,
  zoom = 10,
  title,
  legend,
  dataSource = "Source: Google Earth Engine · ESA WorldCover · USGS SRTM · CARTO",
  overlayUrl,
  facilities,
  nearestRoadGeojson,
  farthestRoadGeojson,
  incidents,
  routes,
  basemap: initialBasemap = "dark",
}: Props) {
  const [activeBasemap, setActiveBasemap] = useState(initialBasemap);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", borderRadius: "0.5rem" }}
        scrollWheelZoom
      >
        {activeBasemap === "light" && (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
        )}
        {activeBasemap === "dark" && (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
        )}
        {activeBasemap === "satellite" && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />
        )}
        {activeBasemap === "terrain" && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />
        )}
        {activeBasemap === "osm" && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        )}
        {tileUrl && <GEELayer tileUrl={tileUrl} />}
        {overlayUrl && <GEELayer tileUrl={overlayUrl} />}
        {facilities && facilities.map((f, i) => {
          const isHighlight = f.isNearest || f.isFarthest;
          const color = f.isNearest ? "#22c55e" : f.isFarthest ? "#ef4444" : "#3b82f6";
          const fillColor = f.isNearest ? "#4ade80" : f.isFarthest ? "#f87171" : "#60a5fa";
          
          return (
            <CircleMarker
              key={i}
              center={[f.lat, f.lon]}
              radius={isHighlight ? 6 : 4}
              color={color}
              weight={isHighlight ? 2 : 1}
              fillColor={fillColor}
              fillOpacity={0.8}
            >
              <Popup>
                <div className="text-sm">
                  <strong className="block mb-1 text-primary">{f.name}</strong>
                  <div className="capitalize text-muted-foreground">Type: {f.type}</div>
                  {f.isNearest && <div className="text-green-600 font-semibold mt-1">Nearest Facility</div>}
                  {f.isFarthest && <div className="text-red-600 font-semibold mt-1">Farthest Facility</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        {nearestRoadGeojson && (
          <GeoJSON 
            data={nearestRoadGeojson} 
            style={{ color: "#22c55e", weight: 6, opacity: 0.8 }} 
          />
        )}
        {farthestRoadGeojson && (
          <GeoJSON 
            data={farthestRoadGeojson} 
            style={{ color: "#ef4444", weight: 6, opacity: 0.8 }} 
          />
        )}
        {routes && routes.map((r, i) => (
          <GeoJSON 
            key={`route-${i}`} 
            data={r.geometry} 
            style={{ color: "#8b5cf6", weight: 3, opacity: 0.8, dashArray: "5, 5" }} 
          >
            <Popup>
              <div className="text-sm">
                <strong className="block mb-1 text-primary">Route</strong>
                <div className="text-muted-foreground">From: {r.incident_name}</div>
                <div className="text-muted-foreground">To: {r.facility_name}</div>
                <div className="font-semibold mt-1">Distance: {r.distance_km} km</div>
              </div>
            </Popup>
          </GeoJSON>
        ))}
        {incidents && incidents.map((inc, i) => (
          <CircleMarker
            key={`inc-${i}`}
            center={[inc.lat, inc.lon]}
            radius={3}
            color="#4b5563"
            weight={1}
            fillColor="#9ca3af"
            fillOpacity={0.8}
          >
            <Popup>
              <div className="text-sm">
                <strong className="block text-primary">Settlement</strong>
                <div className="text-muted-foreground">{inc.name}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        <FlyTo center={center} zoom={zoom} bbox={bbox} />
        <ScaleBar />
      </MapContainer>

      {/* Map title */}
      {title && (
        <div
          style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 1000 }}
          className="bg-card/90 border border-border shadow rounded px-3 py-1 text-xs font-semibold text-foreground pointer-events-none whitespace-nowrap"
        >
          {title}
        </div>
      )}

      {/* North arrow */}
      <div
        style={{ position: "absolute", top: 8, right: 8, zIndex: 1000 }}
        className="bg-card/90 border border-border shadow rounded p-1 pointer-events-none"
        title="North"
      >
        <NorthArrow />
      </div>

      {/* Basemap Switcher */}
      <div
        style={{ position: "absolute", top: 8, left: 50, zIndex: 1000 }}
        className="bg-card/90 border border-border shadow-sm rounded overflow-hidden pointer-events-auto flex items-center"
      >
        <select
          value={activeBasemap}
          onChange={(e) => setActiveBasemap(e.target.value as any)}
          className="text-xs bg-transparent border-none outline-none cursor-pointer py-1 px-2 text-foreground font-medium"
        >
          <option value="dark">Carto Dark</option>
          <option value="light">Carto Light</option>
          <option value="satellite">Satellite</option>
          <option value="terrain">Terrain</option>
          <option value="osm">OpenStreetMap</option>
        </select>
      </div>

      {/* Legend */}
      {legend && legend.length > 0 && (
        <div
          style={{ position: "absolute", bottom: 28, right: 8, zIndex: 1000 }}
          className="bg-card/92 border border-border shadow rounded p-2 pointer-events-none text-[11px]"
        >
          <p className="font-semibold text-foreground mb-1">Legend</p>
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 py-0.5">
              <span
                style={{ backgroundColor: item.color }}
                className="w-3 h-3 rounded-sm border border-black/20"
              />
              <span className="text-muted-foreground font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Data Source */}
      {dataSource && (
        <div
          style={{ position: "absolute", bottom: 0, right: 0, zIndex: 1000 }}
          className="bg-card/70 px-2 py-0.5 text-[9px] text-muted-foreground pointer-events-none rounded-tl"
        >
          {dataSource}
        </div>
      )}</div>
  );
}
