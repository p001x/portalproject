import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Globe, Map, MapPin } from "lucide-react";

interface StudyAreaSelectorProps {
  value: AOIConfig;
  onChange: (value: AOIConfig) => void;
}

interface RwandaHierarchy {
  [province: string]: {
    [district: string]: string[];
  };
}

export function StudyAreaSelector({ value, onChange }: StudyAreaSelectorProps) {
  const [tab, setTab] = useState<"rwanda" | "global" | "upload">(() => {
    if (value.type === "geojson") return "upload";
    if (value.type === "rwanda" || value.country === "Rwanda") return "rwanda";
    return "global";
  });
  
  const [uploading, setUploading] = useState(false);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 1) {
      alert("Please upload only one zip file at a time.");
      e.target.value = '';
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert("Invalid file format. Please upload a .zip file.");
      e.target.value = '';
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert("File is too large. Maximum size is 50MB.");
      e.target.value = '';
      return;
    }

    try {
      setUploading(true);
      const res = await api.uploadShapefile(file);
      onChange({
        type: "geojson",
        geojson: res.geojson,
        name: file.name.replace(".zip", ""),
      });
    } catch (err) {
      console.error(err);
      alert("Failed to upload shapefile.");
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleTabChange = (v: any) => {
    setTab(v);
    if (v === "rwanda") {
      onChange({ type: "rwanda", country: "Rwanda", name: "Rwanda" });
    } else if (v === "global") {
      onChange({ type: "world", country: "World", name: "World" });
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Study Area</Label>
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rwanda" className="flex gap-2 text-xs">
            <MapPin className="w-4 h-4" /> Rwanda
          </TabsTrigger>
          <TabsTrigger value="global" className="flex gap-2 text-xs">
            <Globe className="w-4 h-4" /> Global
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex gap-2 text-xs">
            <Upload className="w-4 h-4" /> Custom
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="upload" className="mt-3">
          <div className="flex flex-col gap-3 p-3 border rounded-md border-dashed bg-muted/30">
            <div className="text-xs text-center text-muted-foreground">
              Upload a .zip containing a shapefile (.shp, .shx, .dbf, .prj)
            </div>
            {value.type === "geojson" && value.name && (
              <div className="text-xs font-semibold text-center text-primary flex items-center justify-center gap-1">
                <Map className="w-3 h-3" />
                Active: {value.name}
              </div>
            )}
            <Label className="w-full">
              <div className="w-full flex items-center justify-center h-8 text-xs border rounded cursor-pointer bg-card hover:bg-muted transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Select .zip File"}
              </div>
              <input type="file" accept=".zip" className="hidden" onChange={handleFileUpload} />
            </Label>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
