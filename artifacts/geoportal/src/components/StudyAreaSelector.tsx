import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Upload, 
  Loader2, 
  Globe, 
  Map, 
  MapPin, 
  FileCheck2, 
  Trash2, 
  Sparkles, 
  FileCode2, 
  AlertCircle 
} from "lucide-react";

interface StudyAreaSelectorProps {
  value: AOIConfig;
  onChange: (value: AOIConfig) => void;
}

export function StudyAreaSelector({ value, onChange }: StudyAreaSelectorProps) {
  const [tab, setTab] = useState<"rwanda" | "global" | "upload">(() => {
    if (value.type === "geojson" || value.type === "custom") return "upload";
    if (value.type === "rwanda" || value.country === "Rwanda") return "rwanda";
    return "global";
  });
  
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries for GAUL hierarchies (Global)
  const { data: countriesData, isLoading: loadingCountries, error: countriesError } = useQuery({
    queryKey: ["regions", "countries"],
    queryFn: () => api.getRegions(),
  });

  const { data: level1Data, isLoading: loadingLevel1 } = useQuery({
    queryKey: ["regions", "level1", value.country],
    queryFn: () => api.getRegions(value.country),
    enabled: !!value.country && value.type.startsWith("gaul"),
  });

  const { data: level2Data, isLoading: loadingLevel2 } = useQuery({
    queryKey: ["regions", "level2", value.country, value.level1],
    queryFn: () => api.getRegions(value.country, value.level1),
    enabled: !!value.country && !!value.level1 && value.type.startsWith("gaul"),
  });

  // Queries for Rwanda hierarchy
  const { data: rwandaHierarchy, isLoading: loadingRwanda } = useQuery({
    queryKey: ["rwanda", "full-hierarchy"],
    queryFn: () => api.getRwandaFullHierarchy(),
  });

  const handleGlobalCountryChange = (c: string) => {
    if (c === "Rwanda") {
      setTab("rwanda");
      onChange({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
    } else if (c === "World") {
      onChange({ type: "world", country: "World", name: "World" });
    } else {
      onChange({ type: "gaul0", country: c, name: c });
    }
  };

  const handleGlobalLevel1Change = (l1: string) => {
    if (l1 === "none") {
      onChange({ type: "gaul0", country: value.country, name: value.country });
    } else {
      onChange({ type: "gaul1", country: value.country, level1: l1, name: l1 });
    }
  };

  const handleGlobalLevel2Change = (l2: string) => {
    if (l2 === "none") {
      onChange({ type: "gaul1", country: value.country, level1: value.level1, name: value.level1 });
    } else {
      onChange({ type: "gaul2", country: value.country, level1: value.level1, level2: l2, name: l2 });
    }
  };

  const handleRwandaProvinceChange = (p: string) => {
    if (p === "none") {
      onChange({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
    } else {
      onChange({ type: "rwanda", country: "Rwanda", province: p, name: p });
    }
  };

  const handleRwandaDistrictChange = (d: string) => {
    if (d === "none") {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, name: (value as any).province });
    } else {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: d, name: d });
    }
  };

  const handleRwandaSectorChange = (s: string) => {
    if (s === "none") {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, name: value.district });
    } else {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, sector: s, name: s });
    }
  };

  const handleRwandaCellChange = (c: string) => {
    if (c === "none") {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, sector: (value as any).sector, name: (value as any).sector });
    } else {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, sector: (value as any).sector, cell: c, name: c });
    }
  };

  const handleRwandaVillageChange = (v: string) => {
    if (v === "none") {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, sector: (value as any).sector, cell: (value as any).cell, name: (value as any).cell });
    } else {
      onChange({ type: "rwanda", country: "Rwanda", province: (value as any).province, district: value.district, sector: (value as any).sector, cell: (value as any).cell, village: v, name: v });
    }
  };

  // Process dropped or selected spatial file (GeoJSON, JSON, Shapefile .zip, KML)
  const processFile = async (file: File) => {
    setUploadError(null);
    const fname = file.name.toLowerCase();
    const isGeoJson = fname.endsWith(".geojson") || fname.endsWith(".json");
    const isZip = fname.endsWith(".zip");
    const isKml = fname.endsWith(".kml");

    if (!isGeoJson && !isZip && !isKml) {
      setUploadError("Unsupported format. Please upload a GeoJSON (.geojson/.json), Shapefile (.zip), or KML (.kml).");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError("File is too large. Maximum allowed size is 50MB.");
      return;
    }

    setUploading(true);
    try {
      if (isGeoJson) {
        // Fast client-side GeoJSON parsing with zero network delay
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || (typeof parsed !== "object")) {
          throw new Error("Invalid JSON structure.");
        }

        let normalizedGeojson = parsed;
        const gtype = parsed.type;
        if (gtype in ["Polygon", "MultiPolygon", "Point", "LineString"]) {
          normalizedGeojson = {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: parsed, properties: {} }]
          };
        } else if (gtype === "Feature") {
          normalizedGeojson = {
            type: "FeatureCollection",
            features: [parsed]
          };
        }

        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        onChange({
          type: "geojson",
          geojson: normalizedGeojson,
          name: cleanName
        });
        setTab("upload");
      } else {
        // Zipped shapefiles or KML: process via backend
        const res = await api.uploadShapefile(file);
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        onChange({
          type: "geojson",
          geojson: res.geojson,
          name: cleanName
        });
        setTab("upload");
      }
    } catch (err: any) {
      console.error("[StudyAreaSelector] Failed to process file:", err);
      setUploadError(err.message || "Failed to process spatial file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drag-and-drop event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleClearCustomAOI = () => {
    setTab("rwanda");
    onChange({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
    setUploadError(null);
  };

  const handleTabChange = (v: any) => {
    setTab(v);
    if (v === "rwanda") {
      onChange({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
    } else if (v === "global") {
      onChange({ type: "world", country: "World", name: "World" });
    }
  };

  const isCustomActive = (value.type === "geojson" || value.type === "custom") && !!value.geojson;

  // Compute summary stats for custom GeoJSON
  let featureCount = 0;
  let customType = "GeoJSON";
  if (isCustomActive && value.geojson) {
    const gj = typeof value.geojson === "string" ? JSON.parse(value.geojson) : value.geojson;
    customType = gj.type || "GeoJSON";
    if (gj.type === "FeatureCollection" && Array.isArray(gj.features)) {
      featureCount = gj.features.length;
    } else if (gj.type === "Feature") {
      featureCount = 1;
    } else {
      featureCount = 1;
    }
  }

  return (
    <div 
      className="space-y-4 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          Study Area
        </Label>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rwanda" className="flex gap-2 text-xs">
            <MapPin className="w-4 h-4" /> Rwanda
          </TabsTrigger>
          <TabsTrigger value="global" className="flex gap-2 text-xs">
            <Globe className="w-4 h-4" /> Global
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex gap-2 text-xs relative">
            <Upload className="w-4 h-4" /> Custom
            {isCustomActive && (
              <span className="w-2 h-2 rounded-full bg-primary absolute top-1 right-2 animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* RWANDA TAB */}
        <TabsContent value="rwanda" className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Province (Optional)</Label>
            <Select value={value.type === "rwanda" ? ((value as any).province || "none") : "none"} onValueChange={handleRwandaProvinceChange} disabled={loadingRwanda}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select Province..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- All of Rwanda --</SelectItem>
                {rwandaHierarchy && Object.keys(rwandaHierarchy).map((p: string) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.type === "rwanda" && (value as any).province && (value as any).province !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">District (Optional)</Label>
              <Select value={value.district || "none"} onValueChange={handleRwandaDistrictChange}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select District..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {(value as any).province} --</SelectItem>
                  {rwandaHierarchy && Object.keys(rwandaHierarchy[(value as any).province] || {}).map((d: string) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {value.type === "rwanda" && (value as any).province && value.district && value.district !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sector (Optional)</Label>
              <Select value={(value as any).sector || "none"} onValueChange={handleRwandaSectorChange}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select Sector..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {value.district} --</SelectItem>
                  {rwandaHierarchy && Object.keys(rwandaHierarchy[(value as any).province]?.[value.district] || {}).map((s: string) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {value.type === "rwanda" && (value as any).sector && (value as any).sector !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cell (Optional)</Label>
              <Select value={(value as any).cell || "none"} onValueChange={handleRwandaCellChange}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select Cell..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {(value as any).sector} --</SelectItem>
                  {rwandaHierarchy && Object.keys(rwandaHierarchy[(value as any).province]?.[value.district]?.[(value as any).sector] || {}).map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {value.type === "rwanda" && (value as any).cell && (value as any).cell !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Village (Optional)</Label>
              <Select value={(value as any).village || "none"} onValueChange={handleRwandaVillageChange}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select Village..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {(value as any).cell} --</SelectItem>
                  {rwandaHierarchy && (rwandaHierarchy[(value as any).province]?.[value.district]?.[(value as any).sector]?.[(value as any).cell] || []).map((v: string) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>
        
        {/* GLOBAL TAB */}
        <TabsContent value="global" className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={value.type.startsWith("gaul") ? value.country || "" : (value.type === "world" ? "World" : "")} onValueChange={handleGlobalCountryChange} disabled={loadingCountries}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select Country..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="World">-- Whole World --</SelectItem>
                {countriesData?.regions?.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {countriesError && (
              <div className="text-red-500 text-xs font-semibold p-1 border border-red-500 rounded bg-red-50 mt-1">
                Error loading regions: {String(countriesError)}
              </div>
            )}
          </div>

          {value.type.startsWith("gaul") && value.country && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">State / Province (Optional)</Label>
              <Select value={value.level1 || "none"} onValueChange={handleGlobalLevel1Change} disabled={loadingLevel1}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select State..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {value.country} --</SelectItem>
                  {level1Data?.regions?.map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {value.type.startsWith("gaul") && value.country && value.level1 && value.level1 !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">District / County (Optional)</Label>
              <Select value={value.level2 || "none"} onValueChange={handleGlobalLevel2Change} disabled={loadingLevel2}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select District..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- All of {value.level1} --</SelectItem>
                  {level2Data?.regions?.map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>

        {/* CUSTOM STUDY AREA (DRAG & DROP) */}
        <TabsContent value="upload" className="mt-3 space-y-3">
          {/* Active Custom Study Area Card */}
          {isCustomActive && (
            <div className="p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                    {value.name || "Custom Study Area"}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleClearCustomAOI}
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                  title="Remove and reset study area"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="bg-background/80 px-2 py-0.5 rounded border text-xs">
                  Type: {customType}
                </span>
                {featureCount > 0 && (
                  <span className="bg-background/80 px-2 py-0.5 rounded border text-xs">
                    {featureCount} feature{featureCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Drag & Drop Dropzone */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
              ${dragActive 
                ? "border-primary bg-primary/10 shadow-lg ring-2 ring-primary/40 scale-[1.01]" 
                : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
              }
            `}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".geojson,.json,.zip,.kml" 
              className="hidden" 
              onChange={handleFileInputChange} 
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>Processing & reprojecting spatial boundary…</span>
              </div>
            ) : (
              <>
                <div className={`p-2.5 rounded-full ${dragActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'} transition-colors`}>
                  {dragActive ? <Sparkles className="w-6 h-6 animate-bounce" /> : <Upload className="w-6 h-6" />}
                </div>

                <div className="text-center space-y-1">
                  <div className="text-xs font-semibold text-foreground">
                    {dragActive ? "Drop study area file now!" : "Drag & Drop Study Area Here"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    or click to browse files
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground font-mono">
                    .geojson
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground font-mono">
                    .zip (shp)
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground font-mono">
                    .kml
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground font-mono">
                    .json
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
