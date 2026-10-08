import json
import calendar
import ee
import hashlib
import logging
from gee.aoi_utils import get_dynamic_scale, safe_get_info, get_aoi_geometry, get_bounds_and_center
from gee.classify_utils import quantile_classify
import threading
import time
import random
from gee.auth import get_gee_status, rotate_credentials
from gee.persistent_cache import PersistentCache

logger = logging.getLogger(__name__)

gee_semaphore = threading.BoundedSemaphore(5)
_cache = PersistentCache(ttl=3600)
_cache_locks = {}
_cache_lock_lock = threading.Lock()

DROUGHT_PALETTE = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]
DROUGHT_VIS = {"min": 0, "max": 100, "palette": DROUGHT_PALETTE}


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 0 — Shared Utilities (used by ALL corridors)
# ═══════════════════════════════════════════════════════════════════════

def _get_key_lock(key):
    with _cache_lock_lock:
        if key not in _cache_locks:
            _cache_locks[key] = threading.Lock()
        return _cache_locks[key]

def _safe_gee_call(func, *args, **kwargs):
    retries = 5
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Too Many Requests" in err_str or "concurrency" in err_str.lower() or "quota" in err_str.lower():
                rotate_credentials()
                if i < retries - 1:
                    time.sleep((2 ** i) + random.uniform(0, 1))
                    continue
            raise

def _make_cache_key(*parts):
    normalized = []
    for p in parts:
        if isinstance(p, tuple):
            normalized.append(list(p))
        elif isinstance(p, dict):
            normalized.append(json.dumps(p, sort_keys=True))
        else:
            normalized.append(p)
    return json.dumps(normalized, sort_keys=True)


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 1 — AOI Classification (Determine which corridor to use)
# ═══════════════════════════════════════════════════════════════════════

# Rwanda-specific growing seasons
RWANDA_SEASONS = {
    "season_b": {"start_month": 3, "end_month": 6, "cross_year": False, "name": "Season B"},
    "season_a": {"start_month": 9, "end_month": 2, "cross_year": True, "name": "Season A"},
    "season_c": {"start_month": 7, "end_month": 8, "cross_year": False, "name": "Season C"},
    "annual": {"start_month": 1, "end_month": 12, "cross_year": False, "name": "Annual"},
}

# Generic seasons for Global / Custom
GENERIC_SEASONS = {
    "annual": {"start_month": 1, "end_month": 12, "cross_year": False, "name": "Annual"},
}

def _classify_aoi(aoi_config):
    """
    Classify the AOI into one of three corridors:
      - 'rwanda'  → Rwanda country or any Rwanda district/province
      - 'global'  → World-level analysis
      - 'custom'  → Any other country, custom polygon, uploaded shapefile
    Returns: corridor (str), is_global (bool)
    """
    aoi_type = aoi_config.get("type", "")
    country = (aoi_config.get("country") or "").strip()

    if aoi_type == "world":
        return "global", True

    if country.lower() == "rwanda" or aoi_type in ("rwanda", "district", "province"):
        return "rwanda", False

    # gaul0 = country-level, gaul1 = admin level 1, gaul2 = admin level 2
    # geojson = uploaded shapefile / custom polygon
    # All route through the 'custom' corridor with adaptive resolution
    return "custom", False


