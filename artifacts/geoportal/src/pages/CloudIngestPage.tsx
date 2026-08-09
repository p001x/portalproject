import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Cloud, UploadCloud, Info } from "lucide-react";

export function CloudIngestPage() {
  const { toast } = useToast();
  const [sourceUrl, setSourceUrl] = useState("");
  const [assetId, setAssetId] = useState("");

  const ingestMutation = useMutation({
    mutationFn: async () => {
      if (!sourceUrl.trim()) throw new Error("Source URL is required");
      return await api.gee.ingestRaster({
        source_url: sourceUrl.trim(),
        target_asset_id: assetId.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Ingestion Started",
        description: data.message || "Your raster is being ingested to GEE.",
      });
      setSourceUrl("");
      setAssetId("");
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Ingestion Failed",
        description: err.message || "An error occurred.",
      });
    },
  });

  return (
    <div className="h-full overflow-y-auto bg-background/50">
      <div className="max-w-4xl mx-auto py-12 px-6 lg:px-8">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Cloud className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">
            Cloud Asset Ingestion
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Directly ingest massive GeoTIFF or COG files from cloud storage (like GCS or AWS) straight into your Google Earth Engine Assets. Bypass local downloads completely.
          </p>
        </div>

        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Info className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              You can provide a <code className="bg-emerald-500/20 px-1 rounded">gs://</code> Google Cloud Storage link or a standard <code className="bg-emerald-500/20 px-1 rounded">http://</code> link. HTTP links will be downloaded in the background and pushed to GEE automatically.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">Source Image URL</label>
              <Input
                placeholder="e.g. gs://my-bucket/high_res_image.tif or https://..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">Target GEE Asset ID (Optional)</label>
              <p className="text-xs text-muted-foreground mb-2">If left blank, a random ID will be generated in your default GEE project root.</p>
              <Input
                placeholder="e.g. projects/your-project/assets/my_new_raster"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <Button
              size="lg"
              className="w-full h-14 text-base mt-4"
              onClick={() => ingestMutation.mutate()}
              disabled={ingestMutation.isPending || !sourceUrl.trim()}
            >
              <UploadCloud className="w-5 h-5 mr-2" />
              {ingestMutation.isPending ? "Pushing to GEE..." : "Push to GEE Asset"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
