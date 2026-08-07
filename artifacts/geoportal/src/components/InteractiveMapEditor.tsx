import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { toPng, toJpeg } from "html-to-image";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Settings2, ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Type, Trash2, PlusCircle } from "lucide-react";
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

interface ElementData {
  id: string;
  type: "map" | "text" | "legend" | "scale" | "northArrow";
  x: number;
  y: number;
  width: number | string;
  height: number | string;
  content?: string; // Text content or image URL
  color?: string;
  bgColor?: string;
  fontSize?: number;
  visible: boolean;
  variant?: string;
}

interface InteractiveMapEditorProps {
  title: string;
  thumbUrl: string;
  district: string;
  classAreas?: Record<string, number>;
  palette?: string[];
}

export function InteractiveMapEditor({
  title,
  thumbUrl,
  district,
  classAreas,
  palette,
}: InteractiveMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapBlobUrl, setMapBlobUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState("PNG");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Insert Dialog State
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"text" | "legend" | "scale" | "northArrow">("northArrow");
  const [previewVariant, setPreviewVariant] = useState("classic");
  const [previewColor, setPreviewColor] = useState("#1a1a2e");
  const [previewBgColor, setPreviewBgColor] = useState("transparent");

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
      x: 650,
      y: 200,
      width: 130,
      height: "auto",
      bgColor: "rgba(255,255,255,0.9)",
      color: "#1a1a2e",
      visible: !!classAreas,
      variant: "vertical",
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
      y: 550,
      width: 150,
      height: 30,
      color: "#1a1a2e",
      bgColor: "rgba(255,255,255,0.8)",
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
      setSelectedId(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setElementsState(history[nextIndex]);
      setSelectedId(null);
    }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElementsState((prev) => {
      const next = prev.filter((el) => el.id !== selectedId);
      pushStateDirect(next);
      return next;
    });
    setSelectedId(null);
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
          width: previewType === "scale" ? 150 : previewType === "northArrow" ? 40 : previewType === "text" ? 200 : 150,
          height: previewType === "northArrow" ? 50 : previewType === "scale" ? 30 : previewType === "text" ? 40 : "auto",
          content: previewType === "text" ? "New Text Element" : undefined,
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, selectedId]);

  // Fetch map image as blob via proxy to avoid CORS taint during html-to-image
  useEffect(() => {
    let active = true;
    if (!thumbUrl) return;

    if (thumbUrl.startsWith("blob:") || thumbUrl.startsWith("data:")) {
      setMapBlobUrl(thumbUrl);
      return;
    }

    fetch("https://geoportal-api-ygzi.onrender.com/api/proxy-image", {
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
    setElementsState((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
  };

  const handleExport = async () => {
    if (!containerRef.current) return;
    setIsExporting(true);
    setSelectedId(null); // Deselect to hide borders during export
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
            className="w-full h-full bg-transparent border-none outline-none font-bold flex items-center"
            style={{ fontSize: `${el.fontSize}px`, color: el.color }}
          >
            {el.content}
          </div>
        )}

        {el.type === "legend" && (
          <div 
            className="p-2 text-xs border rounded shadow-sm flex flex-col"
            style={{ borderColor: el.color || "#e5e7eb" }}
          >
            <div className="font-semibold mb-2" style={{ color: el.color }}>Legend</div>
            {classAreas && palette ? (
              <div className={`flex ${el.variant === "compact" ? "flex-row flex-wrap" : "flex-col"} gap-1.5 overflow-hidden`}>
                {Object.keys(classAreas).map((cls, i) => (
                  <div key={cls} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 border shrink-0 rounded-sm"
                      style={{ backgroundColor: palette[i % palette.length], borderColor: el.color || "#d1d5db" }}
                    />
                    <span className="truncate whitespace-nowrap" title={cls} style={{ color: el.color }}>
                      {cls.split(" (")[0]}
                    </span>
                  </div>
                ))}
              </div>
            ) : palette && palette.length > 0 ? (
              <div className="flex flex-col gap-1 w-full mt-2">
                <div 
                  className="w-full h-4 rounded-sm border" 
                  style={{ 
                    background: `linear-gradient(to right, ${palette.join(', ')})`,
                    borderColor: el.color || "#d1d5db"
                  }} 
                />
                <div className="flex justify-between w-full text-[10px] px-0.5" style={{ color: el.color }}>
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground italic text-[10px]">No legend data</div>
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

        {el.type === "scale" && (
          <div className="flex flex-col items-center justify-end w-full h-full pb-1 pointer-events-none">
            {el.variant === "bar" && (
              <div className="w-[80%] h-2 mb-1 border flex" style={{ borderColor: el.color || "#000" }}>
                 <div className="flex-1" style={{ backgroundColor: el.color || "#000" }}></div>
                 <div className="flex-1 bg-transparent"></div>
                 <div className="flex-1" style={{ backgroundColor: el.color || "#000" }}></div>
                 <div className="flex-1 bg-transparent"></div>
              </div>
            )}
            {(!el.variant || el.variant === "line") && (
              <div className="w-[80%] h-1 bg-current mb-1 border-x-2" style={{ backgroundColor: el.color, borderColor: el.color }}></div>
            )}
            <span className="text-[10px] leading-none" style={{ color: el.color }}>~25 km</span>
          </div>
        )}
      </div>
    );
  };

  const renderElement = (el: ElementData, currentScale: number = 1) => {
    if (!el.visible) return null;

    const isSelected = selectedId === el.id;

    return (
      <Rnd
        key={el.id}
        scale={currentScale}
        bounds="parent"
        position={{ x: el.x, y: el.y }}
        size={{ width: el.width, height: el.height }}
        onDragStop={(e, d) => {
          const next = elements.map((item) => (item.id === el.id ? { ...item, x: d.x, y: d.y } : item));
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
          setSelectedId(el.id);
        }}
        className={`absolute ${isSelected ? "ring-2 ring-primary border-dashed" : ""} hover:ring-1 hover:ring-primary/50 transition-all cursor-move`}
        style={{ zIndex: el.type === "map" ? 0 : 10 }}
      >
        {renderElementContent(el)}
      </Rnd>
    );
  };

  const selectedElement = elements.find((e) => e.id === selectedId);

  return (
    <div className="flex flex-col gap-4">
      {/* Global Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-white rounded-lg border shadow-sm shrink-0">
        <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4 mr-2" /> Undo
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex === history.length - 1} title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4 mr-2" /> Redo
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant={previewType === "northArrow" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("northArrow")}
                    >North Arrow</Button>
                    <Button 
                      variant={previewType === "legend" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("legend")}
                    >Legend</Button>
                    <Button 
                      variant={previewType === "scale" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("scale")}
                    >Scale Bar</Button>
                    <Button 
                      variant={previewType === "text" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("text")}
                    >Text Box</Button>
                  </div>
                </div>
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
        <Button variant="ghost" size="sm" onClick={deleteSelected} disabled={!selectedId} className="text-red-600 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[800px]">
        {/* Main Canvas Area */}
        <div className="flex-1 bg-gray-100 rounded-lg overflow-hidden border border-border flex items-center justify-center min-h-[500px] relative">
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
                <div className="absolute top-4 left-4 z-[50] flex gap-1 bg-white/90 backdrop-blur shadow-md p-1.5 rounded-lg border">
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
                      if (e.target === containerRef.current) setSelectedId(null);
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
                  onClick={() => setSelectedId(el.id)}
                  className={`text-left text-sm px-2 py-1.5 rounded-md truncate transition-colors ${
                    selectedId === el.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
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

          {selectedElement && selectedElement.type === "text" && (
            <div className="space-y-2">
              <Label>Text Content</Label>
              <input 
                value={selectedElement.content}
                onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                onBlur={() => commitHistory()}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          )}

          {selectedElement && selectedElement.type === "text" && (
            <div className="space-y-2">
              <Label>Font Size</Label>
              <input
                type="range"
                min="12"
                max="72"
                value={selectedElement.fontSize || 24}
                onChange={(e) => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) })}
                onMouseUp={() => commitHistory()}
                className="w-full"
              />
              <div className="text-xs text-right text-muted-foreground">{selectedElement.fontSize}px</div>
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
