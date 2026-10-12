import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit3, Save, Loader2, Tag } from "lucide-react";
import { api, type DatasetRecord } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const DATASET_CATEGORIES = [
  "Topography & Elevation",
  "Agriculture & Crops",
  "Forestry & Vegetation",
  "Hydrology & Water",
  "Climate & Hazards",
  "Urban & Infrastructure",
  "Other / General",
];

interface DatasetEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: DatasetRecord | null;
  source: string;
  onUpdated: () => void;
}

export function DatasetEditDialog({
  isOpen,
  onClose,
  dataset,
  source,
  onUpdated,
}: DatasetEditDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contributor, setContributor] = useState("");
  const [category, setCategory] = useState("Other / General");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dataset) {
      setName(dataset.name || "");
      setDescription(dataset.description || "");
      setContributor(dataset.contributor || "");
      setCategory(dataset.category || "Other / General");
      setTagsInput(dataset.tags ? dataset.tags.join(", ") : "");
    }
  }, [dataset]);

  if (!dataset) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Dataset name cannot be empty." });
      return;
    }

    setLoading(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api.datasets.update(
        dataset.id,
        {
          name: name.trim(),
          description: description.trim(),
          contributor: contributor.trim() || undefined,
          category,
          tags,
        },
        dataset.source || source
      );

      toast({
        title: "Metadata Updated",
        description: `Successfully updated details for "${name}".`,
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message || "Could not update dataset metadata.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold text-lg">
            <Edit3 className="w-5 h-5 text-primary" />
            Edit Dataset Metadata
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update the title, description, domain category, and tags for this repository asset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Dataset Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rwanda DEM 30m SRTM"
              className="text-xs h-8.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-xs h-8.5">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {DATASET_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Contributor / Org</Label>
              <Input
                value={contributor}
                onChange={(e) => setContributor(e.target.value)}
                placeholder="e.g. REMA, RCMRD"
                className="text-xs h-8.5"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Tags (comma-separated)</Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. elevation, terrain, srtm, 30m"
              className="text-xs h-8.5"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed dataset summary, coordinate system, usage notes..."
              className="text-xs h-20 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading} className="text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading} className="gap-1.5 text-xs">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
