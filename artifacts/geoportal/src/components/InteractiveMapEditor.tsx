import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { toPng, toJpeg } from "html-to-image";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Settings2, ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Type, Trash2, PlusCircle, Grid3X3, AlignLeft, AlignCenter, AlignRight, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Group, Ungroup, Bold, Italic, Underline } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BASE } from "@/lib/api";

interface ElementData {
  id: string;
  type: "map" | "text" | "legend" | "scale" | "northArrow" | "image";
  x: number;
  y: number;
  width: number | string;
  height: number | string;
  content?: string; // Text content or image URL
  color?: string;
  bgColor?: string;
  fontSize?: number;
  fontFamily?: string;
  legendItems?: { label: string; color: string }[];
  visible: boolean;
  variant?: string;
  groupId?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  gradientMinLabel?: string;
  gradientMaxLabel?: string;
}

interface InteractiveMapEditorProps {
  title: string;
  thumbUrl: string;
  district: string;
  classAreas?: Record<string, number>;
  palette?: string[];
  bbox?: any;
  fullScreen?: boolean;
  tileUrl?: string;
}

function getDistanceKM(lon1: number, lat1: number, lon2: number, lat2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function parseMapWidthKm(bbox: any): number {
  if (!bbox) return 25;
  try {
    if (Array.isArray(bbox) && bbox.length === 4 && typeof bbox[0] === "number") {
      const centerLat = (bbox[1] + bbox[3]) / 2;
      const dist = getDistanceKM(bbox[0], centerLat, bbox[2], centerLat);
      if (dist > 0.01) return dist;
    }
    if (Array.isArray(bbox) && bbox.length >= 4 && Array.isArray(bbox[0])) {
      const lons = bbox.map((p: any) => p[0]).filter((v: any) => typeof v === "number");
      const lats = bbox.map((p: any) => p[1]).filter((v: any) => typeof v === "number");
      if (lons.length >= 4 && lats.length >= 4) {
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const centerLat = (minLat + maxLat) / 2;
        const dist = getDistanceKM(minLon, centerLat, maxLon, centerLat);
        if (dist > 0.01) return dist;
      }
    }
  } catch (e) {
    console.warn("Could not calculate bbox width:", e);
  }
  return 25;
}

const DEFAULT_PALETTE_RAMP = [
  "#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b",
  "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"
];

export function getEffectivePalette(pal?: string[], n: number = 5): string[] {
  if (pal && pal.length > 0) return pal;
  if (n <= 1) return ["#1a9850"];
  if (n === DEFAULT_PALETTE_RAMP.length) return DEFAULT_PALETTE_RAMP;

  const hexToRgb = (h: string) => {
    const clean = h.replace("#", "");
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  };

  const rgbToHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

  const rgbStops = DEFAULT_PALETTE_RAMP.map(hexToRgb);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (rgbStops.length - 1);
    const idx = Math.floor(t);
    const frac = t - idx;
    if (idx >= rgbStops.length - 1) return DEFAULT_PALETTE_RAMP[DEFAULT_PALETTE_RAMP.length - 1];
    const c1 = rgbStops[idx];
    const c2 = rgbStops[idx + 1];
    return rgbToHex(
      c1[0] + (c2[0] - c1[0]) * frac,
      c1[1] + (c2[1] - c1[1]) * frac,
      c1[2] + (c2[2] - c1[2]) * frac
    );
  });
}

