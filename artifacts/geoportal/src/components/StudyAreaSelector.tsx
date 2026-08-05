import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, AOIConfig } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Globe, Map } from "lucide-react";

interface StudyAreaSelectorProps {
  value: AOIConfig;
  onChange: (value: AOIConfig) => void;
}

export function StudyAreaSelector({ value, onChange }: StudyAreaSelectorProps) {
  const [tab, setTab] = useState<"global" | "upload">(value.type === "geojson" ? "upload" : "global");
  const [uploading, setUploading] = useState(false);

  // Queries for GAUL hierarchies
  const { data: countriesData, isLoading: loadingCountries } = useQuery({
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

  const handleCountryChange = (c: string) => {
    onChange({ type: "gaul0", country: c, name: c });
  };

  const handleLevel1Change = (l1: string) => {
    if (l1 === "none") {
      onChange({ type: "gaul0", country: value.country, name: value.country });
    } else {
      onChange({ type: "gaul1", country: value.country, level1: l1, name: l1 });
    }
  };

  const handleLevel2Change = (l2: string) => {
    if (l2 === "none") {
      onChange({ type: "gaul1", country: value.country, level1: value.level1, name: value.level1 });
    } else {
      onChange({ type: "gaul2", country: value.country, level1: value.level1, level2: l2, name: l2 });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Study Area</Label>
      <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="global" className="flex gap-2 text-xs">
            <Globe className="w-4 h-4" /> Global
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex gap-2 text-xs">
            <Upload className="w-4 h-4" /> Custom
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="global" className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={value.country || ""} onValueChange={handleCountryChange} disabled={loadingCountries}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select Country..." />
              </SelectTrigger>
              <SelectContent>
                {countriesData?.regions?.filter((c: string) => c === "Rwanda").map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.country && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">State / Province (Optional)</Label>
              <Select value={value.level1 || "none"} onValueChange={handleLevel1Change} disabled={loadingLevel1}>
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

          {value.country && value.level1 && value.level1 !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">District / County (Optional)</Label>
              <Select value={value.level2 || "none"} onValueChange={handleLevel2Change} disabled={loadingLevel2}>
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