def resolve_season_dates(start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, corridor="rwanda"):
    """Resolve season parameters into concrete date strings.
    Rwanda corridor uses Rwanda-specific seasons; others use generic/custom."""

    # Explicit custom date range always takes priority
    if start_date and end_date:
        s_parts = [int(p) for p in start_date.split("-")]
        e_parts = [int(p) for p in end_date.split("-")]
        s_m, e_m = s_parts[1], e_parts[1]
        return start_date, end_date, s_m, e_m, f"Custom ({start_date} to {end_date})"

    # Select season dictionary based on corridor
    if corridor == "rwanda":
        seasons_dict = RWANDA_SEASONS
    else:
        seasons_dict = GENERIC_SEASONS

    season_key = (season or "annual").lower().strip()

    # If the selected season doesn't exist in this corridor, fall back
    if season_key not in seasons_dict:
        # Non-Rwanda corridors don't have season_a/b/c → fall back to annual
        if season_key in RWANDA_SEASONS and corridor != "rwanda":
            season_key = "annual"
        else:
            season_key = "annual"

    if season_key in seasons_dict:
        cfg = seasons_dict[season_key]
        s_m, e_m, cross = cfg["start_month"], cfg["end_month"], cfg["cross_year"]

        if cross:
            s_yr, e_yr = start_year - 1, end_year
        else:
            s_yr, e_yr = start_year, end_year

        last_day = calendar.monthrange(e_yr, e_m)[1]
        return f"{s_yr}-{s_m:02d}-01", f"{e_yr}-{e_m:02d}-{last_day:02d}", s_m, e_m, cfg["name"]

    # Custom month range
    if start_month and end_month:
        s_m, e_m = int(start_month), int(end_month)
        cross = s_m > e_m
        s_yr, e_yr = (start_year - 1, end_year) if cross else (start_year, end_year)
        last_day = calendar.monthrange(e_yr, e_m)[1]
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return f"{s_yr}-{s_m:02d}-01", f"{e_yr}-{e_m:02d}-{last_day:02d}", s_m, e_m, f"Custom ({month_names[s_m-1]} - {month_names[e_m-1]})"

    # Ultimate fallback
    return f"{start_year}-01-01", f"{end_year}-12-31", 1, 12, "Annual"


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 2 — Drought Type Builders (shared logic, corridor-aware)
# ═══════════════════════════════════════════════════════════════════════

def _build_comprehensive(aoi_config, season_start, season_end, season_label, weights, corridor=None, area_sqkm=None):
    """Comprehensive (DVI) drought — delegates to dvi.py"""
    from gee.dvi import build_dvi_image
    drought_img, layers, _ = build_dvi_image(aoi_config, season_start, season_end, weights, corridor=corridor, area_sqkm=area_sqkm)
    drought_img = ee.Image(1).subtract(drought_img).multiply(100).rename("Drought_Index")
    layers[0]["title"] = f"Drought Vulnerability Index ({season_label})"
    return drought_img, layers


def _build_meteorological(season_start, season_end, s_month, e_month, end_year, season_label, corridor, area_sqkm):
    """Meteorological drought — Precipitation Condition Index (PCI)"""
    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD").select("precipitation")

    duration = (e_month - s_month + 1) if s_month <= e_month else (12 - s_month + 1 + e_month)
    n_pentads = duration * 6

    # Corridor-aware baseline window
    if corridor == "global":
        baseline_start = max(1981, int(end_year) - 10)  # shorter for global
    elif corridor == "custom" and area_sqkm > 100000:
        baseline_start = max(1981, int(end_year) - 15)
    else:
        baseline_start = 1981  # Rwanda: full baseline

    baseline_col = chirps.filter(
        ee.Filter.calendarRange(s_month, e_month, 'month')
    ).filter(
        ee.Filter.calendarRange(baseline_start, int(end_year), 'year')
    )
    precip_min = baseline_col.reduce(ee.Reducer.percentile([5])).rename('precipitation').multiply(n_pentads)
    precip_max = baseline_col.reduce(ee.Reducer.percentile([95])).rename('precipitation').multiply(n_pentads)

    current_precip = chirps.filterDate(season_start, season_end).sum()

    precip_denom = precip_max.subtract(precip_min)
    pci = current_precip.subtract(precip_min).divide(
        precip_denom.where(precip_denom.abs().lt(0.01), 0.01)
    ).multiply(100).clamp(0, 100).rename("PCI")

    drought_img = pci.rename("Drought_Index")
    layers = [{"name": "PCI", "image": pci, "title": f"Precipitation Condition Index ({season_label})"}]
    return drought_img, layers


