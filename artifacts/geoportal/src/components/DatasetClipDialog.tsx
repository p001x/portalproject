import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scissors, Download, Loader2, MapPin, Check, AlertCircle, FileCode } from "lucide-react";
import { api, type DatasetRecord } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const RWANDA_DISTRICTS_BY_PROVINCE = [
  {
    province: "Kigali City",
    districts: ["Gasabo", "Kicukiro", "Nyarugenge"],
  },
  {
    province: "Northern Province",
    districts: ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  },
  {
    province: "Southern Province",
    districts: ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
  },
  {
    province: "Eastern Province",
    districts: ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
  },
  {
    province: "Western Province",
    districts: ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
  },
];

interface DatasetClipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: DatasetRecord | null;
  source: string;
}

export function DatasetClipDialog({
  isOpen,
  onClose,
  dataset,
  source,
}: DatasetClipDialogProps) {
  const { toast } = useToast();
  const [selectedDistrict, setSelectedDistrict] = useState<string>("Gasabo");
  const [customGeojson, setCustomGeojson] = useState<string>("");
  const [clipMode, setClipMode] = useState<"district" | "custom">("district");
  const [loading, setLoading] = useState(false);

  if (!dataset) return null;

  const handleClipAndDownload = async () => {
    setLoading(true);

    try {
      let maskObj: any = undefined;
      let districtName: string | undefined = undefined;

      if (clipMode === "district") {
        districtName = selectedDistrict;
      } else {
        if (!customGeojson.trim()) {
          throw new Error("Please enter a valid GeoJSON polygon geometry");
        }
        try {
          maskObj = JSON.parse(customGeojson);
        } catch {
          throw new Error("Invalid GeoJSON string. Please check JSON syntax.");
        }
      }

      const blob = await api.datasets.clip(dataset.id, {
        mask: maskObj,
        district: districtName,
        source: dataset.source || source,
      });

      // Trigger browser download — use original filename directly (already has extension)
      const baseName = dataset.original_filename || `${dataset.name}.${dataset.file_type || "dat"}`;
      const filename = clipMode === "district"
        ? `clipped_${selectedDistrict}_${baseName}`
        : `clipped_custom_${baseName}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Clipping Completed!",
        description: `Successfully extracted and downloaded ${filename}.`,
      });
      onClose();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Clipping Failed",
        description: err.message || "Failed to clip dataset",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
            <Scissors className="w-5 h-5 text-primary" />
            District & AOI Slicer
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Extract and download a spatial subset of <strong>{dataset.name}</strong> for your area of interest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Tabs value={clipMode} onValueChange={(v) => setClipMode(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="district" className="text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5 mr-1.5" /> Rwanda District
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs font-semibold">
                <FileCode className="w-3.5 h-3.5 mr-1.5" /> Custom GeoJSON
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: District Selector */}
            <TabsContent value="district" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Select Target District</Label>
                <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                  <SelectTrigger className="w-full text-xs h-9">
                    <SelectValue placeholder="Choose a district..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {RWANDA_DISTRICTS_BY_PROVINCE.map((group) => (
                      <React.Fragment key={group.province}>
                        <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/40">
                          {group.province}
                        </div>
                        {group.districts.map((d) => (
                          <SelectItem key={d} value={d} className="text-xs">
                            {d}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 bg-muted/30 border border-border/60 rounded-lg text-xs space-y-1 text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Server-Side Masking
                </p>
                <p className="text-[11px] leading-relaxed">
                  The portal will intersect the boundary of <strong>{selectedDistrict}</strong> with this dataset and return a clipped file. Processing time depends on dataset size.
                </p>
              </div>
            </TabsContent>

            {/* Tab 2: Custom GeoJSON */}
            <TabsContent value="custom" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Paste Polygon GeoJSON (EPSG:4326)</Label>
                <Textarea
                  value={customGeojson}
                  onChange={(e) => setCustomGeojson(e.target.value)}
                  placeholder='{"type": "Polygon", "coordinates": [[[29.8, -1.9], ...]]}'
                  className="text-xs font-mono h-28 resize-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Accepts GeoJSON Feature, FeatureCollection, or Polygon geometry in WGS84 coordinates.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleClipAndDownload}
            disabled={loading}
            className="gap-2 text-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {loading ? "Clipping on Server…" : "Clip & Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
