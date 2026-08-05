import { useState, useEffect } from "react";
import { Palette, Download, Eye, Layers, Compass, Grid, Scale, Frame, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InteractiveMapEditor } from "./InteractiveMapEditor";

const PALETTES = [
  { name: "Default (Module specific)", value: "default", hexes: [] },
  { name: "Red to Green (NDVI)", value: "rdylgn", hexes: ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"] },
  { name: "Blue to Red (LST)", value: "bluered", hexes: ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"] },
  { name: "Spectral", value: "spectral", hexes: ["#d53e4f", "#fc8d59", "#fee08b", "#e6f598", "#99d594", "#3288bd"] },
  { name: "Viridis", value: "viridis", hexes: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"] },
  { name: "Magma", value: "magma", hexes: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"] },
  { name: "Grayscale", value: "gray", hexes: ["#000000", "#ffffff"] },
  { name: "Custom...", value: "custom", hexes: [] },
];

interface MapExportControlsProps {
  tileUrl: string;
  thumbUrl?: string;
  district: string;
  title: string;
  classAreas?: Record<string, number>;
  downloadUrl?: string;
}

export function MapExportControls({ tileUrl, thumbUrl, district, title, classAreas, downloadUrl }: MapExportControlsProps) {
  const [mode, setMode] = useState<"static" | "canva">("static");
  const [selectedPalette, setSelectedPalette] = useState("default");
  const [customColors, setCustomColors] = useState<string[]>([]);

  // Toggles for static elements
  const [showFrame, setShowFrame] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [showScale, setShowScale] = useState(true);

  // File extension format restricted to PNG, JPG, TIF only
  const [exportFormat, setExportFormat] = useState<"PNG" | "JPG" | "TIF">("PNG");
  const [sizeMultiplier, setSizeMultiplier] = useState("1.0");

  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const classCount = classAreas ? Object.keys(classAreas).length : 5;

  useEffect(() => {
    const full = ["#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf",
      "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026"];
    if (classCount === 1) {
      setCustomColors([full[4]]);
    } else {
      const step = (full.length - 1) / (classCount - 1);
      setCustomColors(Array.from({ length: classCount }, (_, i) => full[Math.round(i * step)]));
    }
  }, [classCount]);

  const paletteObj = PALETTES.find((p) => p.value === selectedPalette);
  const resolvedPalette = selectedPalette === "custom"
    ? customColors
    : (paletteObj && paletteObj.hexes.length > 0 ? paletteObj.hexes : undefined);

  // Fetch rendered static map from backend
  useEffect(() => {
    const targetUrl = thumbUrl || tileUrl;
    if (!targetUrl) {
      setError("No valid map source URL available for preview.");
      setIsGenerating(false);
      return;
    }

    let active = true;
    setIsGenerating(true);
    setError(null);

    const abortController = new AbortController();
    let timeoutId: any = null;

    const debounceTimer = setTimeout(() => {
      timeoutId = setTimeout(() => abortController.abort(), 35000);

      fetch("/api/static-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          title,
          url: targetUrl,
          class_areas: classAreas,
          override_palette: resolvedPalette,
          show_frame: mode === "canva" ? false : showFrame,
          show_grid: mode === "canva" ? false : showGrid,
          show_legend: mode === "canva" ? false : showLegend,
          show_scale: mode === "canva" ? false : showScale,
          show_compass: mode === "canva" ? false : showCompass,
          show_title: mode === "canva" ? false : true,
          size_multiplier: parseFloat(sizeMultiplier),
          output_format: exportFormat,
        }),
        signal: abortController.signal
      })
        .then(async (res) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (!res.ok) {
             const errText = await res.text();
             let parsedMsg = errText;
             try {
               const jsonErr = JSON.parse(errText);
               parsedMsg = jsonErr.detail || errText;
             } catch {}
             throw new Error(parsedMsg);
          }
          return res.blob();
        })
        .then((blob) => {
          if (active) {
            if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(URL.createObjectURL(blob));
          }
        })
        .catch((err) => {
          if (active && err.name !== "AbortError") {
            console.error("Error generating static map preview:", err);
            setError(err.message || "Preview failed to load. Please try again.");
          }
        })
        .finally(() => {
          if (active) setIsGenerating(false);
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
      if (timeoutId) clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [
    mode,
    district,
    title,
    thumbUrl,
    tileUrl,
    classAreas,
    resolvedPalette,
    showFrame,
    showGrid,
    showLegend,
    showScale,
    showCompass,
    sizeMultiplier,
    exportFormat,
    retryCount,
  ]);

  const handleDownload = () => {
    // If the user wants a RAW TIF and the module provided a raw data download URL, use it directly!
    if (exportFormat === "TIF" && downloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }

    const targetUrl = thumbUrl || tileUrl;
    if (!targetUrl) return;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/static-map-download";
    form.style.display = "none";

    const addField = (name: string, value: any) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = typeof value === "object" ? JSON.stringify(value) : String(value);
      form.appendChild(input);
    };

    addField("district", district);
    addField("title", title);
    addField("url", targetUrl);
    if (classAreas) addField("class_areas_json", classAreas);
    if (resolvedPalette) addField("override_palette_json", resolvedPalette);
    addField("show_frame", showFrame);
    addField("show_grid", showGrid);
    addField("show_legend", showLegend);
    addField("show_scale", showScale);
    addField("show_compass", showCompass);
    addField("size_multiplier", sizeMultiplier);
    addField("output_format", exportFormat);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Mode Switcher Header */}
      <div className="flex items-center justify-between p-4 border rounded-xl bg-card shadow-sm">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Cartography & Map Export Mode</h3>
        </div>
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
          <Button
            size="sm"
            variant={mode === "static" ? "default" : "ghost"}
            onClick={() => setMode("static")}
            className="text-xs gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            Professional Static Map
          </Button>
          <Button
            size="sm"
            variant={mode === "canva" ? "default" : "ghost"}
            onClick={() => setMode("canva")}
            className="text-xs gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Canva Drag & Drop Mode
          </Button>
        </div>
      </div>

      {mode === "canva" ? (
        <div className="space-y-4">
          <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                Live Color Palette Customization
              </Label>
              {isGenerating && (
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Updating Canva Map Colors...
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={selectedPalette} onValueChange={setSelectedPalette}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PALETTES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center justify-between w-full pr-4">
                        <span>{p.name}</span>
                        {p.hexes.length > 0 && (
                          <div className="flex ml-4 border rounded overflow-hidden">
                            {p.hexes.map((hex) => (
                              <div key={hex} style={{ backgroundColor: hex }} className="w-3 h-3" />
                            ))}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPalette === "custom" && (
                <div className="flex flex-wrap gap-2 items-center">
                  {(classAreas ? Object.keys(classAreas) : Array.from({ length: classCount }).map((_, i) => `Class ${i + 1}`)).map((cls, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-background p-1 rounded border">
                      <input
                        type="color"
                        value={customColors[i] || "#ffffff"}
                        onChange={(e) => {
                          const nc = [...customColors];
                          nc[i] = e.target.value;
                          setCustomColors(nc);
                        }}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                      />
                      <span className="text-[11px] font-medium truncate max-w-[80px]" title={String(cls)}>
                        {String(cls).replace(/ *\([^)]*\)/, '')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <InteractiveMapEditor
            title={title}
            thumbUrl={previewBlobUrl || thumbUrl || tileUrl}
            district={district}
            classAreas={classAreas}
            palette={resolvedPalette || customColors}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Controls & Customization Sidebar */}
          <div className="lg:col-span-1 flex flex-col gap-5 p-5 border rounded-xl bg-card shadow-sm">
            {/* Element Selection Toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Frame className="w-4 h-4 text-primary" />
                Selectable Map Elements
              </Label>
              <div className="space-y-2.5 bg-muted/40 p-3.5 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Frame className="w-3.5 h-3.5 text-muted-foreground" /> Frame & Lat/Lon Ticks
                  </span>
                  <Switch checked={showFrame} onCheckedChange={setShowFrame} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 text-muted-foreground" /> Grid Lines
                  </span>
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" /> Legend & Key
                  </span>
                  <Switch checked={showLegend} onCheckedChange={setShowLegend} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-muted-foreground" /> Compass / North Arrow
                  </span>
                  <Switch checked={showCompass} onCheckedChange={setShowCompass} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-muted-foreground" /> Scale Bar
                  </span>
                  <Switch checked={showScale} onCheckedChange={setShowScale} />
                </div>
              </div>
            </div>

            {/* Color Customization */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                Color Palette Customization
              </Label>
              <Select value={selectedPalette} onValueChange={setSelectedPalette}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PALETTES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center justify-between w-full pr-4">
                        <span>{p.name}</span>
                        {p.hexes.length > 0 && (
                          <div className="flex ml-4 border rounded overflow-hidden">
                            {p.hexes.map((hex) => (
                              <div key={hex} style={{ backgroundColor: hex }} className="w-3 h-3" />
                            ))}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPalette === "custom" && (
                <div className="p-3 border rounded-lg bg-muted/40 flex flex-col gap-2.5">
                  <span className="text-xs font-medium text-muted-foreground">Customize Class Colors:</span>
                  <div className="flex flex-wrap gap-2.5">
                    {(classAreas ? Object.keys(classAreas) : Array.from({ length: classCount }).map((_, i) => `Class ${i + 1}`)).map((cls, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-background p-1 rounded border">
                        <input
                          type="color"
                          value={customColors[i] || "#ffffff"}
                          onChange={(e) => {
                            const nc = [...customColors];
                            nc[i] = e.target.value;
                            setCustomColors(nc);
                          }}
                          className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                        />
                        <span className="text-[11px] font-medium truncate max-w-[80px]" title={String(cls)}>
                          {String(cls).replace(/ *\([^)]*\)/, '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Resolution & Format Restricted to PNG, JPG, TIF */}
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Quality / DPI</Label>
                  <Select value={sizeMultiplier} onValueChange={setSizeMultiplier}>
                    <SelectTrigger className="bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.0">Standard (1x)</SelectItem>
                      <SelectItem value="1.5">High (1.5x)</SelectItem>
                      <SelectItem value="2.0">Ultra (2.0x)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Download Extension</Label>
                  <Select value={exportFormat} onValueChange={(val) => setExportFormat(val as any)}>
                    <SelectTrigger className="bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PNG">PNG (.png)</SelectItem>
                      <SelectItem value="JPG">JPG (.jpg)</SelectItem>
                      <SelectItem value="TIF">TIF (.tif)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full gap-2 mt-2"
                onClick={handleDownload}
                disabled={isGenerating || !previewBlobUrl}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isGenerating ? "Rendering Map..." : `Download Map (${exportFormat})`}
              </Button>

              {downloadUrl && (
                <Button
                  variant="outline"
                  className="w-full gap-2 mt-2 border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => window.open(downloadUrl, "_blank")}
                >
                  <Download className="w-4 h-4" />
                  Download Raw GeoTIFF
                </Button>
              )}
            </div>
          </div>

          {/* Map Preview Area */}
          <div className="lg:col-span-2 border rounded-xl p-4 bg-muted/20 flex flex-col items-center justify-center min-h-[480px] relative shadow-inner">
            {isGenerating && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20 rounded-xl">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Updating Static Map Cartography...</span>
              </div>
            )}

            {error ? (
              <div className="flex flex-col items-center gap-3 text-destructive p-6 border border-destructive/20 rounded bg-destructive/5 text-center">
                <span className="text-sm font-medium">{error}</span>
                <Button variant="outline" size="sm" onClick={() => setRetryCount(c => c + 1)}>
                   Retry Preview
                </Button>
              </div>
            ) : previewBlobUrl ? (
              <img
                src={previewBlobUrl}
                alt="Static Map Preview"
                className="max-h-[600px] w-auto object-contain rounded-lg shadow-md border"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Loading map preview...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