def _build_hydrological(season_start, season_end, s_month, e_month, end_year, season_label, corridor, area_sqkm):
    """Hydrological drought — Soil Moisture Condition Index (SMCI)"""
    era5 = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").select("volumetric_soil_water_layer_1")

    # Corridor-aware baseline window
    if corridor == "global":
        baseline_start = max(1981, int(end_year) - 10)
    elif corridor == "custom" and area_sqkm > 100000:
        baseline_start = max(1981, int(end_year) - 15)
    else:
        baseline_start = 1981

    baseline_col = era5.filter(
        ee.Filter.calendarRange(s_month, e_month, 'month')
    ).filter(
        ee.Filter.calendarRange(baseline_start, int(end_year), 'year')
    )
    sm_min = baseline_col.reduce(ee.Reducer.percentile([5])).rename('volumetric_soil_water_layer_1')
    sm_max = baseline_col.reduce(ee.Reducer.percentile([95])).rename('volumetric_soil_water_layer_1')

    current_sm = era5.filterDate(season_start, season_end).mean()

    sm_denom = sm_max.subtract(sm_min)
    smci = current_sm.subtract(sm_min).divide(
        sm_denom.where(sm_denom.abs().lt(0.01), 0.01)
    ).multiply(100).clamp(0, 100).rename("SMCI")

    drought_img = smci.rename("Drought_Index")
    layers = [{"name": "SMCI", "image": smci, "title": f"Soil Moisture Condition Index ({season_label})"}]
    return drought_img, layers


def _build_agricultural(season_start, season_end, season_label):
    """Agricultural drought — Water Requirement Satisfaction Index (WRSI)"""
    terraclimate = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE")

    aet = terraclimate.select("aet").filterDate(season_start, season_end).sum().multiply(0.1).rename("AET")
    pet = terraclimate.select("pet").filterDate(season_start, season_end).sum().multiply(0.1).rename("PET")

    pet_safe = pet.where(pet.eq(0), 0.0001)
    wrsi = aet.divide(pet_safe).multiply(100).clamp(0, 100).rename("WRSI")

    drought_img = wrsi.rename("Drought_Index")
    layers = [
        {"name": "WRSI", "image": wrsi, "title": f"Water Requirement Satisfaction Index ({season_label})"},
        {"name": "AET", "image": aet, "title": "Actual Evapotranspiration (AET)"},
        {"name": "PET", "image": pet, "title": "Potential Evapotranspiration (PET)"},
    ]
    return drought_img, layers


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 3 — Water Masking (corridor-aware)
# ═══════════════════════════════════════════════════════════════════════

def _build_water_mask(corridor):
    """Build water mask — lightweight for global, detailed for local."""
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")

    if corridor == "global":
        # Global: only permanent water bodies (GSW only, no land cover)
        return gsw.gte(50).unmask(0)
    else:
        # Rwanda + Custom: detailed mask using land cover
        lc = ee.ImageCollection("ESA/WorldCover/v200").first()
        return gsw.gte(50).unmask(0).Or(lc.eq(80)).Or(lc.eq(90))


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 4 — Main Builder (routes to corridor + drought type)
# ═══════════════════════════════════════════════════════════════════════

