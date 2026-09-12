import json
"""
Shared helpers for quantile-based image classification.
Identical to rwanda-geoportal/gee_scripts/classify_utils.py but without
any Streamlit imports, so it can run in the FastAPI backend.
"""
import ee
import io
import requests
import base64
from PIL import Image, ImageDraw

PANEL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def class_palette(n: int) -> list:
    """Return n hex colours spanning green → yellow → red."""
    full = [
        "#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf",
        "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026",
    ]
    n = max(1, min(n, len(full)))
    if n == 1:
        return [full[4]]
    step = (len(full) - 1) / (n - 1)
    return [full[round(i * step)] for i in range(n)]

def class_labels(n: int) -> list:
    """Descriptive labels (low → high) for n classes."""
    presets = {
        1: ["Uniform"],
        2: ["Low", "High"],
        3: ["Low", "Moderate", "High"],
        4: ["Low", "Moderate", "High", "Very High"],
        5: ["Very Low", "Low", "Moderate", "High", "Very High"],
        6: ["Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
        7: ["Extremely Low", "Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
        8: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderately High", "High", "Very High", "Extreme"],
        9: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extreme"],
        10: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extremely High", "Extreme"],
    }
    return presets.get(n, [f"Class {i + 1}" for i in range(n)])

def add_legend_to_image(thumb_url: str, labels: list, palette: list) -> str:
    try:
        print(f"Fetching thumb_url with timeout=30...")
        resp = requests.get(thumb_url, timeout=30)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    except Exception as e:
        print("Failed to download or process thumb_url:", e)
        return thumb_url
        
    item_height = 20
    padding = 10
    legend_height = padding + (len(labels) * item_height) + padding
    
    new_img = Image.new("RGBA", (img.width, img.height + legend_height), (255, 255, 255, 255))
    new_img.paste(img, (0, 0))
    
    draw = ImageDraw.Draw(new_img)
    y_offset = img.height + padding
    for lbl, color_hex in zip(labels, palette):
        draw.rectangle([padding, y_offset, padding + 15, y_offset + 15], fill=color_hex, outline="black")
        draw.text((padding + 25, y_offset + 1), lbl, fill="black")
        y_offset += item_height
        
    buf = io.BytesIO()
    new_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"

def get_jenks_breaks(hist, n_classes):
    import random
    hist = [b for b in hist if b[1] > 0]
    if not hist: return []
    if len(hist) <= n_classes: return sorted([b[0] for b in hist])
    
    values = sorted([b[0] for b in hist])
    centroids = [values[int(i * len(values) / n_classes)] for i in range(n_classes)]
    
    for _ in range(30):
        clusters = [[] for _ in range(n_classes)]
        cluster_sums = [0.0] * n_classes
        cluster_counts = [0.0] * n_classes
        
        for val, count in hist:
            distances = [abs(val - c) for c in centroids]
            min_dist_idx = distances.index(min(distances))
            clusters[min_dist_idx].append((val, count))
            cluster_sums[min_dist_idx] += val * count
            cluster_counts[min_dist_idx] += count
            
        new_centroids = []
        for i, cl in enumerate(clusters):
            if cluster_counts[i] > 0:
                new_centroids.append(cluster_sums[i] / cluster_counts[i])
            else:
                new_centroids.append(random.choice(values))
        new_centroids.sort()
        
        if centroids == new_centroids:
            break
        centroids = new_centroids
        
    breaks = []
    for cl in clusters[:-1]:
        if cl:
            breaks.append(max(v for v, c in cl))
            
    return sorted(list(set(breaks)))

def get_equal_interval_breaks(hist, n_classes):
    hist = [b for b in hist if b[1] > 0]
    if not hist: return []
    if len(hist) <= n_classes: return sorted([b[0] for b in hist])
    min_val = hist[0][0]
    max_val = hist[-1][0]
    step = (max_val - min_val) / n_classes
    return [min_val + i * step for i in range(1, n_classes)]

def get_quantile_breaks(hist, n_classes):
    hist = [b for b in hist if b[1] > 0]
    if not hist: return []
    if len(hist) <= n_classes: return sorted([b[0] for b in hist])
    total = sum(b[1] for b in hist)
    target_step = total / n_classes
    breaks = []
    cum = 0
    target = target_step
    for val, count in hist:
        cum += count
        while cum >= target and len(breaks) < n_classes - 1:
            breaks.append(val)
            target += target_step
    return sorted(list(set(breaks)))

def quantile_classify(layers: list, aoi, scale: int, n_classes: int, reverse_palette: bool = False, custom_labels: list = None, method: str = "natural_breaks") -> dict:
    """
    Classify each layer into n_classes using Natural Breaks (Jenks 1D KMeans approximation)
    computed within `aoi`. All breakpoints and all class areas are fetched in exactly 
    two GEE round-trips.
    """
    n = max(2, min(n_classes, 10))
    pal  = class_palette(n)
    if reverse_palette:
        pal = pal[::-1]
    lbls = custom_labels if custom_labels and len(custom_labels) == n else class_labels(n)
    vis  = {"min": 1, "max": n, "palette": pal}

    names  = [lay["name"]  for lay in layers]
    images = [lay["image"] for lay in layers]
    titles = [lay["title"] for lay in layers]

    all_bands = ee.Image.cat([img.rename(nm) for nm, img in zip(names, images)])
    
    hist_raw = all_bands.reduceRegion(
        reducer=ee.Reducer.autoHistogram(maxBuckets=100),
        geometry=aoi,
        scale=scale,
        maxPixels=10000, bestEffort=True,
    ).getInfo()

    classified = []
    area_bands = []
    for j, (nm, img) in enumerate(zip(names, images)):
        band_hist = hist_raw.get(nm) or []
        if method == "equal_interval":
            bps = get_equal_interval_breaks(band_hist, n)
        elif method == "quantiles":
            bps = get_quantile_breaks(band_hist, n)
        else:
            bps = get_jenks_breaks(band_hist, n)
        # Pad or truncate bps to exactly n-1 elements
        while len(bps) < n - 1:
            bps.append(bps[-1] + 0.001 if bps else 1.0)
        bps = bps[:n-1]
        
        cls = ee.Image(1)
        for i, bp in enumerate(bps):
            cls = cls.where(img.gt(bp), i + 2)
        cls = cls.clip(aoi)
        classified.append({"bps": bps, "cls": cls})
        for ci in range(n):
            area_bands.append(
                cls.eq(ci + 1).multiply(ee.Image.pixelArea()).rename(f"b{j}c{ci}")
            )

    area_img  = ee.Image.cat(area_bands)
    area_raw  = area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=aoi, scale=scale, maxPixels=10000, bestEffort=True
    ).getInfo()

    panels = [None] * len(names)
    import concurrent.futures
    
    def process_panel(j, nm, title, bps, cls):
        print(f"[{nm}] process_panel start")
        tile_url  = cls.getMapId(vis)["tile_fetcher"].url_format
        print(f"[{nm}] getMapId done")
        thumb_url = cls.getThumbURL({
            **vis, "region": aoi.bounds(), "dimensions": 512, "format": "png",
        })
        print(f"[{nm}] getThumbURL done")
        try:
            print(f"[{nm}] getDownloadURL start")
            download_url = cls.getDownloadURL({"scale": scale, "region": aoi.bounds(), "format": "GEO_TIFF"}) if hasattr(cls, "getDownloadURL") else None
            print(f"[{nm}] getDownloadURL done")
        except Exception as e:
            print(f"[{nm}] getDownloadURL error:", e)
            download_url = None
            
        print(f"[{nm}] add_legend_to_image start")
        # Add legend to the downloaded static map
        thumb_url_with_legend = add_legend_to_image(thumb_url, lbls, pal)
        print(f"[{nm}] add_legend_to_image done")

        areas = {}
        for ci, lbl in enumerate(lbls):
            if n == 1:
                suffix = ""
            elif ci == 0:
                suffix = f" (<{bps[0]:.3g})" if bps else ""
            elif ci == n - 1:
                suffix = f" (≥{bps[-1]:.3g})" if bps else ""
            else:
                suffix = f" ({bps[ci-1]:.3g}–{bps[ci]:.3g})"
            km2 = round((area_raw.get(f"b{j}c{ci}", 0) or 0) / 1e6, 2)
            areas[lbl + suffix] = km2

        return {
            "letter":      PANEL_LETTERS[j],
            "name":        nm,
            "title":       title,
            "tile_url":    tile_url,
            "thumb_url":   thumb_url_with_legend,
            "download_url": download_url,
            "areas":       areas,
            "breakpoints": bps,
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(names), 10)) as executor:
        futures = {
            executor.submit(
                process_panel, j, names[j], titles[j], classified[j]["bps"], classified[j]["cls"]
            ): j for j in range(len(names))
        }
        concurrent.futures.wait(futures.keys())
        
    for future in futures:
        j = futures[future]
        panels[j] = future.result()

    return {"panels": panels, "n_classes": n, "labels": lbls}
