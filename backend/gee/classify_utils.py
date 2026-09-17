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

def hex_to_rgb(h: str):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(
        max(0, min(255, int(round(rgb[0])))),
        max(0, min(255, int(round(rgb[1])))),
        max(0, min(255, int(round(rgb[2]))))
    )

def class_palette(n: int) -> list:
    """Return n hex colours spanning green → yellow → red smoothly for 1 to 15 classes."""
    stops = [
        "#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf",
        "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026",
    ]
    n = max(1, min(n, 15))
    if n == 1:
        return ["#1a9850"]
    if n == len(stops):
        return stops
    
    rgb_stops = [hex_to_rgb(s) for s in stops]
    result = []
    for i in range(n):
        t = i / (n - 1) * (len(rgb_stops) - 1)
        idx = int(t)
        frac = t - idx
        if idx >= len(rgb_stops) - 1:
            result.append(stops[-1])
        else:
            c1 = rgb_stops[idx]
            c2 = rgb_stops[idx + 1]
            interp = (
                c1[0] + (c2[0] - c1[0]) * frac,
                c1[1] + (c2[1] - c1[1]) * frac,
                c1[2] + (c2[2] - c1[2]) * frac,
            )
            result.append(rgb_to_hex(interp))
    return result

def class_labels(n: int) -> list:
    """Descriptive labels (low → high) for n classes."""
    presets = {
        1: ["Uniform / Full Area"],
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
    if n in presets:
        return presets[n]
    return [f"Class {i + 1}" for i in range(n)]

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
    hist = sorted([b for b in hist if b[1] > 0], key=lambda x: x[0])
    if not hist: return []
    if len(hist) <= n_classes: return sorted(list(set([b[0] for b in hist])))
    
    values = [b[0] for b in hist]
    step = len(values) / n_classes
    centroids = [values[min(int(i * step), len(values) - 1)] for i in range(n_classes)]
    
    clusters = [[] for _ in range(n_classes)]
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
    hist = sorted([b for b in hist if b[1] > 0], key=lambda x: x[0])
    if not hist: return []
    if len(hist) <= n_classes: return sorted(list(set([b[0] for b in hist])))
    min_val = hist[0][0]
    max_val = hist[-1][0]
    if max_val <= min_val:
        return []
    step = (max_val - min_val) / n_classes
    return [round(min_val + i * step, 4) for i in range(1, n_classes)]

def get_quantile_breaks(hist, n_classes):
    hist = sorted([b for b in hist if b[1] > 0], key=lambda x: x[0])
    if not hist: return []
    if len(hist) <= n_classes: return sorted(list(set([b[0] for b in hist])))
    total = sum(b[1] for b in hist)
    if total <= 0:
        return []
    target_step = total / n_classes
    breaks = []
    cum = 0
    target = target_step
    for val, count in hist:
        cum += count
        while cum >= target and len(breaks) < n_classes - 1:
            breaks.append(round(val, 4))
            target += target_step
    return sorted(list(set(breaks)))

def quantile_classify(layers: list, aoi, scale: int, n_classes: int, reverse_palette: bool = False, custom_labels: list = None, method: str = "natural_breaks") -> dict:
    """
    Classify each layer into n_classes using Natural Breaks (Jenks 1D KMeans approximation)
    computed within `aoi`. All breakpoints and all class areas are fetched in exactly 
    two GEE round-trips.
    """
    n = max(1, min(n_classes, 15))
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
        maxPixels=1e9, bestEffort=True,
    ).getInfo()

    classified = []
    area_bands = []
    for j, (nm, img) in enumerate(zip(names, images)):
        band_hist = hist_raw.get(nm) or []
        if n == 1:
            bps = []
        elif method == "equal_interval":
            bps = get_equal_interval_breaks(band_hist, n)
        elif method == "quantiles":
            bps = get_quantile_breaks(band_hist, n)
        else:
            bps = get_jenks_breaks(band_hist, n)
        
        # Pad or truncate bps to exactly n-1 elements
        if n > 1:
            while len(bps) < n - 1:
                bps.append(bps[-1] + 0.001 if bps else 1.0)
            bps = bps[:n-1]
        else:
            bps = []
        
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
        reducer=ee.Reducer.sum(), geometry=aoi, scale=scale, maxPixels=1e10, bestEffort=True
    ).getInfo()

    panels = [None] * len(names)
    import concurrent.futures
    
    def process_panel(j, nm, title, bps, cls):
        print(f"[{nm}] process_panel start")
        tile_url  = cls.getMapId(vis)["tile_fetcher"].url_format
        print(f"[{nm}] getMapId done")
        thumb_url = cls.getThumbURL({
            **vis, "region": aoi.bounds(), "dimensions": 1024, "format": "png",
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
            "clean_thumb_url": thumb_url,
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
