const fs = require('fs');
let content = fs.readFileSync('artifacts/geoportal/src/pages/EarthworkPage.tsx', 'utf-8');

// 1. Imports
content = content.replace(
    'import { Loader2, Box, Info, Map as MapIcon, Sliders, DollarSign, Calculator, Leaf } from "lucide-react";',
    'import { Loader2, Box, Info, Map as MapIcon, Sliders, DollarSign, Calculator, Leaf, ArrowRight, ArrowDown } from "lucide-react";'
);
content = content.replace(
    'import { MapContainer, TileLayer, FeatureGroup, LayersControl, Polygon, Marker, Popup, Tooltip, useMap } from "react-leaflet";',
    'import { MapContainer, TileLayer, FeatureGroup, LayersControl, Polygon, Marker, Popup, Tooltip, useMap, Polyline } from "react-leaflet";'
);

// 2. Add Area and Section functions
const functions_to_add = 
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
;
content = content.replace('      fetchProfile(coords);\\n    }\\n  };\\n', '      fetchProfile(coords);\\n    }\\n  };\\n' + functions_to_add);
content = content.replace('      fetchProfile(coords);\\r\\n    }\\r\\n  };\\r\\n', '      fetchProfile(coords);\\r\\n    }\\r\\n  };\\r\\n' + functions_to_add);

// 3. Add auto section buttons
const old_section =                 {/* Tool Group: Profile / Cross-Section */}
                <div className="flex flex-col gap-1 pr-4 h-full min-w-[150px]">
                   <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Profile / Cross-Section</span>
                   <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">Draw a polyline on the map to generate a 2D profile view.</p>
                </div>;
const new_section =                 {/* Tool Group: Profile / Cross-Section */}
                <div className="flex flex-col gap-1 pr-4 h-full min-w-[200px]">
                   <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Profile / Cross-Section</span>
                   <div className="flex gap-2 mt-1">
                      <Button onClick={handleAutoSectionNS} disabled={!polygonCoords} className="h-6 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 px-2 rounded-sm" title="Generate North-South Section">
                        <ArrowDown className="w-3 h-3 mr-1" /> N-S Section
                      </Button>
                      <Button onClick={handleAutoSectionEW} disabled={!polygonCoords} className="h-6 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 px-2 rounded-sm" title="Generate East-West Section">
                        <ArrowRight className="w-3 h-3 mr-1" /> E-W Section
                      </Button>
                   </div>
                   <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">Draw a polyline on the map to generate a custom 2D profile view.</p>
                </div>;
content = content.replace(old_section, new_section);
content = content.replace(old_section.replace(/\\n/g, '\\r\\n'), new_section.replace(/\\n/g, '\\r\\n'));

// 4. Add logistics arrow to MapContainer
const old_map_end =             {result && result.max_fill_point && (
              <Marker position={[result.max_fill_point.lat, result.max_fill_point.lon]} icon={fillIcon}>
                <Tooltip permanent direction="bottom" className="bg-blue-900/90 text-blue-100 border-blue-500 font-bold">
                  Max Fill: {result.max_fill_point.depth}m
                </Tooltip>
              </Marker>
            )}
         </MapContainer>;
const new_map_end =             {result && result.max_fill_point && (
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
         </MapContainer>;
content = content.replace(old_map_end, new_map_end);
content = content.replace(old_map_end.replace(/\\n/g, '\\r\\n'), new_map_end.replace(/\\n/g, '\\r\\n'));

// 5. Add Area Warning in Report
const old_report_start =              {/* Content */}
             <div className="flex-1 overflow-y-auto p-3 bg-white text-[11px] custom-scrollbar">
               <div className="space-y-4">;
const new_report_start =              {/* Content */}
             <div className="flex-1 overflow-y-auto p-3 bg-white text-[11px] custom-scrollbar">
               
               {polygonCoords && getApproxArea(polygonCoords) < 20000 && !customDemId && (
                 <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-start gap-2">
                   <Info className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                   <p className="text-yellow-700 leading-relaxed text-[11px]">
                     <strong>Resolution Warning:</strong> Site is small ({(getApproxArea(polygonCoords)/10000).toFixed(2)} Ha). 
                     The default 30m DEM lacks detail here. 
                     Please drag & drop a Custom Drone DEM (.tif) for accurate volumes.
                   </p>
                 </div>
               )}

               <div className="space-y-4">;
content = content.replace(old_report_start, new_report_start);
content = content.replace(old_report_start.replace(/\\n/g, '\\r\\n'), new_report_start.replace(/\\n/g, '\\r\\n'));

fs.writeFileSync('artifacts/geoportal/src/pages/EarthworkPage.tsx', content, 'utf-8');
console.log("Done patching.");