def _build_drought_image(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, drought_type="agricultural", weights=None):
    """
    Main entry point. Determines corridor, resolves dates, builds drought image.
    
    Corridors:
      - 'rwanda'  → Rwanda districts/provinces, uses Rwanda seasons, high-res capable
      - 'global'  → World-level, coarse resolution, simplified baselines
      - 'custom'  → Any other country/polygon, adaptive resolution
    """
    # ── Step 1: Classify AOI into corridor ──
    corridor, is_global = _classify_aoi(aoi_config)
    logger.info(f"[Drought] Corridor={corridor}, type={drought_type}, aoi_type={aoi_config.get('type')}")

    # ── Step 2: Get geometry (already simplified by get_aoi_geometry based on area) ──
    geometry = get_aoi_geometry(aoi_config)
    # Note: do NOT simplify again here — get_aoi_geometry already does area-based simplification

    # ── Step 3: Compute area once ──
    if is_global:
        area_sqkm = 999999999
    else:
        try:
            area_sqkm = geometry.bounds().area(maxError=1000).divide(1e6).getInfo()
        except Exception:
            area_sqkm = 999999999

    # ── Step 4: Resolve season dates (corridor-aware) ──
    season_start, season_end, s_month, e_month, season_label = resolve_season_dates(
        start_year, end_year, season, start_month, end_month, start_date, end_date,
        corridor=corridor
    )

    # ── Step 5: Check GEE asset cache ──
    # Cacheable: any stable, reproducible AOI type
    is_cacheable = aoi_config.get("type") in ["admin", "district", "province", "world", "rwanda", "gaul0", "gaul1", "gaul2"]
    asset_id = None
    config_hash = None

    if is_cacheable and not is_global:
        try:
            project_id = get_gee_status()["project_id"]
        except Exception:
            project_id = "unknown"
        config_dict = {
            "aoi": aoi_config, "sy": start_year, "ey": end_year,
            "sz": season, "sm": start_month, "em": end_month,
            "sd": start_date, "ed": end_date, "dt": drought_type,
            "w": weights
        }
        config_hash = hashlib.md5(json.dumps(config_dict, sort_keys=True).encode()).hexdigest()[:10]
        asset_id = f"projects/{project_id}/assets/AutoCache_Drought_{corridor}_{start_year}_{end_year}_{config_hash}"

        try:
            ee.data.getAsset(asset_id)
            logger.info(f"[+] CACHE HIT: Loading {asset_id}")
            cached_img = ee.Image(asset_id)
            drought_img = cached_img.select("Drought_Index")
            layers = [{"name": "Drought Index", "image": drought_img, "title": f"Drought Index ({season_label})"}]
            water_mask = cached_img.select("water_mask")
            return drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor
        except Exception:
            pass

    # ── Step 6: Build drought image by type ──
    if drought_type == "comprehensive":
        drought_img, layers = _build_comprehensive(aoi_config, season_start, season_end, season_label, weights, corridor=corridor, area_sqkm=area_sqkm)

    elif drought_type == "meteorological":
        drought_img, layers = _build_meteorological(
            season_start, season_end, s_month, e_month, end_year, season_label, corridor, area_sqkm
        )

    elif drought_type == "hydrological":
        drought_img, layers = _build_hydrological(
            season_start, season_end, s_month, e_month, end_year, season_label, corridor, area_sqkm
        )

    else:  # agricultural
        drought_img, layers = _build_agricultural(season_start, season_end, season_label)

    # ── Step 7: Water masking (corridor-aware) ──
    water_mask = _build_water_mask(corridor)
    drought_img = drought_img.updateMask(water_mask.Not()).clamp(0, 100).rename("Drought_Index")

    # ── Step 8: Clip for non-global ──
    if not is_global:
        drought_img = drought_img.clip(geometry)
        for layer in layers:
            layer["image"] = layer["image"].clip(geometry)

    # ── Step 9: Background asset cache (non-global only) ──
    if is_cacheable and asset_id and not is_global:
        try:
            logger.info(f"[*] CACHE MISS: Triggering background export for {asset_id}")
            export_img = ee.Image.cat([drought_img] + [l["image"] for l in layers] + [water_mask.rename("water_mask")])
            scale = get_dynamic_scale(geometry, aoi_config) or 1000
            task = ee.batch.Export.image.toAsset(
                image=export_img.toFloat(),
                description=f"AutoCache_Drought_{corridor}_{start_year}_{end_year}_{config_hash}",
                assetId=asset_id,
                region=geometry.bounds(),
                scale=scale,
                maxPixels=1e13
            )
            task.start()
        except Exception as e:
            logger.warning(f"[!] Background caching failed: {e}")

    return drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 5 — Shared Build Cache (prevents 4× rebuilds)
