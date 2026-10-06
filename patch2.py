import json
import os

with open('backend/gee/drought.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update compute_drought signature and cache key
old_sig = '''def compute_drought(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    n_classes: int = 5, method: str = "equal_interval", custom_labels: list = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
) -> dict:
    cache_key = (
        "unified", json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes, method, tuple(custom_labels) if custom_labels else None,
        season, start_month, end_month, start_date, end_date,
        reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
    )'''
new_sig = '''def compute_drought(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    n_classes: int = 5, method: str = "equal_interval", custom_labels: list = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False,
    weights: dict = None
) -> dict:
    cache_key = (
        "unified", json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes, method, tuple(custom_labels) if custom_labels else None,
        season, start_month, end_month, start_date, end_date,
        reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi,
        json.dumps(weights, sort_keys=True) if weights else None
    )'''
code = code.replace(old_sig, new_sig)

# 2. Update _build_drought_images call
old_build_call = '''        aoi, geometry, dvi, vci, sm_current, rf_pci, lst_current, dry_periods, ndvi_current, season_info, water_mask = _build_drought_images(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date,
            reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
        )'''
new_build_call = '''        aoi, geometry, dvi, vci, sm_current, rf_pci, lst_current, dry_periods, ndvi_current, season_info, water_mask, evi_current, sm_norm, rf_norm, ndvi_norm, vci_norm, lst_norm, cdd_norm, evi_norm = _build_drought_images(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date,
            reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi, weights
        )'''
code = code.replace(old_build_call, new_build_call)

# 3. Add factor_maps logic inside the executor
old_executor = '''        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            f_stats = executor.submit('''
new_executor = '''        import concurrent.futures
        
        factor_images = {
            "sm": sm_current, "rf": rf_pci, "ndvi": ndvi_current, "vci": vci,
            "lst": lst_current, "cdd": dry_periods, "evi": evi_current
        }
        factor_norms = {
            "sm": sm_norm, "rf": rf_norm, "ndvi": ndvi_norm, "vci": vci_norm,
            "lst": lst_norm, "cdd": cdd_norm, "evi": evi_norm
        }
        
        def _get_factor_urls(key, img):
            vis = FACTOR_META[key]
            vp = {"min": vis["min"], "max": vis["max"], "palette": vis["palette"]}
            smoothed = img.focal_mean(150, 'circle', 'meters').updateMask(water_mask.Not()).clip(geometry)
            with gee_semaphore:
                return {
                    "tile_url": smoothed.getMapId(vp)["tile_fetcher"].url_format,
                    "thumb_url": smoothed.getThumbURL({**vp, "region": region, "dimensions": 512, "crs": "EPSG:4326", "format": "png"}),
                    "label": vis["label"],
                    "reversed": locals().get(f"reverse_{key}", False)
                }

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            f_factor_urls = {k: executor.submit(lambda k=k: _get_factor_urls(k, factor_images[k])) for k in factor_images.keys()}
            
            # Combine all normalized images to reduce in one go for factor means
            all_factors_norm_img = ee.Image.cat([factor_norms[k].rename(k) for k in factor_norms.keys()])
            f_factor_means = executor.submit(
                lambda: safe_get_info(all_factors_norm_img.reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=calc_geom, scale=get_dynamic_scale(geometry), maxPixels=1e10
                ))
            )
            
            f_stats = executor.submit('''
code = code.replace(old_executor, new_executor)

# 4. Add the missing semaphore and add factor results
old_result = '''        result = {
            "dvi_tile_url": dvi_map_id["tile_fetcher"].url_format,
            "dvi_download_url": dl_url,
            "dvi_thumb_url": thumb_url,
            "stats": {
                "Mean DVI": round(stats.get("DVI_mean") or 0, 3),
                "Min DVI": round(stats.get("DVI_min") or 0, 3),
                "Max DVI": round(stats.get("DVI_max") or 0, 3),
                "Std Dev": round(stats.get("DVI_stdDev") or 0, 3),
            },
            "classify": classify,
            "dvi_class_clean_thumb_url": classify["panels"][0].get("clean_thumb_url") if classify.get("panels") else None,'''

new_result = '''        factor_maps = {k: v.result() for k, v in f_factor_urls.items()}
        factor_means_raw = f_factor_means.result() or {}
        factor_means = {FACTOR_META[k]["label"]: round(factor_means_raw.get(k) or 0, 3) for k in factor_norms.keys()}
        
        result = {
            "dvi_tile_url": dvi_map_id["tile_fetcher"].url_format,
            "dvi_download_url": dl_url,
            "dvi_thumb_url": thumb_url,
            "factor_maps": factor_maps,
            "factor_means": factor_means,
            "weights_used": weights or DEFAULT_WEIGHTS,
            "stats": {
                "Mean DVI": round(stats.get("DVI_mean") or 0, 3),
                "Min DVI": round(stats.get("DVI_min") or 0, 3),
                "Max DVI": round(stats.get("DVI_max") or 0, 3),
                "Std Dev": round(stats.get("DVI_stdDev") or 0, 3),
            },
            "classify": classify,
            "dvi_class_clean_thumb_url": classify["panels"][0].get("clean_thumb_url") if classify.get("panels") else None,'''
code = code.replace(old_result, new_result)

# Insert semaphore at top
if 'gee_semaphore' not in code:
    code = code.replace('from threading import Lock', 'from threading import Lock\nimport threading\ngee_semaphore = threading.BoundedSemaphore(5)')

with open('backend/gee/drought.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patching phase 2 complete.")