export function InteractiveMapEditor({
  title,
  thumbUrl,
  district,
  classAreas,
  palette,
  bbox,
  fullScreen,
  tileUrl,
}: InteractiveMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapBlobUrl, setMapBlobUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState("PNG");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [snapToGrid, setSnapToGrid] = useState(false);

  const classCount = classAreas ? Object.keys(classAreas).length : 5;
  const effectivePalette = getEffectivePalette(palette, classCount);

  // Insert Dialog State
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [previewType, setPreviewType] = useState<string>("northArrow");
  const [previewVariant, setPreviewVariant] = useState("classic");
  const [previewColor, setPreviewColor] = useState("#1a1a2e");
  const [previewBgColor, setPreviewBgColor] = useState("transparent");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Initialize Elements
  const initialElements: ElementData[] = [
    {
      id: "map-layer",
      type: "map",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      visible: true,
    },
    {
      id: "title-text",
      type: "text",
      x: 20,
      y: 20,
      width: 400,
      height: 40,
      content: title,
      color: "#1a1a2e",
      bgColor: "transparent",
      fontSize: 24,
      visible: true,
    },
    {
      id: "legend-box",
      type: "legend",
      x: 630,
      y: 180,
      width: 140,
      height: "auto",
      content: "Legend",
      fontSize: 12,
      bgColor: "rgba(255,255,255,0.92)",
      color: "#1a1a2e",
      visible: true,
      variant: "vertical",
      gradientMinLabel: "Low",
      gradientMaxLabel: "High",
      legendItems: classAreas && Object.keys(classAreas).length > 0
        ? Object.keys(classAreas).map((cls, i) => ({
            label: cls.split(" (")[0],
            color: effectivePalette[i % effectivePalette.length]
          }))
        : undefined,
    },
    {
      id: "north-arrow",
      type: "northArrow",
      x: 750,
      y: 20,
      width: 30,
      height: 40,
      color: "#1a1a2e",
      bgColor: "rgba(255,255,255,0.8)",
      visible: !title.toLowerCase().includes("rusle"),
    },
    {
      id: "scale-bar",
      type: "scale",
      x: 20,
      y: 540,
      width: 160,
      height: 42,
      color: "#1a1a2e",
      bgColor: "rgba(255,255,255,0.85)",
      visible: true,
      variant: "line",
    },
  ];

  const [history, setHistory] = useState<ElementData[][]>([initialElements]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [elements, setElementsState] = useState<ElementData[]>(initialElements);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Update map layer size when canvas size changes (only if it matches exactly)
  useEffect(() => {
    setElementsState(prev => {
      const next = prev.map(el => {
        if (el.type === 'map' && el.x === 0 && el.y === 0) {
          return { ...el, width: canvasSize.width, height: canvasSize.height };
        }
        return el;
      });
      return next;
    });
  }, [canvasSize]);

  // Sync palette and classAreas props to legend element if it exists
  useEffect(() => {
    setElementsState(prev => {
      const count = classAreas ? Object.keys(classAreas).length : 5;
      const effPal = getEffectivePalette(palette, count);
      return prev.map(el => {
        if (el.id === "legend-box" && el.type === "legend") {
          if (classAreas && Object.keys(classAreas).length > 0) {
            const newLegendItems = Object.keys(classAreas).map((cls, i) => ({
              label: cls.split(" (")[0],
              color: effPal[i % effPal.length]
            }));
            return { ...el, legendItems: newLegendItems, visible: true };
          } else {
            return { ...el, legendItems: undefined, visible: true };
          }
        }
        return el;
      });
    });
  }, [classAreas, palette]);

  const commitHistoryRef = useRef(elements);
  useEffect(() => {
    commitHistoryRef.current = elements;
  }, [elements]);

  const commitHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1);
    // Don't push if it hasn't changed
    if (JSON.stringify(newHistory[newHistory.length - 1]) !== JSON.stringify(commitHistoryRef.current)) {
      newHistory.push(commitHistoryRef.current);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const pushStateDirect = (nextElements: ElementData[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(nextElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setElementsState(history[prevIndex]);
      setSelectedIds([]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setElementsState(history[nextIndex]);
      setSelectedIds([]);
    }
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    setElementsState((prev) => {
      const next = prev.filter((el) => !selectedIds.includes(el.id));
      pushStateDirect(next);
      return next;
    });
    setSelectedIds([]);
  };

  const alignSelected = (alignType: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (selectedIds.length === 0) return;
    
    setElementsState(prev => {
      const selected = prev.filter(el => selectedIds.includes(el.id));
      
      let newElements = [...prev];
      if (selected.length === 1) {
        // Align to canvas
        const el = selected[0];
        const canvasW = canvasSize.width;
        const canvasH = canvasSize.height;
        let newX = el.x;
        let newY = el.y;
        
        const w = typeof el.width === 'number' ? el.width : parseInt(el.width as string) || 100;
        const h = typeof el.height === 'number' ? el.height : parseInt(el.height as string) || 50;

        if (alignType === "left") newX = 0;
        if (alignType === "center") newX = (canvasW - w) / 2;
        if (alignType === "right") newX = canvasW - w;
        if (alignType === "top") newY = 0;
        if (alignType === "middle") newY = (canvasH - h) / 2;
        if (alignType === "bottom") newY = canvasH - h;

        newElements = prev.map(item => item.id === el.id ? { ...item, x: newX, y: newY } : item);
      } else {
        // Align relative to each other
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        selected.forEach(el => {
          const w = typeof el.width === 'number' ? el.width : parseInt(el.width as string) || 100;
          const h = typeof el.height === 'number' ? el.height : parseInt(el.height as string) || 50;
          if (el.x < minX) minX = el.x;
          if (el.x + w > maxX) maxX = el.x + w;
          if (el.y < minY) minY = el.y;
          if (el.y + h > maxY) maxY = el.y + h;
        });

        newElements = prev.map(item => {
          if (!selectedIds.includes(item.id)) return item;
          const w = typeof item.width === 'number' ? item.width : parseInt(item.width as string) || 100;
          const h = typeof item.height === 'number' ? item.height : parseInt(item.height as string) || 50;
          let newX = item.x;
          let newY = item.y;
          if (alignType === "left") newX = minX;
          if (alignType === "center") newX = minX + (maxX - minX)/2 - w/2;
          if (alignType === "right") newX = maxX - w;
          if (alignType === "top") newY = minY;
          if (alignType === "middle") newY = minY + (maxY - minY)/2 - h/2;
          if (alignType === "bottom") newY = maxY - h;
          return { ...item, x: newX, y: newY };
        });
      }
      pushStateDirect(newElements);
      return newElements;
    });
  };


  const handleInsertElement = () => {
    setElementsState((prev) => {
      const next = [
        ...prev,
        {
          id: `${previewType}-${Date.now()}`,
          type: previewType,
          x: canvasSize.width / 2 - 50,
          y: canvasSize.height / 2 - 20,
          width: previewType === "scale" ? 160 : previewType === "northArrow" ? 40 : previewType === "text" ? 200 : previewType === "image" ? 100 : previewType === "circle" ? 100 : 150,
          height: previewType === "northArrow" ? 50 : previewType === "scale" ? 42 : previewType === "text" ? 40 : previewType === "image" ? 100 : previewType === "circle" ? 100 : previewType === "arrow" ? 20 : "auto",
          content: previewType === "text" ? "New Text Element" : previewType === "image" ? (previewImage || undefined) : undefined,
          color: previewColor,
          bgColor: previewBgColor,
          fontSize: 24,
          visible: true,
          variant: previewVariant,
        },
      ];
      pushStateDirect(next);
      return next;
    });
    setInsertDialogOpen(false);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        // Ignore if typing in an input
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroup();
        else handleGroup();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [historyIndex, history, selectedIds]);

  // Fetch map image as blob via proxy to avoid CORS taint during html-to-image
  useEffect(() => {
    let active = true;
    if (!thumbUrl) return;

    if (thumbUrl.startsWith("blob:") || thumbUrl.startsWith("data:")) {
      setMapBlobUrl(thumbUrl);
      return;
    }

    fetch(`${BASE}/proxy-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: thumbUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch map blob");
        return res.blob();
      })
      .then((blob) => {
        if (active) setMapBlobUrl(URL.createObjectURL(blob));
      })
      .catch((err) => console.error("Failed to load map blob", err));
    return () => {
      active = false;
    };
  }, [thumbUrl]);

  const updateElement = (id: string, updates: Partial<ElementData>) => {
    setElementsState((prev) => prev.map((el) => {
      if (selectedIds.includes(el.id) && selectedIds.includes(id)) {
        return { ...el, ...updates };
      } else if (el.id === id) {
        return { ...el, ...updates };
      }
      return el;
    }));
  };

  const handleGroup = () => {
    if (selectedIds.length < 2) return;
    const newGroupId = `group-${Date.now()}`;
    setElementsState(prev => {
      const next = prev.map(el => selectedIds.includes(el.id) ? { ...el, groupId: newGroupId } : el);
      pushStateDirect(next);
      return next;
    });
  };

  const handleUngroup = () => {
    if (selectedIds.length === 0) return;
    setElementsState(prev => {
      const next = prev.map(el => selectedIds.includes(el.id) ? { ...el, groupId: undefined } : el);
      pushStateDirect(next);
      return next;
    });
  };

  const handleExport = async () => {
    if (!containerRef.current) return;
    setIsExporting(true);
    setSelectedIds([]); // Deselect to hide borders during export
    try {
      // Small delay to ensure React state updates (borders hidden)
      await new Promise((r) => setTimeout(r, 100));

      const opts = {
        pixelRatio: 2, // High resolution
        backgroundColor: "#ffffff",
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      };

      let dataUrl: string;
      const ext = exportFormat.toLowerCase();

      if (exportFormat === "JPG") {
        dataUrl = await toJpeg(containerRef.current, { ...opts, quality: 0.95 });
      } else {
        dataUrl = await toPng(containerRef.current, opts);
      }

      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `Map_${district}_${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export the map. Check console for details.");
    } finally {
      setIsExporting(false);
    }
  };

  const renderElementContent = (el: ElementData) => {
    return (
      <div className="w-full h-full relative" style={{ color: el.color, backgroundColor: el.bgColor }}>
        {el.type === "map" && (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center overflow-hidden relative">
            {mapBlobUrl ? (
              <img src={mapBlobUrl} alt="Map Layer" className="w-full h-full object-contain pointer-events-none z-0" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            )}
            {el.variant === "grid" && (
              <div 
                className="absolute inset-0 pointer-events-none z-10 opacity-30" 
                style={{
                  backgroundImage: `linear-gradient(to right, ${el.color || '#000'} 1px, transparent 1px), linear-gradient(to bottom, ${el.color || '#000'} 1px, transparent 1px)`,
                  backgroundSize: '50px 50px'
                }}
              ></div>
            )}
          </div>
        )}

        {el.type === "text" && (
          <div
            className="w-full h-full bg-transparent border-none outline-none flex"
            style={{ 
              fontSize: `${el.fontSize}px`, 
              color: el.color, 
              fontFamily: el.fontFamily || "inherit",
              fontWeight: el.fontWeight || "bold",
              fontStyle: el.fontStyle || "normal",
              textDecoration: el.textDecoration || "none",
              justifyContent: el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start",
              alignItems: "center"
            }}
          >
            {el.content}
          </div>
        )}

        {el.type === "legend" && (
          <div 
            className="p-2 border rounded shadow-sm flex flex-col w-full h-full"
            style={{ 
              borderColor: el.color || "#e5e7eb", 
              fontFamily: el.fontFamily || "inherit",
              fontSize: `${el.fontSize || 12}px`,
              color: el.color,
              backgroundColor: el.bgColor !== "transparent" ? el.bgColor : "transparent",
              fontWeight: el.fontWeight || "normal",
              fontStyle: el.fontStyle || "normal",
              textDecoration: el.textDecoration || "none"
            }}
          >
            <div 
              className="font-semibold mb-2" 
              style={{ 
                color: el.color,
                textAlign: el.textAlign || "left"
              }}
            >
              {el.content || "Legend"}
            </div>
            {el.legendItems && el.legendItems.length > 0 ? (
              <div className={`flex ${el.variant === "compact" ? "flex-row flex-wrap" : "flex-col"} gap-1.5 overflow-hidden flex-1`}>
                {el.legendItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="border shrink-0 rounded-xs shadow-2xs"
                      style={{ 
                        backgroundColor: item.color, 
                        borderColor: el.color || "#d1d5db",
                        width: `${Math.max(12, (el.fontSize || 12))}px`,
                        height: `${Math.max(12, (el.fontSize || 12))}px`
                      }}
                    />
                    <span className="truncate whitespace-nowrap" title={item.label} style={{ color: el.color }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 w-full mt-1">
                <div 
                  className="w-full rounded-xs border shadow-inner" 
                  style={{ 
                    height: `${Math.max(16, (el.fontSize || 12) + 4)}px`,
                    background: `linear-gradient(to right, ${effectivePalette.join(', ')})`,
                    borderColor: el.color || "#d1d5db"
                  }} 
                />
                <div className="flex justify-between w-full px-0.5 text-[11px] font-medium" style={{ color: el.color }}>
                  <span>{el.gradientMinLabel || "Low"}</span>
                  <span>{el.gradientMaxLabel || "High"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {el.type === "northArrow" && (
          <div className="flex flex-col items-center justify-center w-full h-full pointer-events-none p-1" style={{ color: el.color || "black" }}>
            {el.variant === "minimal" ? (
              <>
                <span className="font-sans text-sm font-bold mb-0.5">N</span>
                <div className="w-0.5 h-full bg-current relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 border-x-[4px] border-x-transparent border-b-[6px] border-current"></div>
                </div>
              </>
            ) : el.variant === "compass" ? (
              <div className="relative flex items-center justify-center w-full h-full">
                 <div className="absolute inset-0 rounded-full border-2 border-current opacity-20"></div>
                 <div className="absolute top-0 text-[8px] font-bold mt-0.5">N</div>
                 <div className="w-0.5 h-3/4 bg-current z-10"></div>
                 <div className="absolute w-3/4 h-0.5 bg-current opacity-30"></div>
              </div>
            ) : (
              <>
                <span className="font-serif font-bold text-base leading-none mb-0.5">N</span>
                <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
                  <polygon points="12,2 22,28 12,20 2,28" fill="currentColor" stroke="currentColor" strokeWidth="1" />
                </svg>
              </>
            )}
          </div>
        )}

        {el.type === "scale" && (() => {
          const mapWidthKm = parseMapWidthKm(bbox);
          const elWidthPx = typeof el.width === "number" ? el.width : parseFloat(el.width) || 150;
          const barRatio = 0.85;
          const distKm = (elWidthPx * barRatio) / (canvasSize.width || 800) * mapWidthKm;

          let minLabel = "0";
          let midLabel = "";
          let maxLabel = "";
          if (distKm >= 1) {
            maxLabel = distKm >= 10 ? `${distKm.toFixed(1)} km` : `${distKm.toFixed(1)} km`;
            midLabel = (distKm / 2).toFixed(1);
          } else {
            const distM = Math.round(distKm * 1000);
            maxLabel = `${distM} m`;
            midLabel = `${Math.round(distM / 2)}`;
          }

          const scaleColor = el.color || "#1a1a2e";

          return (
            <div 
              className="w-full h-full flex flex-col justify-center items-center px-2 py-1 select-none pointer-events-none rounded"
              style={{ backgroundColor: el.bgColor !== "transparent" ? el.bgColor : "transparent" }}
            >
              {el.variant === "text-only" ? (
                <div className="font-semibold tracking-wider text-center" style={{ color: scaleColor, fontSize: el.fontSize ? `${el.fontSize}px` : "12px" }}>
                  Scale: {maxLabel}
                </div>
              ) : el.variant === "bar" ? (
                <div className="w-[85%] flex flex-col items-center">
                  <div className="w-full flex justify-between text-[10px] font-medium leading-none mb-1" style={{ color: scaleColor }}>
                    <span>{minLabel}</span>
                    <span>{midLabel}</span>
                    <span>{maxLabel}</span>
                  </div>
                  <div 
                    className="w-full h-2.5 flex border"
                    style={{ borderColor: scaleColor, backgroundColor: "#ffffff" }}
                  >
                    <div className="flex-1" style={{ backgroundColor: scaleColor }} />
                    <div className="flex-1 bg-white" />
                    <div className="flex-1" style={{ backgroundColor: scaleColor }} />
                    <div className="flex-1 bg-white" />
                  </div>
                </div>
              ) : (
                <div className="w-[85%] flex flex-col items-center">
                  <div className="w-full flex justify-between text-[10px] font-medium leading-none mb-1" style={{ color: scaleColor }}>
                    <span>{minLabel}</span>
                    <span>{midLabel}</span>
                    <span>{maxLabel}</span>
                  </div>
                  <div className="w-full relative flex items-end" style={{ height: "6px" }}>
                    <div className="w-full h-[2px] absolute bottom-0" style={{ backgroundColor: scaleColor }} />
                    <div className="w-[2px] h-full absolute left-0 bottom-0" style={{ backgroundColor: scaleColor }} />
                    <div className="w-[2px] h-[4px] absolute left-1/2 -translate-x-1/2 bottom-0" style={{ backgroundColor: scaleColor }} />
                    <div className="w-[2px] h-full absolute right-0 bottom-0" style={{ backgroundColor: scaleColor }} />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {el.type === "image" && (
          <div className="w-full h-full flex items-center justify-center pointer-events-none">
            {el.content ? (
              <img src={el.content} alt="Uploaded" className="w-full h-full object-contain" />
            ) : (
              <div className="text-xs text-muted-foreground border-2 border-dashed border-gray-300 w-full h-full flex items-center justify-center">No Image</div>
            )}
          </div>
        )}
        {el.type === "rectangle" && (
          <div 
            className="w-full h-full border-2" 
            style={{ 
              backgroundColor: el.bgColor !== "transparent" ? el.bgColor : "transparent", 
              borderColor: el.color || "black" 
            }} 
          />
        )}

        {el.type === "circle" && (
          <div 
            className="w-full h-full border-2 rounded-full" 
            style={{ 
              backgroundColor: el.bgColor !== "transparent" ? el.bgColor : "transparent", 
              borderColor: el.color || "black" 
            }} 
          />
        )}

        {el.type === "arrow" && (
          <div className="w-full h-full flex items-center justify-center relative pointer-events-none">
            <div className="w-full h-1 bg-current" style={{ backgroundColor: el.color || "black" }}></div>
            <div className="absolute right-0 w-0 h-0 border-y-[10px] border-y-transparent border-l-[15px]" style={{ borderLeftColor: el.color || "black" }}></div>
          </div>
        )}
      </div>
    );
  };

  const renderElement = (el: ElementData, currentScale: number = 1) => {
    if (!el.visible) return null;

    const isSelected = selectedIds.includes(el.id);

    return (
      <Rnd
        key={el.id}
        scale={currentScale}
        bounds="parent"
        dragGrid={snapToGrid ? [20, 20] : [1, 1]}
        resizeGrid={snapToGrid ? [20, 20] : [1, 1]}
        position={{ x: el.x, y: el.y }}
        size={{ width: el.width, height: el.height }}
        onDragStop={(e, d) => {
          const deltaX = d.x - el.x;
          const deltaY = d.y - el.y;
          
          let itemsToMove = [el.id];
          if (selectedIds.includes(el.id)) {
            itemsToMove = [...selectedIds];
          }
          if (el.groupId) {
             itemsToMove = Array.from(new Set([...itemsToMove, ...elements.filter(e => e.groupId === el.groupId).map(e => e.id)]));
          }

          const next = elements.map((item) => (itemsToMove.includes(item.id) ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item));
          setElementsState(next);
          pushStateDirect(next);
        }}
        onResizeStop={(e, dir, ref, delta, position) => {
          const next = elements.map((item) => (item.id === el.id ? { ...item, width: ref.style.width, height: ref.style.height, x: position.x, y: position.y } : item));
          setElementsState(next);
          pushStateDirect(next);
        }}
        onClick={(e: any) => {
          e.stopPropagation();
          let idsToSelect = [el.id];
          if (el.groupId) {
             idsToSelect = elements.filter(e => e.groupId === el.groupId).map(e => e.id);
          }
          if (e.shiftKey) {
            setSelectedIds(prev => {
              const allSelected = idsToSelect.every(id => prev.includes(id));
              if (allSelected) {
                return prev.filter(id => !idsToSelect.includes(id));
              }
              return Array.from(new Set([...prev, ...idsToSelect]));
            });
          } else {
            setSelectedIds(idsToSelect);
          }
        }}
        className={`absolute ${isSelected ? "ring-2 ring-primary border-dashed" : ""} hover:ring-1 hover:ring-primary/50 transition-all cursor-move`}
        style={{ zIndex: elements.indexOf(el) }}
      >
        {renderElementContent(el)}
      </Rnd>
    );
  };

  const selectedElements = elements.filter(e => selectedIds.includes(e.id));
  const selectedElement = selectedElements.length > 0 ? selectedElements[0] : null;

  return (
    <div className={`flex flex-col gap-4 ${fullScreen ? "h-full" : ""}`}>
      {/* Global Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-card text-card-foreground rounded-lg border shadow-sm shrink-0">
        <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4 mr-2" /> Undo
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex === history.length - 1} title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4 mr-2" /> Redo
        </Button>
        <Button 
          variant={snapToGrid ? "default" : "ghost"} 
          size="sm" 
          onClick={() => setSnapToGrid(!snapToGrid)}
          title="Toggle Grid Snapping"
        >
          <Grid3X3 className="w-4 h-4 mr-2" /> Snap
        </Button>
        <div className="w-px h-6 bg-border mx-2" />
        <Dialog open={insertDialogOpen} onOpenChange={setInsertDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <PlusCircle className="w-4 h-4 mr-2" /> Insert Element
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Insert New Element</DialogTitle>
            </DialogHeader>
            <div className="flex gap-6 py-4">
              <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-md border min-h-[200px]">
                <div style={{ width: previewType === "scale" ? 150 : previewType === "northArrow" ? 60 : previewType === "text" ? 200 : 150, height: previewType === "northArrow" ? 70 : previewType === "text" ? 40 : 80, position: 'relative' }}>
                  {renderElementContent({
                    id: "preview",
                    type: previewType,
                    x: 0,
                    y: 0,
                    width: "100%",
                    height: "100%",
                    content: "Preview Text",
                    color: previewColor,
                    bgColor: previewBgColor,
                    fontSize: 24,
                    visible: true,
                    variant: previewVariant,
                  })}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Element Type</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <Button variant={previewType === "northArrow" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("northArrow")}>North Arrow</Button>
                    <Button variant={previewType === "scale" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("scale")}>Scale Bar</Button>
                    <Button variant={previewType === "legend" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("legend")}>Legend</Button>
                    <Button variant={previewType === "text" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("text")}>Text Box</Button>
                    <Button variant={previewType === "image" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("image")}>Image/Logo</Button>
                    <Button variant={previewType === "rectangle" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("rectangle")}>Rectangle</Button>
                    <Button variant={previewType === "circle" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("circle")}>Circle</Button>
                    <Button variant={previewType === "arrow" ? "default" : "outline"} size="sm" onClick={() => setPreviewType("arrow")}>Arrow</Button>
                  </div>
                </div>
                {previewType === "image" && (
                  <div className="space-y-2">
                    <Label>Upload Image</Label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => setPreviewImage(event.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                  </div>
                )}
                {previewType === "northArrow" && (
                  <div className="space-y-2">
                    <Label>Arrow Style</Label>
                    <Select value={previewVariant} onValueChange={setPreviewVariant}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="classic">Classic Arrow</SelectItem>
                        <SelectItem value="compass">Compass Rose</SelectItem>
                        <SelectItem value="minimal">Minimal Line</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {previewType === "scale" && (
                  <div className="space-y-2">
                    <Label>Scale Style</Label>
                    <Select value={previewVariant} onValueChange={setPreviewVariant}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line">Simple Line</SelectItem>
                        <SelectItem value="bar">Alternating Block Bar</SelectItem>
                        <SelectItem value="text-only">Text Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={previewColor} onChange={e => setPreviewColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer bg-transparent" />
                    <span className="text-xs text-muted-foreground uppercase">{previewColor}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Background</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={previewBgColor !== "transparent" ? previewBgColor : "#ffffff"} onChange={e => setPreviewBgColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer bg-transparent" />
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreviewBgColor("transparent")}>Clear</Button>
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={handleInsertElement}>Add to Map</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="w-px h-6 bg-border mx-2" />
        
        {/* Alignment Tools */}
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length === 0} onClick={() => alignSelected("left")} title="Align Left"><AlignLeft className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length === 0} onClick={() => alignSelected("center")} title="Align Center"><AlignCenter className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length === 0} onClick={() => alignSelected("right")} title="Align Right"><AlignRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length === 0} onClick={() => alignSelected("middle")} title="Align Middle"><AlignVerticalSpaceAround className="w-4 h-4" /></Button>
        </div>

        {/* Group Tools */}
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length < 2} onClick={handleGroup} title="Group (Ctrl+G)" aria-label="Group selected elements"><Group className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={selectedIds.length === 0} onClick={handleUngroup} title="Ungroup (Ctrl+Shift+G)" aria-label="Ungroup selected elements"><Ungroup className="w-4 h-4" /></Button>
        </div>

        <Button variant="ghost" size="sm" onClick={deleteSelected} disabled={selectedIds.length === 0} className="text-red-600 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </Button>
      </div>

      <div className={`flex flex-col lg:flex-row gap-6 ${fullScreen ? "flex-1 overflow-hidden" : "h-[800px]"}`}>
        {/* Main Canvas Area */}
        <div className={`flex-1 bg-gray-100 rounded-lg overflow-hidden border border-border flex items-center justify-center relative ${fullScreen ? "h-[calc(100vh-140px)]" : "min-h-[500px]"}`}>
          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={5}
            centerOnInit
            wheel={{ step: 0.1 }}
            panning={{ excluded: ["react-draggable", "bg-white"] }}
          >
            {({ zoomIn, zoomOut, resetTransform, state }) => (
              <>
                <div className="absolute top-4 left-4 z-[50] flex gap-1 bg-card/90 text-card-foreground backdrop-blur shadow-md p-1.5 rounded-lg border">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()} title="Zoom In">
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()} title="Zoom Out">
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetTransform()} title="Fit to Screen">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </div>
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                  <div
                    ref={containerRef}
                    className="relative bg-white shadow-lg overflow-hidden shrink-0 border"
                    style={{ width: canvasSize.width, height: canvasSize.height }}
                    onClick={(e) => {
                      if (e.target === containerRef.current) setSelectedIds([]);
                    }}
                  >
                    {elements.map(el => renderElement(el, state.scale))}
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>

        {/* Properties Sidebar */}
        <div className="w-full lg:w-64 bg-card border rounded-lg p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
          <div className="flex items-center gap-2 font-medium border-b pb-2">
            <Settings2 className="w-4 h-4" />
            Properties
          </div>

          <div className="space-y-2 border-b pb-4">
            <Label className="flex justify-between items-center">
              <span>Layers / Elements</span>
              <span className="text-xs font-normal text-muted-foreground">{elements.length}</span>
            </Label>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {elements.map((el) => (
                <button
                  key={el.id}
                  onClick={() => {
                    if (window.event && (window.event as MouseEvent).shiftKey) {
                      setSelectedIds(prev => prev.includes(el.id) ? prev.filter(id => id !== el.id) : [...prev, el.id]);
                    } else {
                      setSelectedIds([el.id]);
                    }
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-md cursor-pointer ${
                    selectedIds.includes(el.id) ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
                  }`}
                >
                  {el.id.replace(/-/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Selected Element</Label>
            <div className="text-sm px-3 py-2 bg-muted rounded border capitalize font-medium">
              {selectedElement ? selectedElement.id.replace(/-/g, " ") : "Canvas Background"}
            </div>
            {selectedElement && selectedElement.type !== "map" && (
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs h-8"
                  onClick={() => {
                    setElementsState(prev => {
                      const next = [...prev];
                      const idx = next.findIndex(e => e.id === selectedElement.id);
                      if (idx < next.length - 1) {
                        const temp = next[idx];
                        next[idx] = next[idx + 1];
                        next[idx + 1] = temp;
                        pushStateDirect(next);
                      }
                      return next;
                    });
                  }}
                >
                  Bring Forward
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs h-8"
                  onClick={() => {
                    setElementsState(prev => {
                      const next = [...prev];
                      const idx = next.findIndex(e => e.id === selectedElement.id);
                      if (idx > 0 && next[idx - 1].type !== "map") {
                        const temp = next[idx];
                        next[idx] = next[idx - 1];
                        next[idx - 1] = temp;
                        pushStateDirect(next);
                      }
                      return next;
                    });
                  }}
                >
                  Send Backward
                </Button>
              </div>
            )}
          </div>

          {!selectedElement && (
            <>
              <div className="space-y-2">
                <Label>Canvas Width (px)</Label>
                <input
                  type="number"
                  value={canvasSize.width}
                  onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Canvas Height (px)</Label>
                <input
                  type="number"
                  value={canvasSize.height}
                  onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Label>Frame Presets</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCanvasSize({ width: 842, height: 595 })}>A4 Land</Button>
                  <Button variant="outline" size="sm" onClick={() => setCanvasSize({ width: 595, height: 842 })}>A4 Port</Button>
                  <Button variant="outline" size="sm" onClick={() => setCanvasSize({ width: 1024, height: 576 })}>16:9</Button>
                  <Button variant="outline" size="sm" onClick={() => setCanvasSize({ width: 800, height: 800 })}>Square</Button>
                </div>
              </div>
            </>
          )}

          {selectedElement && selectedElement.type === "legend" && (
            <div className="space-y-2">
              <Label>Legend Style</Label>
              <Select 
                value={selectedElement.variant || "vertical"} 
                onValueChange={(val) => {
                  updateElement(selectedElement.id, { variant: val });
                  commitHistory();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical">Vertical List</SelectItem>
                  <SelectItem value="compact">Compact / Horizontal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedElement && selectedElement.type === "scale" && (
            <div className="space-y-2">
              <Label>Scale Style</Label>
              <Select 
                value={selectedElement.variant || "line"} 
                onValueChange={(val) => {
                  updateElement(selectedElement.id, { variant: val });
                  commitHistory();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">Simple Line</SelectItem>
                  <SelectItem value="bar">Alternating Block Bar</SelectItem>
                  <SelectItem value="text-only">Text Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedElement && selectedElement.type === "northArrow" && (
            <div className="space-y-2">
              <Label>Arrow Style</Label>
              <Select 
                value={selectedElement.variant || "classic"} 
                onValueChange={(val) => {
                  updateElement(selectedElement.id, { variant: val });
                  commitHistory();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic Arrow</SelectItem>
                  <SelectItem value="compass">Compass Rose</SelectItem>
                  <SelectItem value="minimal">Minimal Line</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedElement && selectedElement.type === "map" && (
            <div className="space-y-2">
              <Label>Map Overlay</Label>
              <Select 
                value={selectedElement.variant || "none"} 
                onValueChange={(val) => {
                  updateElement(selectedElement.id, { variant: val });
                  commitHistory();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Grid</SelectItem>
                  <SelectItem value="grid">Coordinate Grid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedElement && selectedElement.type !== "map" && (
            <>
              <div className="space-y-2">
                <Label>Text / Foreground Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedElement.color || "#000000"}
                    onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                    className="w-8 h-8 p-0 border-0 rounded cursor-pointer bg-transparent"
                  />
                  <span className="text-xs text-muted-foreground uppercase">{selectedElement.color}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedElement.bgColor && selectedElement.bgColor.startsWith("#") ? selectedElement.bgColor : "#ffffff"}
                    onChange={(e) => updateElement(selectedElement.id, { bgColor: e.target.value })}
                    className="w-8 h-8 p-0 border-0 rounded cursor-pointer bg-transparent"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs"
                    onClick={() => updateElement(selectedElement.id, { bgColor: "transparent" })}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </>
          )}

          {selectedElement && (selectedElement.type === "text" || selectedElement.type === "legend") && (
            <div className="space-y-2">
              <Label>{selectedElement.type === "legend" ? "Legend Title" : "Text Content"}</Label>
              <input 
                value={selectedElement.content || ""}
                onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                onBlur={() => commitHistory()}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          )}

          {selectedElement && (selectedElement.type === "text" || selectedElement.type === "legend") && (
            <div className="space-y-2">
              <Label>Font Size</Label>
              <input
                type="range"
                min="10"
                max="72"
                value={selectedElement.fontSize || 24}
                onChange={(e) => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) })}
                onMouseUp={() => commitHistory()}
                className="w-full"
              />
              <div className="text-xs text-right text-muted-foreground">{selectedElement.fontSize || 24}px</div>
            </div>
          )}

          {selectedElement && (selectedElement.type === "text" || selectedElement.type === "legend") && (
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select 
                value={selectedElement.fontFamily || "inherit"} 
                onValueChange={(val) => {
                  updateElement(selectedElement.id, { fontFamily: val });
                  commitHistory();
                }}
              >
                <SelectTrigger><SelectValue placeholder="System Default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">System Default</SelectItem>
                  <SelectItem value="'Inter', sans-serif">Inter</SelectItem>
                  <SelectItem value="'Roboto', sans-serif">Roboto</SelectItem>
                  <SelectItem value="'Outfit', sans-serif">Outfit</SelectItem>
                  <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                  <SelectItem value="Calibri, sans-serif">Calibri</SelectItem>
                  <SelectItem value="Times New Roman, serif">Times New Roman</SelectItem>
                  <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedElement && selectedElement.type === "text" && (
            <div className="space-y-2">
              <Label>Text Formatting</Label>
              <div className="flex items-center gap-1">
                <Button 
                  variant={selectedElement.fontWeight !== "normal" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { fontWeight: selectedElement.fontWeight === "normal" ? "bold" : "normal" });
                    commitHistory();
                  }}
                ><Bold className="w-4 h-4" /></Button>
                <Button 
                  variant={selectedElement.fontStyle === "italic" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { fontStyle: selectedElement.fontStyle === "italic" ? "normal" : "italic" });
                    commitHistory();
                  }}
                ><Italic className="w-4 h-4" /></Button>
                <Button 
                  variant={selectedElement.textDecoration === "underline" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { textDecoration: selectedElement.textDecoration === "underline" ? "none" : "underline" });
                    commitHistory();
                  }}
                ><Underline className="w-4 h-4" /></Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button 
                  variant={!selectedElement.textAlign || selectedElement.textAlign === "left" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { textAlign: "left" });
                    commitHistory();
                  }}
                ><AlignLeft className="w-4 h-4" /></Button>
                <Button 
                  variant={selectedElement.textAlign === "center" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { textAlign: "center" });
                    commitHistory();
                  }}
                ><AlignCenter className="w-4 h-4" /></Button>
                <Button 
                  variant={selectedElement.textAlign === "right" ? "default" : "outline"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => {
                    updateElement(selectedElement.id, { textAlign: "right" });
                    commitHistory();
                  }}
                ><AlignRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}

          {selectedElement && selectedElement.type === "legend" && (
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Legend Style</Label>
                <div className="inline-flex rounded border bg-muted p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedElement.legendItems || selectedElement.legendItems.length === 0) {
                        const defaultClasses = classAreas && Object.keys(classAreas).length > 0
                          ? Object.keys(classAreas).map((cls, i) => ({
                              label: cls.split(" (")[0],
                              color: effectivePalette[i % effectivePalette.length]
                            }))
                          : [
                              { label: "Very Low", color: "#d73027" },
                              { label: "Low", color: "#fdae61" },
                              { label: "Moderate", color: "#ffffbf" },
                              { label: "High", color: "#a6d96a" },
                              { label: "Very High", color: "#1a9850" },
                            ];
                        updateElement(selectedElement.id, { legendItems: defaultClasses });
                      }
                      commitHistory();
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      selectedElement.legendItems && selectedElement.legendItems.length > 0
                        ? "bg-background text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Discrete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateElement(selectedElement.id, { legendItems: undefined });
                      commitHistory();
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      !selectedElement.legendItems || selectedElement.legendItems.length === 0
                        ? "bg-background text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Gradient
                  </button>
                </div>
              </div>

              {selectedElement.legendItems && selectedElement.legendItems.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Classes ({selectedElement.legendItems.length})</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        const nextItems = [...(selectedElement.legendItems || [])];
                        nextItems.push({ label: `Class ${nextItems.length + 1}`, color: effectivePalette[nextItems.length % effectivePalette.length] });
                        updateElement(selectedElement.id, { legendItems: nextItems });
                        commitHistory();
                      }}
                    >
                      <PlusCircle className="w-3 h-3 mr-1" /> Add Class
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1 mt-2">
                    {selectedElement.legendItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-muted p-1 rounded border">
                        <input
                          type="color"
                          value={item.color}
                          onChange={(e) => {
                            const nextItems = [...(selectedElement.legendItems || [])];
                            nextItems[idx].color = e.target.value;
                            updateElement(selectedElement.id, { legendItems: nextItems });
                          }}
                          onBlur={() => commitHistory()}
                          className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent shrink-0"
                        />
                        <input
                          value={item.label}
                          onChange={(e) => {
                            const nextItems = [...(selectedElement.legendItems || [])];
                            nextItems[idx].label = e.target.value;
                            updateElement(selectedElement.id, { legendItems: nextItems });
                          }}
                          onBlur={() => commitHistory()}
                          className="flex-1 px-2 py-1 text-xs border rounded"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700"
                          onClick={() => {
                            const nextItems = [...(selectedElement.legendItems || [])];
                            nextItems.splice(idx, 1);
                            updateElement(selectedElement.id, { legendItems: nextItems });
                            commitHistory();
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-xs font-semibold">Continuous Gradient Labels</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Min Label (Left)</Label>
                      <input
                        value={selectedElement.gradientMinLabel || "Low"}
                        onChange={(e) => updateElement(selectedElement.id, { gradientMinLabel: e.target.value })}
                        onBlur={() => commitHistory()}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Max Label (Right)</Label>
                      <input
                        value={selectedElement.gradientMaxLabel || "High"}
                        onChange={(e) => updateElement(selectedElement.id, { gradientMaxLabel: e.target.value })}
                        onBlur={() => commitHistory()}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto border-t pt-4 space-y-3">
            <Label>Export Format</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PNG">PNG (.png)</SelectItem>
                <SelectItem value="JPG">JPG (.jpg)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="w-full gap-2"
              onClick={handleExport}
              disabled={isExporting || !mapBlobUrl}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Exporting..." : `Download Map (${exportFormat})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
