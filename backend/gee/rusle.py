import json
"""RUSLE soil erosion analysis — refactored for decoupled API."""
import math
import ee
from cachetools import TTLCache
import concurrent.futures
from threading import Lock
from gee.classify_utils import quantile_classify

def get_dynamic_scale(geom):
    try:
        area_sqkm = geom.area().divide(1e6).getInfo()
        if area_sqkm > 10000: return 500
        elif area_sqkm > 2000: return 250
        elif area_sqkm > 500: return 100
        else: return 30
    except:
        return 250

_cache_map: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_stats: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_classify: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_export: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_build: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

FACTOR_VIS = {
    "R": {"label": "R — Rainfall Erosivity", "unit": "MJ·mm·ha⁻¹·h⁻¹·yr⁻¹",
          "description": "Roose (1977): R = 38.5 + 0.35×P (CHIRPS annual rainfall)",
          "min": 700, "max": 1300,
          "palette": ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"],
          "normal_desc": "Higher rainfall erosivity = higher erosion risk",
          "reversed_desc": "Higher rainfall erosivity treated as lower risk (reversed)"},
    "K": {"label": "K — Soil Erodibility", "unit": "t·ha·h·MJ⁻¹·ha⁻¹·mm⁻¹",
          "description": "Williams (1995) EPIC formula — OpenLandMap clay & sand (0–10 cm)",
          "min": 0.020, "max": 0.060,
          "palette": ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
          "normal_desc": "More erodible soil = higher erosion risk",
          "reversed_desc": "More erodible soil treated as lower risk (reversed)"},
    "LS": {"label": "LS — Topographic Factor", "unit": "dimensionless",
           "description": "L: Desmet & Govers (1996) via HydroSHEDS; S: McCool et al. (1987)",
           "min": 0, "max": 100,
           "palette": ["#f7fcfd", "#e0ecf4", "#bfd3e6", "#9ebcda", "#8c96c6", "#88419d", "#6e016b"],
           "normal_desc": "Longer/steeper slopes = higher erosion risk",
           "reversed_desc": "Longer/steeper slopes treated as lower risk (reversed)"},
    "C": {"label": "C — Cover Management", "unit": "0 – 1",
          "description": "Van der Knijff (2000): C = exp(−2×NDVI/(1−NDVI)) — Sentinel-2 SR",
          "min": 0.0, "max": 1.0,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
          "normal_desc": "Less vegetation cover = higher erosion risk",
          "reversed_desc": "Less vegetation cover treated as lower risk (reversed)"},
    "P": {"label": "P — Support Practice", "unit": "0 – 1",
          "description": "Slope-based Rwanda terracing: <5°→0.10 … >30°→1.00",
          "min": 0.0, "max": 1.0,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
          "normal_desc": "Less conservation support = higher erosion risk",
          "reversed_desc": "Less conservation support treated as lower risk (reversed)"},
    "A": {"label": "A — Annual Soil Loss", "unit": "t·ha⁻¹·yr⁻¹",
          "description": "RUSLE result: A = R × K × LS × C × P",
          "min": 0, "max": 200,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"]},
}

RECLASS_FACTOR_ORDER = ["R", "K", "LS", "C", "P"]

def _class_palette(n: int) -> list:
    full = ["#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf",
            "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026"]
    if n == 1: return ["#ffffbf"]
    if n >= len(full): return full[:n]
    step = (len(full) - 1) / (n - 1)
    return [full[round(i * step)] for i in range(n)]

def _build_rusle_images(
    aoi_config: dict, year: int,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False
):
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    is_first = False
    with _lock:
        if cache_key in _cache_build:
            cached = _cache_build[cache_key]
        else:
            cached = concurrent.futures.Future()
            _cache_build[cache_key] = cached
            is_first = True

    if not is_first:
        return cached.result()

    try:
        from gee.aoi_utils import get_aoi_geometry
        import hashlib
        from gee.auth import get_gee_status
        
        aoi = get_aoi_geometry(aoi_config)
        dynamic_scale = get_dynamic_scale(aoi)
        
        project_id = get_gee_status()["project_id"]
        is_cacheable = aoi_config.get("type") in ["admin", "district", "province", "world"]
        asset_id = None
        
        def _apply_reverse(img, key, reverse_flag):
            if reverse_flag:
                v = FACTOR_VIS[key]
                return ee.Image(v["max"] + v["min"]).subtract(img).rename(key)
            return img.rename(key)
            
        if is_cacheable:
            config_str = json.dumps(aoi_config, sort_keys=True)
            config_hash = hashlib.md5(config_str.encode()).hexdigest()[:10]
            # Store in the root of the project to avoid needing to create folders
            asset_id = f"projects/{project_id}/assets/AutoCache_RUSLE_{year}_{config_hash}"
            
            try:
                # Check if it already exists
                ee.data.getAsset(asset_id)
                print(f"[+] CACHE HIT: Loading {asset_id} directly from Earth Engine Assets!")
                cached_img = ee.Image(asset_id)
                
                # Reconstruct the dictionary from the multi-band asset
                factor_images = {
                    "R": _apply_reverse(cached_img.select("R"), "R", reverse_r).clip(aoi),
                    "K": _apply_reverse(cached_img.select("K"), "K", reverse_k).clip(aoi),
                    "LS": _apply_reverse(cached_img.select("LS"), "LS", reverse_ls).clip(aoi),
                    "C": _apply_reverse(cached_img.select("C"), "C", reverse_c).clip(aoi),
                    "P": _apply_reverse(cached_img.select("P"), "P", reverse_p).clip(aoi),
                    "A": cached_img.select("A").clip(aoi),
                }
                risk_index = cached_img.select("risk_index").clip(aoi)
                
                res = {
                    "aoi": aoi,
                    "scale": dynamic_scale,
                    "factor_images": factor_images,
                    "risk_index": risk_index,
                }
                cached.set_result(res)
                return res
            except Exception:
                # Doesn't exist yet, compute it!
                pass

        start = f"{year}-01-01"
        end = f"{year}-12-31"

        chirps_annual = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start, end).filterBounds(aoi).sum()
        R = chirps_annual.multiply(0.35).add(38.5).rename("R")

        clay = ee.Image("OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02").select("b0")
        sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select("b0")
        silt = clay.add(sand).multiply(-1).add(100).max(1)
        f_csand = sand.multiply(clay.add(sand).divide(100)).multiply(-0.0256).exp().multiply(0.3).add(0.2)
        f_cl_si = silt.divide(clay.add(silt).max(1)).pow(0.3)
        K = f_csand.multiply(f_cl_si).multiply(0.763).multiply(0.1317).max(0.020).min(0.060).rename("K")

        dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
        slope_deg = ee.Terrain.slope(dem)
        slope_rad = slope_deg.multiply(math.pi / 180)
        sin_theta = slope_rad.sin()
        flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1").max(0)
        cell_area_m2 = 450.0 * 450.0
        As = flow_acc.add(0.5).multiply(cell_area_m2)
        L = As.divide(22.13).pow(0.4)
        S_gentle = sin_theta.multiply(10.8).add(0.03)
        S_steep = sin_theta.multiply(16.8).subtract(0.50)
        S = S_gentle.where(slope_deg.gte(5.14), S_steep).max(0.03)
        LS = L.multiply(S).min(300).rename("LS")

        if year >= 2016:
            s2_ndvi_col = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterDate(start, end)
                .filterBounds(aoi)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
                .map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
            )
            ndvi = s2_ndvi_col.median()
        elif year >= 2014:
            l8_ndvi_col = (
                ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                .filterDate(start, end)
                .filterBounds(aoi)
                .filter(ee.Filter.lt("CLOUD_COVER", 30))
                .map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))
            )
            ndvi = l8_ndvi_col.median()
        else:
            l7_ndvi_col = (
                ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
                .filterDate(start, end)
                .filterBounds(aoi)
                .filter(ee.Filter.lt("CLOUD_COVER", 30))
                .map(lambda img: img.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI"))
            )
            ndvi = l7_ndvi_col.median()
        ndvi_safe = ndvi.max(0.001).min(0.990)
        C = ndvi_safe.multiply(-2).divide(ndvi_safe.multiply(-1).add(1)).exp().max(0.001).min(1.0).rename("C")

        P = (ee.Image(1.0).where(slope_deg.lt(5), 0.10).where(slope_deg.gte(5).And(slope_deg.lt(10)), 0.12)
             .where(slope_deg.gte(10).And(slope_deg.lt(15)), 0.14).where(slope_deg.gte(15).And(slope_deg.lt(20)), 0.19)
             .where(slope_deg.gte(20).And(slope_deg.lt(25)), 0.25).where(slope_deg.gte(25).And(slope_deg.lt(30)), 0.50)
             .where(slope_deg.gte(30), 1.00).rename("P"))

        A = R.multiply(K).multiply(LS).multiply(C).multiply(P).rename("A")
        A = A.where(A.lt(0), 0).clip(aoi)
        
        factor_images = {
            "R": _apply_reverse(R, "R", reverse_r).clip(aoi),
            "K": _apply_reverse(K, "K", reverse_k).clip(aoi),
            "LS": _apply_reverse(LS, "LS", reverse_ls).clip(aoi),
            "C": _apply_reverse(C, "C", reverse_c).clip(aoi),
            "P": _apply_reverse(P, "P", reverse_p).clip(aoi),
            "A": A,
        }
        
        risk_index = (
            factor_images["R"].add(factor_images["K"]).add(factor_images["LS"])
            .add(factor_images["C"]).add(factor_images["P"]).divide(5.0).clip(aoi).rename("RiskIndex")
        )
        
        # --- CACHING TRIGGER ---
        if is_cacheable and asset_id:
            try:
                print(f"[*] CACHE MISS: Triggering background export to save {asset_id} permanently...")
                export_img = ee.Image.cat([
                    R.rename("R"), K.rename("K"), LS.rename("LS"),
                    C.rename("C"), P.rename("P"), A.rename("A"),
                    risk_index.rename("risk_index")
                ])
                task = ee.batch.Export.image.toAsset(
                    image=export_img.toFloat(), # Convert to 32-bit float to save storage space
                    description=f"AutoCache_RUSLE_{year}_{config_hash}",
                    assetId=asset_id,
                    region=aoi.bounds(),
                    scale=dynamic_scale,
                    maxPixels=1e13
                )
                task.start()
            except Exception as e:
                print(f"[!] Failed to start background caching task: {e}")
        # ------------------------

        res = {
            "aoi": aoi,
            "scale": dynamic_scale,
            "factor_images": factor_images,
            "risk_index": risk_index,
        }
        cached.set_result(res)
        return res
    except Exception as e:
        cached.set_exception(e)
        raise e
    finally:
        with _lock:
            if cache_key in _cache_build:
                del _cache_build[cache_key]

def compute_rusle_map(
    aoi_config: dict, year: int,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False
):
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]
    
    res = _build_rusle_images(aoi_config, year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    aoi = res["aoi"]
    factor_images = res["factor_images"]
    
    factor_maps = {k: dict(FACTOR_VIS[k]) for k in RECLASS_FACTOR_ORDER + ["A"]}
    
    def _get_urls(key, img):
        vis = FACTOR_VIS[key]
        vp = {"min": vis["min"], "max": vis["max"], "palette": vis["palette"]}
        smoothed = img.focal_mean(150, 'circle', 'meters')
        return {
            "tile_url": smoothed.getMapId(vp)["tile_fetcher"].url_format,
            "thumb_url": smoothed.getThumbURL({**vp, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        }
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        f_urls = {k: executor.submit(lambda k=k: _get_urls(k, factor_images[k])) for k in factor_maps.keys()}
        concurrent.futures.wait(f_urls.values())
        
    for k in factor_maps.keys():
        factor_maps[k].update(f_urls[k].result())
        
    result = {
        "tile_url": factor_maps["A"]["tile_url"],
        "thumb_url": factor_maps["A"]["thumb_url"],
        "factor_maps": factor_maps,
        "center": aoi.centroid().coordinates().getInfo()[::-1],
    }
    with _lock:
        _cache_map[cache_key] = result
    return result

def compute_rusle_stats(
    aoi_config: dict, year: int,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False
):
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]
            
    res = _build_rusle_images(aoi_config, year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    aoi = res["aoi"]
    scale = res["scale"]
    factor_images = res["factor_images"]
    
    all_factors_img = ee.Image.cat([
        factor_images["R"].rename("R"), factor_images["K"].rename("K"), 
        factor_images["LS"].rename("LS"), factor_images["C"].rename("C"), 
        factor_images["P"].rename("P"), factor_images["A"].rename("A")
    ])

    combined_reducer = (
        ee.Reducer.mean()
        .combine(ee.Reducer.min(), sharedInputs=True)
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.stdDev(), sharedInputs=True)
    )

    stats_raw = all_factors_img.reduceRegion(
        reducer=combined_reducer, geometry=aoi, scale=scale, maxPixels=1e10
    ).getInfo()

    result = {
        "stats": {
            "Mean (t/ha/yr)": round(stats_raw.get("A_mean") or 0, 2),
            "Min (t/ha/yr)": round(stats_raw.get("A_min") or 0, 2),
            "Max (t/ha/yr)": round(stats_raw.get("A_max") or 0, 2),
            "Std Dev (t/ha/yr)": round(stats_raw.get("A_stdDev") or 0, 2),
        },
        "factor_means": {
            "R — Rainfall Erosivity": round(stats_raw.get("R_mean") or 0, 1),
            "K — Soil Erodibility": round(stats_raw.get("K_mean") or 0, 4),
            "LS — Topographic Factor": round(stats_raw.get("LS_mean") or 0, 2),
            "C — Cover Management": round(stats_raw.get("C_mean") or 0, 3),
            "P — Support Practice": round(stats_raw.get("P_mean") or 0, 3),
        }
    }
    with _lock:
        _cache_stats[cache_key] = result
    return result

def compute_rusle_classify(
    aoi_config: dict, year: int, n_classes: int = 5,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False,
    method: str = "natural_breaks", custom_labels: list = None
):
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, n_classes, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p, method, tuple(custom_labels) if custom_labels else None)
    with _lock:
        if cache_key in _cache_classify:
            return _cache_classify[cache_key]
            
    res = _build_rusle_images(aoi_config, year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    aoi = res["aoi"]
    scale = res["scale"]
    A = res["factor_images"]["A"]
    
    if method == "fixed":
        # Keep old fixed method for backward compatibility
        fixed_class_thresholds = [
            ("Very Low (<10 t/ha/yr)", A.lt(10)),
            ("Low (10–30)", A.gte(10).And(A.lt(30))),
            ("Moderate (30–50)", A.gte(30).And(A.lt(50))),
            ("High (50–100)", A.gte(50).And(A.lt(100))),
            ("Very High (100–200)", A.gte(100).And(A.lt(200))),
            ("Extreme (>200)", A.gte(200)),
        ]
        labels = [lbl for lbl, _ in fixed_class_thresholds]
        area_img = ee.Image.cat([mask.multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, (_, mask) in enumerate(fixed_class_thresholds)])
        areas = area_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=scale, maxPixels=1e10).getInfo()
        
        cls = ee.Image(1)
        for i, (_, mask) in enumerate(fixed_class_thresholds):
            cls = cls.where(mask, i + 1)
        cls = cls.clip(aoi)
        
        vis = {"min": 1, "max": len(labels), "palette": _class_palette(len(labels))}
        smoothed = cls.focal_mode(150, 'circle', 'meters')
        
        result = {
            "panels": [{
                "name": "A",
                "tile_url": smoothed.getMapId(vis)["tile_fetcher"].url_format,
                "thumb_url": smoothed.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 512, "format": "png"}),
                "class_areas": {lbl: round((areas.get(f"c{i}") or 0)/1e6, 2) for i, lbl in enumerate(labels)}
            }]
        }
    else:
        labels = custom_labels or [f"Class {i+1}" for i in range(n_classes)]
        layers_to_classify = [
            {"name": "A", "image": A, "title": "Annual Soil Loss (A)", "palette": FACTOR_VIS["A"]["palette"]},
            {"name": "R", "image": res["factor_images"]["R"], "title": "Rainfall Erosivity (R)", "palette": FACTOR_VIS["R"]["palette"]},
            {"name": "K", "image": res["factor_images"]["K"], "title": "Soil Erodibility (K)", "palette": FACTOR_VIS["K"]["palette"]},
            {"name": "LS", "image": res["factor_images"]["LS"], "title": "Topographic Factor (LS)", "palette": FACTOR_VIS["LS"]["palette"]},
            {"name": "C", "image": res["factor_images"]["C"], "title": "Cover Management (C)", "palette": FACTOR_VIS["C"]["palette"]},
            {"name": "P", "image": res["factor_images"]["P"], "title": "Support Practice (P)", "palette": FACTOR_VIS["P"]["palette"]},
            {"name": "risk_index", "image": res["risk_index"], "title": "Risk Index"},
        ]
        result = quantile_classify(layers=layers_to_classify, aoi=aoi, scale=scale, n_classes=n_classes, custom_labels=labels, method=method)

    with _lock:
        _cache_classify[cache_key] = result
    return result

def compute_rusle_export(
    aoi_config: dict, year: int,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False
):
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    res = _build_rusle_images(aoi_config, year, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    aoi = res["aoi"]
    factor_images = res["factor_images"]
    risk_index = res["risk_index"]

    def get_dl_url(img):
        return img.getDownloadURL({"region": aoi.bounds(), "scale": 250, "format": "GEO_TIFF", "crs": "EPSG:4326"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as dl_executor:
        f_dls = {k: dl_executor.submit(lambda k=k: get_dl_url(factor_images[k])) for k in RECLASS_FACTOR_ORDER + ["A"]}
        f_risk = dl_executor.submit(lambda: get_dl_url(risk_index))
        concurrent.futures.wait(list(f_dls.values()) + [f_risk])
        
    result = {k: f_dls[k].result() for k in f_dls.keys()}
    result["risk_index"] = f_risk.result()

    with _lock:
        _cache_export[cache_key] = result
    return result
