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

        newLayer = new GeoRasterLayer({
          georaster: georaster,
          opacity: 0.8,
          resolution: 64, // Lowered from 256 to prevent WebAssembly OOM
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
