import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import { useToast } from "@/hooks/use-toast";

export function NativeRasterLayer({ url }: { url: string | null }) {
  const map = useMap();
  const { toast } = useToast();
  const [layer, setLayer] = useState<any>(null);

  useEffect(() => {
    if (!url) {
      if (layer) {
        map.removeLayer(layer);
        setLayer(null);
      }
      return;
    }

    if (url.includes("{")) return;

    let isMounted = true;
    let newLayer: any = null;

    const loadGeoraster = async () => {
      try {
        const georaster = await parseGeoraster(url);
        if (!isMounted) return;

        // Auto-detect if we need scaling by sampling the first band
        let needsScaling = false;
        let pMin = 0;
        let pMax = 255;
        let isFloat = false;

        if (georaster.values && georaster.values[0]) {
            const b1 = georaster.values[0];
            const row = Array.isArray(b1[0]) ? b1[Math.floor(b1.length / 2)] : b1;
            let sampleMin = Infinity;
            let sampleMax = -Infinity;
            
            for (let i = 0; i < Math.min(2000, row.length); i++) {
                const v = row[i];
                if (v !== georaster.noDataValue && !isNaN(v)) {
                    if (v > 255 || v < 0) needsScaling = true;
                    if (v % 1 !== 0) isFloat = true;
                    if (v < sampleMin) sampleMin = v;
                    if (v > sampleMax) sampleMax = v;
                }
            }
            
            if (sampleMin !== Infinity && sampleMax !== -Infinity) {
                pMin = sampleMin;
                // If it's a satellite image (0-10000), 3000-4000 is a better visual max than 10000
                if (sampleMax > 2000 && sampleMax <= 15000) pMax = Math.min(sampleMax, 3500);
                else pMax = sampleMax;
            }
            if (isFloat) needsScaling = true; // For things like NDVI (-1 to 1)
        }

        // Use georaster metadata if available and reasonable
        if (georaster.mins && georaster.mins[0] !== undefined) pMin = georaster.mins[0];
        if (georaster.maxs && georaster.maxs[0] !== undefined && georaster.maxs[0] !== 255) {
            pMax = georaster.maxs[0];
            if (pMax > 2000 && pMax <= 15000) pMax = 3500; // Visual stretch for Sentinel-2
            needsScaling = true;
        }

        const range = pMax - pMin;

        newLayer = new GeoRasterLayer({
          georaster: georaster,
          opacity: 1.0,
          resolution: 64, // Lowered from 256 to prevent WebAssembly OOM
          pixelValuesToColorFn: (values: number[]) => {
            // Ignore noData values
            if (values.every(v => v === 0 || v === georaster.noDataValue || isNaN(v))) return null;
            
            // Map values to 0-255 based on raster min/max
            const scale = (val: number) => {
              if (!needsScaling && !isFloat) return val;
              if (range <= 0) return 0;
              return Math.min(255, Math.max(0, Math.round(((val - pMin) / range) * 255)));
            };

            // RGB or RGBA (Bands 1,2,3 -> RGB)
            if (values.length >= 3) {
              const r = scale(values[0]);
              const g = scale(values[1]);
              const b = scale(values[2]);
              return `rgb(${r},${g},${b})`;
            }
            
            // Grayscale (1 Band)
            if (values.length === 1) {
              const v = scale(values[0]);
              // Basic pseudo-color for common single-band types if we want, but grayscale is safest
              // You can expand this if you know it's NDVI (e.g. green/brown)
              return `rgb(${v},${v},${v})`;
            }

            return null;
          }
        });

        newLayer.addTo(map);
        try {
            map.fitBounds(newLayer.getBounds());
        } catch(e) {}
        setLayer(newLayer);
        toast({ title: "Success", description: "Raster loaded natively on map." });
      } catch (e: any) {
        if (!isMounted) return;
        console.error("Georaster error:", e);
        toast({ variant: "destructive", title: "Raster Load Failed", description: e.message || "Failed to load raster natively. Ensure CORS is enabled." });
      }
    };

    if (layer) {
      map.removeLayer(layer);
    }
    loadGeoraster();

    return () => {
      isMounted = false;
      if (newLayer) {
        try { map.removeLayer(newLayer); } catch(e) {}
      }
    };
  }, [url, map]); // Removed toast from dependencies to prevent re-renders

  return null;
}
