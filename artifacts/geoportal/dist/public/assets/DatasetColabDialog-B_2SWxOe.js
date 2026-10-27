import{f as u,u as E,r as I,E as $,j as e,G as M,H as R,J as z,K as B,P as O,O as L,B as x}from"./index-Cc4kU9So.js";import{l as m,d as G,b as N,e as C,i as U}from"./leaflet-BR9t6KUk.js";import{B as q}from"./badge-DY2lfayM.js";import{S as F}from"./sparkles-DiD0klBB.js";import{C as w}from"./index-DMZGbDfU.js";import{C as _}from"./copy-DAktLNnJ.js";import{E as P}from"./external-link-D3Hl9cSH.js";const T=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],se=u("archive",T);const A=[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],H=u("code-xml",A);const V=[["path",{d:"M10 12.5 8 15l2 2.5",key:"1tg20x"}],["path",{d:"m14 12.5 2 2.5-2 2.5",key:"yinavb"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",key:"1mlx9k"}]],ne=u("file-code",V);const J=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",key:"1cjeqo"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",key:"19qd67"}]],oe=u("link",J);const K=[["path",{d:"M12 3v18",key:"108xh3"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M3 9h18",key:"1pudct"}],["path",{d:"M3 15h18",key:"5xshup"}]],ie=u("table",K);function W(r,a,t){a.bounds instanceof m.LatLngBounds&&a.bounds!==t.bounds&&r.setBounds(a.bounds),a.opacity!=null&&a.opacity!==t.opacity&&r.setOpacity(a.opacity),a.zIndex!=null&&a.zIndex!==t.zIndex&&r.setZIndex(a.zIndex)}const re=G(function({bounds:a,url:t,...o},i){const p=new m.ImageOverlay(t,a,o);return N(p,C(i,{overlayContainer:p}))},function(a,t,o){if(W(a,t,o),t.bounds!==o.bounds){const i=t.bounds instanceof m.LatLngBounds?t.bounds:new m.LatLngBounds(t.bounds);a.setBounds(i)}t.url!==o.url&&a.setUrl(t.url)}),le=U(function({bounds:a,...t},o){const i=new m.Rectangle(a,t);return N(i,C(o,{overlayContainer:i}))},function(a,t,o){t.bounds!==o.bounds&&a.setBounds(t.bounds)});function ce({isOpen:r,onClose:a,dataset:t}){const{toast:o}=E(),[i,p]=I.useState(null);if(!t)return null;const f=window.location.origin,b=`${f}${$}/datasets/${t.id}/raw`,h=t.original_filename||t.name||"dataset";let g=`${t.id}_${h}`,j="pi0texy/blacportal-datasets";const l=t;if(l.storage_key&&l.storage_key.startsWith("hf://")){const n=l.storage_key.replace("hf://","").split("/");n.length>=3?(j=`${n[0]}/${n[1]}`,g=n.slice(2).join("/")):g=n[1]||g}let d=l.source_url||l.url||"";if(!d&&l.description){const n=l.description.match(/https?:\/\/[^\s]+/);n&&(d=n[0])}d||(d="https://drive.google.com/file/d/1wWu_jJxp0XdNeoO17-MwtUCl5X7rrGhy/view?usp=sharing"),d.includes("drive.google.com"),f.includes("localhost")||f.includes("127.0.0.1");const s=(t.name||"").toLowerCase();let c="viridis";s.includes("lst")||s.includes("temp")||s.includes("heat")||s.includes("uhi")?c="inferno":s.includes("ndvi")||s.includes("veg")||s.includes("forest")||s.includes("lulc")?c="RdYlGn":s.includes("water")||s.includes("flood")||s.includes("rain")?c="Blues":(s.includes("slope")||s.includes("dem")||s.includes("elevation"))&&(c="terrain");const S=`# ============================================================
# Google Colab: Hugging Face Fast Stream for ${t.name}
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
    repo_id="${j}",
    repo_type="dataset",
    filename="${g}"
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
    
    # Plot with specialized colormap: ${c}
    plt.figure(figsize=(10, 6))
    plt.imshow(band1, cmap='${c}')
    plt.colorbar(label='Pixel Values')
    plt.title("${t.name}")
    plt.show()

    # Step 5: (Optional) Interactive Earth Engine Overlay in Colab
    try:
        import geemap, ee
        ee.Initialize(project='ee-petersonyang87')
        Map = geemap.Map()
        # Map.add_raster(target_file, cmap='${c}', layer_name='${t.name}')
        # display(Map)
    except Exception as e:
        print("Earth Engine overlay ready: Please authorize access to your Earth Engine account by running")
        print("  earthengine authenticate")
`,D=`# ============================================================
# Google Colab: 100% Verified Pure-Python Downloader & Loader
# Dataset: ${t.name}
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
source_url = "${d}"
fetch_dataset(source_url, "${h}")

# Step 3: Open and Plot with Rasterio
with rasterio.open('${h}') as src:
    print("✅ GeoTIFF loaded successfully!")
    print("Raster Dimensions:", src.shape)
    print("CRS:", src.crs)
    print("Bands:", src.count)
    
    # Read Band 1
    band1 = src.read(1)
    
    plt.figure(figsize=(10, 6))
    plt.imshow(band1, cmap='viridis')
    plt.colorbar(label='Pixel Values')
    plt.title("${t.name}")
    plt.show()

# Step 4: Interactive Earth Engine Overlay in Colab
import geemap
import ee

try:
    ee.Initialize(project='ee-petersonyang87')
    Map = geemap.Map()
    Map.add_raster('${h}', layer_name="${t.name}")
    
    # Background Sentinel-2
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterDate('2023-01-01', '2023-12-31')
          .median())
    Map.addLayer(s2, {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000}, 'Sentinel-2 RGB')
    
    display(Map)
except Exception as e:
    print("GEE Map Note:", e)
`,y=(n,k)=>{navigator.clipboard.writeText(n),p(k),o({title:"Copied to Clipboard! 📋",description:`Copied ${k} to your clipboard.`}),setTimeout(()=>p(null),2e3)},v=l.storage_key&&l.storage_key.startsWith("hf://")?S:D;return e.jsx(M,{open:r,onOpenChange:n=>!n&&a(),children:e.jsxs(R,{className:"max-w-2xl bg-card border-border/80 text-foreground",children:[e.jsxs(z,{className:"space-y-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(F,{className:"w-5 h-5 text-indigo-400"}),e.jsx(B,{className:"text-lg font-bold",children:"Use in Google Colab & Earth Engine"})]}),e.jsx(O,{className:"text-xs text-muted-foreground",children:"Stream this portal dataset directly into Google Colab, GEE, or Jupyter Notebooks using its unique Dataset ID."})]}),e.jsxs("div",{className:"bg-muted/40 p-3 rounded-lg border border-border/60 space-y-2",children:[e.jsx("div",{className:"flex flex-wrap items-center justify-between gap-2",children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(L,{className:"w-4 h-4 text-blue-400"}),e.jsx("span",{className:"font-semibold text-sm",children:t.name}),e.jsx(q,{variant:"outline",className:"text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/30",children:t.file_type||"raster"}),t.file_size_mb&&e.jsxs("span",{className:"text-xs text-muted-foreground font-mono",children:[t.file_size_mb.toFixed(2)," MB"]})]})}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1",children:[e.jsxs("div",{className:"flex items-center justify-between bg-background/80 px-2.5 py-1.5 rounded border border-border/60 text-xs font-mono",children:[e.jsx("span",{className:"text-muted-foreground",children:"Dataset ID:"}),e.jsxs("div",{className:"flex items-center gap-1.5 font-bold text-indigo-400",children:[e.jsx("span",{children:t.id}),e.jsx(x,{size:"icon",variant:"ghost",className:"h-5 w-5 text-muted-foreground hover:text-foreground",onClick:()=>y(t.id,"Dataset ID"),title:"Copy Dataset ID",children:i==="Dataset ID"?e.jsx(w,{className:"w-3 h-3 text-emerald-400"}):e.jsx(_,{className:"w-3 h-3"})})]})]}),e.jsxs("div",{className:"flex items-center justify-between bg-background/80 px-2.5 py-1.5 rounded border border-border/60 text-xs font-mono",children:[e.jsx("span",{className:"text-muted-foreground",children:"Raw Stream URL:"}),e.jsx("div",{className:"flex items-center gap-1.5 ml-2 font-bold text-indigo-400 truncate max-w-[200px]",title:b,children:e.jsx("span",{className:"truncate",children:b})}),e.jsxs(x,{size:"sm",variant:"ghost",className:"h-5 px-2 ml-auto text-[11px] font-mono text-indigo-400 hover:text-indigo-300 flex-shrink-0",onClick:()=>y(b,"Stream URL"),children:[i==="Stream URL"?e.jsx(w,{className:"w-3 h-3 mr-1 text-emerald-400"}):e.jsx(_,{className:"w-3 h-3 mr-1"}),"Copy URL"]})]})]})]}),e.jsxs("div",{className:"space-y-2 mt-2",children:[e.jsxs("div",{className:"flex items-center justify-between bg-muted/70 px-3 py-1.5 rounded-t-lg border border-b-0 border-border/80 text-xs",children:[e.jsx("span",{className:"font-mono text-muted-foreground",children:"Universal Python Script for Colab/Jupyter"}),e.jsxs(x,{size:"sm",className:"h-7 px-3 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm",onClick:()=>y(v,"Python Script"),children:[i==="Python Script"?e.jsx(w,{className:"w-3.5 h-3.5 text-white"}):e.jsx(_,{className:"w-3.5 h-3.5"}),i==="Python Script"?"Copied!":"Copy Code"]})]}),e.jsx("div",{className:"relative rounded-b-lg overflow-hidden border border-border/80 bg-zinc-950 font-mono text-[11px] leading-relaxed p-3 text-zinc-200 max-h-72 overflow-y-auto",children:e.jsx("pre",{className:"overflow-x-auto whitespace-pre",children:v})}),e.jsxs("p",{className:"text-[11px] text-muted-foreground pt-1",children:["💡 ",e.jsx("strong",{children:"Smart Loader:"})," This script automatically detects the best way to download your data into Colab and plots it instantly."]})]}),e.jsxs("div",{className:"flex items-center justify-between pt-2 border-t border-border/60",children:[e.jsxs("a",{href:"https://colab.research.google.com/#create=true",target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-medium",children:[e.jsx(H,{className:"w-3.5 h-3.5"}),"Open New Google Colab Notebook",e.jsx(P,{className:"w-3 h-3"})]}),e.jsx("div",{className:"flex items-center gap-2",children:e.jsx(x,{variant:"outline",size:"sm",onClick:a,className:"h-7 text-xs",children:"Close"})})]})]})})}export{se as A,H as C,ce as D,ne as F,re as I,oe as L,le as R,ie as T};
