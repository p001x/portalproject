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
from .aoi_utils import get_bounds_and_center, safe_get_info
import threading
import time
import random

gee_semaphore = threading.BoundedSemaphore(5)

def _safe_gee_call(func, *args, **kwargs):
    from gee.auth import rotate_credentials
    retries = 5
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Too Many Requests" in err_str or "concurrency" in err_str.lower() or "quota" in err_str.lower() or "permission" in err_str.lower():
                rotate_credentials()
                if i < retries - 1:
                    time.sleep((2 ** i) + random.uniform(0, 1))
                    continue
            raise
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

def class_palette(n: int, custom_stops: list = None) -> list:
    """Return n hex colours spanning smoothly for 1 to 15 classes."""
    stops = custom_stops if custom_stops else [
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

def class_labels(n: int, reverse: bool = False) -> list:
    """Descriptive labels (low Ã¢â€ â€™ high) for n classes. If reverse=True, returns high Ã¢â€ â€™ low."""
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
        labels = presets[n].copy()
        if reverse:
            return labels[::-1]
        return labels
        
    if reverse:
        return [f"Class {n - i}" for i in range(n)]
    return [f"Class {i + 1}" for i in range(n)]

def add_legend_to_image(thumb_url: str, labels: list, palette: list) -> str:
    try:
        print(f"Fetching thumb_url with timeout=90...")
        resp = requests.get(thumb_url, timeout=90)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    except Exception as e:
        print("Failed to download or process thumb_url:", e)
        return thumb_url
        
    item_height = 20
    padding = 10
    legend_width = 180
    legend_height = padding + (len(labels) * item_height) + padding
    
    # Create a transparent overlay for the legend
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Calculate position (bottom-left corner)
    margin = 15
    x0 = margin
    y0 = img.height - legend_height - margin
    x1 = x0 + legend_width
    y1 = y0 + legend_height
    
    # Draw semi-transparent rounded rectangle
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=(255, 255, 255, 210), outline=(200, 200, 200, 255))
    else:
        draw.rectangle([x0, y0, x1, y1], fill=(255, 255, 255, 210), outline=(200, 200, 200, 255))
    
    y_offset = y0 + padding
    for lbl, color_hex in zip(labels, palette):
        draw.rectangle([x0 + padding, y_offset, x0 + padding + 15, y_offset + 15], fill=color_hex, outline="black")
        draw.text((x0 + padding + 25, y_offset + 1), lbl, fill="black")
        y_offset += item_height
        
    img = Image.alpha_composite(img, overlay)
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
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

