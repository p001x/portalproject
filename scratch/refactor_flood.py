import os
import re

filepath = r"c:\Users\user\Documents\blacportal\backend\gee\flood.py"

with open(filepath, "r") as f:
    content = f.read()

# 1. Add FLOOD_CLASS_NAMES and _cache_build
content = content.replace(
    "_cache: TTLCache = TTLCache(maxsize=128, ttl=86400)\n_lock = Lock()",
    "_cache: TTLCache = TTLCache(maxsize=128, ttl=86400)\n_cache_build: TTLCache = TTLCache(maxsize=64, ttl=3600)\n_lock = Lock()\n\nFLOOD_CLASS_NAMES = [\"LOW\", \"MODERATE\", \"MEDIUM\", \"HIGH\", \"VERY HIGH\"]"
)

# 2. Add Future cache mechanism
cache_logic = """    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes,
        frozenset(weights.items()), frozenset(reverse_flags.items())
    )
    is_first = False
    with _lock:
        if cache_key in _cache_build:
            cached = _cache_build[cache_key]
        elif cache_key in _cache:
            return _cache[cache_key]
        else:
            cached = concurrent.futures.Future()
            _cache_build[cache_key] = cached
            is_first = True

    if not is_first:
        try:
            return cached.result()
        except Exception:
            pass # Fallthrough to recalculate if the previous attempt failed

    try:
        from gee.aoi_utils import get_aoi_geometry"""

content = content.replace(
    """    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes,
        frozenset(weights.items()), frozenset(reverse_flags.items())
    )
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry""",
    cache_logic
)

# Replace the end to resolve Future
end_logic = """    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": final_thumb_url,
        "download_url": suitability.getDownloadURL({"scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"}),
        "stats": stats,
        "class_areas_km2": class_areas_km2,
        "factor_maps": factor_maps,
        "reverse_flags": reverse_flags,
        "ahp": ahp_data,
        "classify": classify,
        "center": center,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "start_year": start_year,
        "end_year": end_year,
    }

    with _lock:
        _cache[cache_key] = result
        if cache_key in _cache_build:
            _cache_build[cache_key].set_result(result)
            del _cache_build[cache_key]

    return result

    except Exception as e:
        with _lock:
            if cache_key in _cache_build:
                _cache_build[cache_key].set_exception(e)
                del _cache_build[cache_key]
        raise e
"""
content = re.sub(
    r"    result = \{.*?return result",
    end_logic,
    content,
    flags=re.DOTALL
)

# Indent the body of the try block
try_idx = content.find("    try:\n        from gee.aoi_utils")
if try_idx != -1:
    before = content[:try_idx]
    after = content[try_idx:]
    lines = after.split("\n")
    # indent lines from 1 to the end except the except block
    for i in range(1, len(lines)):
        if lines[i].startswith("    except Exception as e:"):
            break
        if lines[i] != "":
            lines[i] = "    " + lines[i]
    content = before + "\n".join(lines)

# 3. Update classes dictionary
classes_logic = """        classes = {
            FLOOD_CLASS_NAMES[0]: suitability.lt(2),
            FLOOD_CLASS_NAMES[1]: suitability.gte(2).And(suitability.lt(3)),
            FLOOD_CLASS_NAMES[2]: suitability.gte(3).And(suitability.lt(4)),
            FLOOD_CLASS_NAMES[3]: suitability.gte(4).And(suitability.lt(4.5)),
            FLOOD_CLASS_NAMES[4]: suitability.gte(4.5),
        }"""
content = re.sub(r"        classes = \{.*?\}", classes_logic, content, flags=re.DOTALL)

# 4. Update layers_to_classify
layers_logic = """        layers_to_classify = [{"name": "suitability", "image": suitability, "title": "Flood Susceptibility Index"}]
        for key in FACTOR_ORDER:
            layers_to_classify.append({"name": f"{key}_score", "image": score_images[key], "title": FACTOR_META[key]["label"]})"""
content = content.replace("        layers_to_classify = [{\"name\": \"suitability\", \"image\": suitability, \"title\": \"Flood Susceptibility Index\"}]", layers_logic)

# 5. Fix locals and update quantile_classify call
content = content.replace("locals().get('aoi', locals().get('geometry', locals().get('aoi_geom')))", "aoi")
content = content.replace("quantile_classify(layers=layers_to_classify, aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes)", "quantile_classify(layers=layers_to_classify, aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes, custom_labels=FLOOD_CLASS_NAMES)")

# 6. Update factor_maps loop to use ThreadPoolExecutor
factor_logic = """        def fetch_factor_urls(key):
            return key, _factor_urls(score_images[key], key, aoi)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor_factors:
            factor_url_results = dict(executor_factors.map(fetch_factor_urls, FACTOR_ORDER))

        factor_maps = {}
        for key in FACTOR_ORDER:
            urls = factor_url_results[key]
            class_urls = next((p for p in classify["panels"] if p["name"] == f"{key}_score"), None)
            factor_maps[key] = {
                "label": FACTOR_META[key]["label"],
                "tile_url": urls["tile_url"],
                "thumb_url": urls["thumb_url"],
                "download_url": urls.get("download_url"),
                "class_tile_url": class_urls["tile_url"] if class_urls else None,
                "class_thumb_url": class_urls["thumb_url"] if class_urls else None,
                "class_download_url": class_urls["download_url"] if class_urls and "download_url" in class_urls else None,
                "reversed": reverse_flags.get(key, False),
            }"""

old_factor_logic = """        factor_maps = {}
        for key in FACTOR_ORDER:
            urls = _factor_urls(score_images[key], key, aoi)
            class_urls = next((p for p in classify["panels"] if p["name"] == f"{key}_score"), None)
            factor_maps[key] = {
                "label": FACTOR_META[key]["label"],
                "tile_url": urls["tile_url"],
                "thumb_url": urls["thumb_url"],
                "download_url": urls.get("download_url"),
                "class_tile_url": class_urls["tile_url"] if class_urls else None,
                "class_thumb_url": class_urls["thumb_url"] if class_urls else None,
                "class_download_url": class_urls["download_url"] if class_urls and "download_url" in class_urls else None,
                "reversed": reverse_flags.get(key, False),
            }"""
content = content.replace(old_factor_logic, factor_logic)

# 7. Update class_score_map
score_map_logic = """        class_score_map = {
            FLOOD_CLASS_NAMES[0]: 1.5,
            FLOOD_CLASS_NAMES[1]: 2.5,
            FLOOD_CLASS_NAMES[2]: 3.5,
            FLOOD_CLASS_NAMES[3]: 4.25,
            FLOOD_CLASS_NAMES[4]: 4.75,
        }"""
content = re.sub(r"        class_score_map = \{.*?\}", score_map_logic, content, flags=re.DOTALL)

with open(filepath, "w") as f:
    f.write(content)

print("Refactored flood.py successfully!")
