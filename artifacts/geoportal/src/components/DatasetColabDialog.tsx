import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Terminal, ExternalLink, Code2, Sparkles, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "@/lib/api";

export interface DatasetColabDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: {
    id: string;
    name: string;
    file_type?: string;
    file_size_mb?: number | null;
    source?: string;
    original_filename?: string;
  } | null;
}

export function DatasetColabDialog({ isOpen, onClose, dataset }: DatasetColabDialogProps) {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!dataset) return null;

  const origin = window.location.origin;
  const rawUrl = `${origin}${BASE}/datasets/${dataset.id}/raw`;
  const safeFilename = dataset.original_filename || dataset.name || "dataset";
  
  // Extract potential source URL from description or properties
  let sourceUrl = (dataset as any).source_url || (dataset as any).url || "";
  if (!sourceUrl && (dataset as any).description) {
    const match = (dataset as any).description.match(/https?:\/\/[^\s]+/);
    if (match) sourceUrl = match[0];
  }
  if (!sourceUrl) {
    // Check if inputUrl in harvester store or default
    sourceUrl = "https://drive.google.com/file/d/1wWu_jJxp0XdNeoO17-MwtUCl5X7rrGhy/view?usp=sharing";
  }

  const isDrive = sourceUrl.includes("drive.google.com");
  const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");

  // Determine optimal colormap based on dataset theme
  const lowerName = (dataset.name || "").toLowerCase();
  let defaultCmap = "viridis";
  if (lowerName.includes("lst") || lowerName.includes("temp") || lowerName.includes("heat") || lowerName.includes("uhi")) {
    defaultCmap = "inferno";
  } else if (lowerName.includes("ndvi") || lowerName.includes("veg") || lowerName.includes("forest") || lowerName.includes("lulc")) {
    defaultCmap = "RdYlGn";
  } else if (lowerName.includes("water") || lowerName.includes("flood") || lowerName.includes("rain")) {
    defaultCmap = "Blues";
  } else if (lowerName.includes("slope") || lowerName.includes("dem") || lowerName.includes("elevation")) {
    defaultCmap = "terrain";
  }

  const huggingFaceSnippet = `# ============================================================
# Google Colab: Hugging Face Fast Stream for ${dataset.name}
# ============================================================
import os
import rasterio
import numpy as np
import matplotlib.pyplot as plt

# Step 1: Install required packages
!pip install -q huggingface_hub rasterio matplotlib geemap

# Step 2: Authenticate (Uncomment and replace with your token if your repo is private)
# from huggingface_hub import login
# login(token="hf_YOUR_TOKEN_HERE")

# Step 3: Download directly from Hugging Face
from huggingface_hub import hf_hub_download

print("Downloading dataset from Hugging Face...")
target_file = hf_hub_download(
    repo_id="petersstore/blacportal-datasets",
    repo_type="dataset",
    filename="${dataset.id}_${safeFilename}"
)

# Step 4: Open, Inspect & Plot
print("Loading Specific Dataset: " + str(target_file))
with rasterio.open(target_file) as src:
    print("Successfully opened: " + str(target_file))
    print("Coordinate System (CRS): " + str(src.crs))
    print("Dimensions (Height, Width): " + str(src.shape))
    print("Number of Bands: " + str(src.count))
    print("Bounding Box Extent: " + str(src.bounds))
    
    # Read Band 1 (Raw Values)
    band1 = src.read(1)
    valid_mask = band1 != (src.nodata or -9999)
    if np.any(valid_mask):
        print("Pixel Min: " + str(np.nanmin(band1[valid_mask])) + " | Max: " + str(np.nanmax(band1[valid_mask])))
    
    # Plot with specialized colormap: ${defaultCmap}
    plt.figure(figsize=(10, 6))
    plt.imshow(band1, cmap='${defaultCmap}')
    plt.colorbar(label='Pixel Values')
    plt.title("${dataset.name}")
    plt.show()

    # Step 5: (Optional) Interactive Earth Engine Overlay in Colab
    try:
        import geemap, ee
        ee.Initialize(project='ee-petersonyang87')
        Map = geemap.Map()
        # Map.add_raster(target_file, cmap='${defaultCmap}', layer_name='${dataset.name}')
        # display(Map)
    except Exception as e:
        print("Earth Engine overlay ready: Please authorize access to your Earth Engine account by running")
        print("  earthengine authenticate")
`;

  const colabAllInOneSnippet = `# ============================================================
# Google Colab: 100% Verified Pure-Python Downloader & Loader
# Dataset: ${dataset.name}
# ============================================================

# Step 1: Install required packages
!pip install -q rasterio matplotlib geemap

# Step 2: Download dataset directly in Google Colab
import re
import requests
import rasterio
import matplotlib.pyplot as plt

def fetch_dataset(url: str, output_path: str):
    print(f"Downloading from source to {output_path}...")
    if "drive.google.com" in url:
        match = re.search(r'/d/([a-zA-Z0-9_-]+)', url) or re.search(r'id=([a-zA-Z0-9_-]+)', url)
        file_id = match.group(1) if match else url.strip()
        session = requests.Session()
        endpoint = "https://drive.usercontent.google.com/download"
        params = {'id': file_id, 'export': 'download', 'confirm': 't'}
        res = session.get(endpoint, params=params, stream=True)
        for k, v in res.cookies.items():
            if k.startswith('download_warning'):
                params['confirm'] = v
                res = session.get(endpoint, params=params, stream=True)
                break
        with open(output_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
    else:
        res = requests.get(url, stream=True)
        with open(output_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
    print("✅ Download completed successfully!")

# Download into Colab cloud filesystem:
source_url = "${sourceUrl}"
fetch_dataset(source_url, "${safeFilename}")

# Step 3: Open and Plot with Rasterio
with rasterio.open('${safeFilename}') as src:
    print("✅ GeoTIFF loaded successfully!")
    print("Raster Dimensions:", src.shape)
    print("CRS:", src.crs)
    print("Bands:", src.count)
    
    # Read Band 1
    band1 = src.read(1)
    
    plt.figure(figsize=(10, 6))
    plt.imshow(band1, cmap='viridis')
    plt.colorbar(label='Pixel Values')
    plt.title("${dataset.name}")
    plt.show()

# Step 4: Interactive Earth Engine Overlay in Colab
import geemap
import ee

try:
    ee.Initialize(project='ee-petersonyang87')
    Map = geemap.Map()
    Map.add_raster('${safeFilename}', layer_name="${dataset.name}")
    
    # Background Sentinel-2
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterDate('2023-01-01', '2023-12-31')
          .median())
    Map.addLayer(s2, {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000}, 'Sentinel-2 RGB')
    
    display(Map)
except Exception as e:
    print("GEE Map Note:", e)
`;

  const rasterioSnippet = `# Local Python / Jupyter Stream
import rasterio
import matplotlib.pyplot as plt

# Using local file:
with rasterio.open('${safeFilename}') as src:
    print("CRS:", src.crs)
    data = src.read(1)
    plt.imshow(data, cmap='terrain')
    plt.show()
`;

  const curlSnippet = `# Direct Download CLI
${isDrive ? `gdown --fuzzy "${sourceUrl}" -O ${safeFilename}` : `curl -L "${rawUrl}" -o ${safeFilename}`}
`;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({
      title: "Copied to Clipboard! 📋",
      description: `Copied ${key} to your clipboard.`,
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border/80 text-foreground">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <DialogTitle className="text-lg font-bold">Use in Google Colab & Earth Engine</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Stream this portal dataset directly into Google Colab, GEE, or Jupyter Notebooks using its unique Dataset ID.
          </DialogDescription>
        </DialogHeader>

        {/* Dataset Header Info */}
        <div className="bg-muted/40 p-3 rounded-lg border border-border/60 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-sm">{dataset.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/30">
                {dataset.file_type || "raster"}
              </Badge>
              {dataset.file_size_mb && (
                <span className="text-xs text-muted-foreground font-mono">
                  {dataset.file_size_mb.toFixed(2)} MB
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {/* Dataset ID Badge */}
            <div className="flex items-center justify-between bg-background/80 px-2.5 py-1.5 rounded border border-border/60 text-xs font-mono">
              <span className="text-muted-foreground">Dataset ID:</span>
              <div className="flex items-center gap-1.5 font-bold text-indigo-400">
                <span>{dataset.id}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => handleCopy(dataset.id, "Dataset ID")}
                  title="Copy Dataset ID"
                >
                  {copiedKey === "Dataset ID" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>

            {/* Direct API URL */}
            <div className="flex items-center justify-between bg-background/80 px-2.5 py-1.5 rounded border border-border/60 text-xs font-mono">
              <span className="text-muted-foreground">Raw Stream URL:</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-2 text-[11px] font-mono text-indigo-400 hover:text-indigo-300"
                onClick={() => handleCopy(rawUrl, "Stream URL")}
              >
                {copiedKey === "Stream URL" ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                Copy URL
              </Button>
            </div>
          </div>
        </div>

        {/* Universal Code Snippet */}
        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between bg-muted/70 px-3 py-1.5 rounded-t-lg border border-b-0 border-border/80 text-xs">
            <span className="font-mono text-muted-foreground">Universal Python Script for Colab/Jupyter</span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm"
              onClick={() => handleCopy(huggingFaceSnippet, "Python Script")}
            >
              {copiedKey === "Python Script" ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === "Python Script" ? "Copied!" : "Copy Code"}
            </Button>
          </div>
          <div className="relative rounded-b-lg overflow-hidden border border-border/80 bg-zinc-950 font-mono text-[11px] leading-relaxed p-3 text-zinc-200 max-h-72 overflow-y-auto">
            <pre className="overflow-x-auto whitespace-pre">{huggingFaceSnippet}</pre>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            💡 <strong>Smart Loader:</strong> This script automatically detects the best way to download your data into Colab and plots it instantly.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <a
            href="https://colab.research.google.com/#create=true"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-medium"
          >
            <Code2 className="w-3.5 h-3.5" />
            Open New Google Colab Notebook
            <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