def quantile_classify(layers: list, aoi, scale: int, n_classes: int, reverse_palette: bool = False, custom_labels: list = None, method: str = "natural_breaks", reverse_labels: bool = False, custom_breaks: dict = None, water_mask: ee.Image = None, custom_palette: list = None, add_legend: bool = False) -> dict:
    """
    Classify each layer into n_classes using Natural Breaks (Jenks 1D KMeans approximation)
    computed within `aoi`. All breakpoints and all class areas are fetched in exactly 
    two GEE round-trips.
    """
    n = max(1, min(n_classes, 15))
    pal  = class_palette(n, custom_palette)
    if reverse_palette:
        pal = pal[::-1]
    lbls = custom_labels if custom_labels and len(custom_labels) == n else class_labels(n, reverse_labels)
    vis  = {"min": 1, "max": n, "palette": pal}

    names  = [lay["name"]  for lay in layers]
    images = [lay["image"] for lay in layers]
    titles = [lay["title"] for lay in layers]

    all_bands = ee.Image.cat([img.rename(nm) for nm, img in zip(names, images)])
    
    is_global = False
    try:
        geom_str = str(aoi.serialize())
        if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
            is_global = True
    except:
        pass

    try:
        area_sqkm = 1e9 if is_global else safe_get_info(aoi.area(maxError=1000).divide(1e6))
    except Exception:
        area_sqkm = 0

    calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)

    if custom_breaks:
        raw_data = {}
    elif method == "equal_interval" and n > 1:
        raw_data = safe_get_info(all_bands.reduceRegion(
            reducer=ee.Reducer.minMax(),
            geometry=calc_geom, scale=scale, maxPixels=1e8, bestEffort=True, tileScale=4
        ))
    elif method == "quantiles" and n > 1:
        percentiles = [i * (100 / n) for i in range(1, n)]
        raw_data = safe_get_info(all_bands.reduceRegion(
            reducer=ee.Reducer.percentile(percentiles),
            geometry=calc_geom, scale=scale, maxPixels=1e8, bestEffort=True, tileScale=4
        ))
    elif n > 1:
        hist_raw = safe_get_info(all_bands.reduceRegion(
            reducer=ee.Reducer.autoHistogram(maxBuckets=100),
            geometry=calc_geom, scale=scale, maxPixels=1e8, bestEffort=True, tileScale=4
        ))
    else:
        raw_data = {}

    classified = []
    area_bands = []
    for j, (nm, img) in enumerate(zip(names, images)):
        if custom_breaks and nm in custom_breaks:
            bps = custom_breaks[nm]
        elif n == 1:
            bps = []
        elif method == "equal_interval":
            min_val = raw_data.get(f"{nm}_min")
            max_val = raw_data.get(f"{nm}_max")
            if min_val is None or max_val is None or max_val <= min_val:
                bps = []
            else:
                step = (max_val - min_val) / n
                bps = [round(min_val + i * step, 4) for i in range(1, n)]
        elif method == "quantiles":
            bps = []
            for i in range(1, n):
                val = raw_data.get(f"{nm}_p{int(i * (100 / n))}")
                if val is not None:
                    bps.append(round(val, 4))
            bps = sorted(list(set(bps)))
        else:
            band_hist = hist_raw.get(nm) or []
            bps = get_jenks_breaks(band_hist, n)
        
        # Pad or truncate bps to exactly n-1 elements
        if n > 1:
            while len(bps) < n - 1:
                bps.append(bps[-1] + 0.001 if bps else 1.0)
            bps = bps[:n-1]
        else:
            bps = []
        
        if not bps:
            cls = ee.Image(1).updateMask(img.mask())
        else:
            # Optimize classification by evaluating the potentially complex input image ONCE
            # instead of chaining multiple .where() conditions that duplicate the graph.
            thresholds = ee.Image.constant(bps)
            # img.gt(thresholds) evaluates the 1-band img against all N bands simultaneously.
            # reduce(ee.Reducer.sum()) counts how many thresholds are passed.
            # add(1) converts the count into a 1-indexed class (1 to N).
            cls = img.gt(thresholds).reduce(ee.Reducer.sum()).add(1).updateMask(img.mask())
        
        if not is_global:
            cls = cls.clip(aoi)
            
        classified.append({"bps": bps, "cls": cls})
        for ci in range(n):
            area_bands.append(
                cls.eq(ci + 1).multiply(ee.Image.pixelArea()).rename(f"b{j}c{ci}")
            )

    area_img  = ee.Image.cat(area_bands)
    area_raw  = safe_get_info(area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=calc_geom, scale=scale, maxPixels=1e8, bestEffort=True, tileScale=4
    ))

    panels = [None] * len(names)
    import concurrent.futures

    # Pre-compute the AOI region geometry ONCE outside threads to avoid N redundant getInfo() calls.
    # Each process_panel thread would otherwise call get_bounds_and_center(aoi) independently.
    if is_global:
        _panel_region = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False)
    else:
        try:
            _aoi_bounds, _ = get_bounds_and_center(aoi)
            _panel_region = ee.Geometry.Polygon([_aoi_bounds], "EPSG:4326", False)
        except Exception:
            _panel_region = aoi.bounds(maxError=1000)

    def process_panel(j, nm, title, bps, cls, area_sqkm):
        print(f"[{nm}] process_panel start")
        
        # Removed hillshade to fix tiling strip artifacts
        cls_rgb = cls.visualize(**vis).uint8()

        if water_mask is not None:
            water_rgb = water_mask.updateMask(water_mask).visualize(palette=["#08306b"])
            final_panel = ee.ImageCollection([cls_rgb, water_rgb]).mosaic()
            if not is_global:
                final_panel = final_panel.clip(aoi)
                
            # Pass vis to getMapId so classified tiles are properly coloured (was missing, causing unstyled maps)
            # NOTE: final_panel is already an RGB-visualized mosaic (3 bands), so getMapId must NOT
            # receive a palette-bearing vis dict Ã¢â‚¬â€ that only works on single-band images.
            with gee_semaphore:
                tile_url = _safe_gee_call(lambda: final_panel.getMapId()["tile_fetcher"].url_format)
                thumb_url = _safe_gee_call(lambda: final_panel.getThumbURL({
                    "region": _panel_region, "dimensions": 512, "crs": "EPSG:4326", "format": "png",
                }))
        else:
            with gee_semaphore:
                tile_url  = _safe_gee_call(lambda: cls.getMapId(vis)["tile_fetcher"].url_format)
                thumb_url = _safe_gee_call(lambda: cls_rgb.getThumbURL({
                    "region": _panel_region, "dimensions": 512, "crs": "EPSG:4326", "format": "png",
                }))
        print(f"[{nm}] getMapId and getThumbURL done")
        try:
            if is_global or area_sqkm > 50000:
                download_url = None
            else:
                print(f"[{nm}] getDownloadURL start")
                with gee_semaphore:
                    download_url = _safe_gee_call(lambda: cls.getDownloadURL({"scale": scale, "region": calc_geom, "format": "GEO_TIFF", "crs": "EPSG:4326"})) if hasattr(cls, "getDownloadURL") else None
                print(f"[{nm}] getDownloadURL done")
        except Exception as e:
            print(f"[{nm}] getDownloadURL error:", e)
            download_url = None
            
        # Add legend to the downloaded static map only if requested and thumb_url exists
        if add_legend and thumb_url:
            thumb_url_with_legend = add_legend_to_image(thumb_url, lbls, pal)
        else:
            thumb_url_with_legend = thumb_url

        areas = {}
        for ci, lbl in enumerate(lbls):
            if n == 1:
                suffix = ""
            elif ci == 0:
                suffix = f" (<{bps[0]:.3g})" if bps else ""
            elif ci == n - 1:
                suffix = f" (Ã¢â€°Â¥{bps[-1]:.3g})" if bps else ""
            else:
                suffix = f" ({bps[ci-1]:.3g}Ã¢â‚¬â€œ{bps[ci]:.3g})"
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
                process_panel, j, names[j], titles[j], classified[j]["bps"], classified[j]["cls"], area_sqkm
            ): j for j in range(len(names))
        }
        concurrent.futures.wait(futures.keys())
        
    for future in futures:
        j = futures[future]
        panels[j] = future.result()

    return {"panels": panels, "n_classes": n, "labels": lbls}