# ═══════════════════════════════════════════════════════════════════════

_build_cache = {}
_build_cache_lock = threading.Lock()

def _get_shared_build(aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights):
    """Return cached build result. Prevents 4 redundant _build_drought_image calls."""
    key = _make_cache_key(
        "build", aoi_config, start_year, end_year, season, start_month, end_month,
        start_date, end_date, drought_type, weights
    )
    with _build_cache_lock:
        if key in _build_cache:
            return _build_cache[key]

    result = _build_drought_image(aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights)

    with _build_cache_lock:
        _build_cache[key] = result
        if len(_build_cache) > 8:
            oldest_key = next(iter(_build_cache))
            del _build_cache[oldest_key]

    return result


# ═══════════════════════════════════════════════════════════════════════
#  SECTION 6 — Public API Functions (map, stats, classify, export)
# ═══════════════════════════════════════════════════════════════════════

def compute_drought_map(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, drought_type="agricultural", weights=None):
    cache_key = _make_cache_key("map", aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor = _get_shared_build(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights
        )

        # Corridor-aware smoothing
        if corridor == "global":
            # Skip expensive smoothing for global to prevent User Memory Limit
            smoothed = drought_img.updateMask(water_mask.Not())
        elif corridor == "custom" and area_sqkm > 50000:
            # Skip or reduce smoothing for massive custom areas
            smoothed = drought_img.updateMask(water_mask.Not())
        elif corridor == "rwanda" and area_sqkm > 20000:
            smoothed = drought_img.focal_mean(500, 'circle', 'meters').updateMask(water_mask.Not())
        else:
            smoothed = drought_img

        if not is_global:
            smoothed = smoothed.clip(geometry)

        with gee_semaphore:
            map_id = _safe_gee_call(lambda: smoothed.getMapId(DROUGHT_VIS))

        try:
            bounds, center = _safe_gee_call(lambda: get_bounds_and_center(geometry))
        except Exception:
            bounds = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
            center = [0, 0]

        res = {
            "tile_url": map_id["tile_fetcher"].url_format,
            "season_label": season_label,
            "bbox": bounds,
            "center": center,
            "corridor": corridor,
        }
        _cache[cache_key] = res
        return res


def compute_drought_stats(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, drought_type="agricultural", weights=None):
    cache_key = _make_cache_key("stats", aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor = _get_shared_build(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights
        )

        calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else geometry.bounds(maxError=1000)

        # Corridor-aware scale
        if corridor == "global":
            scale = 100000
        elif corridor == "custom" and area_sqkm > 100000:
            scale = max(1000, get_dynamic_scale(geometry, aoi_config))
        else:
            scale = get_dynamic_scale(geometry, aoi_config)

        with gee_semaphore:
            stats = _safe_gee_call(lambda: safe_get_info(drought_img.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
                geometry=calc_geom, scale=scale, maxPixels=1e13, tileScale=16, bestEffort=True
            )))

        res = {
            "Mean Index": round(stats.get("Drought_Index_mean", 0) or 0, 1),
            "Min Index": round(stats.get("Drought_Index_min", 0) or 0, 1),
            "Max Index": round(stats.get("Drought_Index_max", 0) or 0, 1),
        }
        _cache[cache_key] = res
        return res


def compute_drought_classify(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, n_classes=5, method="natural_breaks", custom_labels=None, drought_type="agricultural", weights=None):
    cache_key = _make_cache_key("classify", aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, n_classes, method, custom_labels, drought_type, weights)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor = _get_shared_build(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights
        )

        default_labels = ["Extreme Drought", "Severe Drought", "Moderate Drought", "Mild Drought", "No Drought"]
        labels = custom_labels if custom_labels and len(custom_labels) == n_classes else default_labels[:n_classes]

        # Corridor-aware scale
        if corridor == "global":
            scale = 100000
        elif corridor == "custom" and area_sqkm > 100000:
            scale = max(1000, get_dynamic_scale(geometry, aoi_config))
        else:
            scale = get_dynamic_scale(geometry, aoi_config)

        with gee_semaphore:
            res = _safe_gee_call(lambda: quantile_classify(
                layers=layers,
                aoi=geometry, scale=scale, n_classes=n_classes,
                method=method, custom_labels=labels,
                water_mask=water_mask, custom_palette=DROUGHT_PALETTE
            ))
        _cache[cache_key] = res
        return res


def compute_drought_export(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, drought_type="agricultural", weights=None, custom_palettes=None):
    if custom_palettes is None: custom_palettes = {}
    cache_key = _make_cache_key("export", aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights, custom_palettes)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        drought_img, layers, water_mask, geometry, is_global, season_label, area_sqkm, corridor = _get_shared_build(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date, drought_type, weights
        )

        # Corridor-aware smoothing
        if corridor == "global":
            smoothed = drought_img.updateMask(water_mask.Not())
        elif corridor == "custom" and area_sqkm > 50000:
            smoothed = drought_img.updateMask(water_mask.Not())
        elif corridor == "rwanda" and area_sqkm > 20000:
            smoothed = drought_img.focal_mean(500, 'circle', 'meters').updateMask(water_mask.Not())
        else:
            smoothed = drought_img
        if not is_global: smoothed = smoothed.clip(geometry)

        factor_maps = {}
        import concurrent.futures

        calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else geometry.bounds(maxError=1000)

        MAX_VAL_LOOKUP = {
            "WRSI": 100, "AET": 600, "PET": 800,
            "PCI": 100, "SMCI": 100, "VHI": 100, "VCI": 100, "TCI": 100,
            "Drought_Map": 100, "Drought Index": 100,
            "SM": 1, "RF": 1, "NDVI": 1, "LST": 1, "CDD": 1, "EVI": 1, "DVI": 1,
        }

        def fetch_urls(l):
            k = l["name"]
            img = l["image"]
            palette = custom_palettes.get(k, DROUGHT_PALETTE)
            max_val = MAX_VAL_LOOKUP.get(k, 100)
            vis = {"min": 0, "max": max_val, "palette": palette, "region": calc_geom, "dimensions": 800, "crs": "EPSG:4326", "format": "png"}

            with gee_semaphore:
                try:
                    thumb = img.getThumbURL(vis)
                except Exception as e:
                    thumb = None
                    logger.warning(f"[{k}] Thumb error: {e}")
                try:
                    dl_scale = 100000 if corridor == "global" else get_dynamic_scale(geometry, aoi_config)
                    dl = img.getDownloadURL({"region": calc_geom, "scale": dl_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"})
                except Exception as e:
                    dl = None
                    logger.warning(f"[{k}] DL error: {e}")
                return k, {"thumb_url": thumb, "download_url": dl}

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            main_layer = {"name": "Drought_Map", "image": smoothed}
            all_layers = [main_layer] + layers
            futures_factors = [executor.submit(fetch_urls, l) for l in all_layers]

            for f in concurrent.futures.as_completed(futures_factors):
                k, urls = f.result()
                factor_maps[k] = urls

        try:
            drought_thumb_url = factor_maps.get("Drought_Map", {}).get("thumb_url")
            drought_download_url = factor_maps.get("Drought_Map", {}).get("download_url")
        except Exception:
            drought_thumb_url = None
            drought_download_url = None

        result = {
            "drought_thumb_url": drought_thumb_url,
            "drought_download_url": drought_download_url,
            "factor_maps": factor_maps,
        }
        _cache[cache_key] = result
        return result
