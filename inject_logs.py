import re

path = r"c:\Users\user\Documents\blacportal\backend\gee\wellscope.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add logging statements
content = content.replace(
    'aoi = get_aoi_geometry(aoi_config)',
    'import time; t_start = time.time(); print("[WellScope] Getting geometry..."); aoi = get_aoi_geometry(aoi_config); print(f"[WellScope] Geometry got: {time.time()-t_start:.2f}s");'
)
content = content.replace(
    'dynamic_scale = get_dynamic_scale(aoi)',
    't_scale = time.time(); print("[WellScope] Getting dynamic scale..."); dynamic_scale = get_dynamic_scale(aoi); print(f"[WellScope] Scale {dynamic_scale} got: {time.time()-t_scale:.2f}s");'
)
content = content.replace(
    'hist_raw = continuous_bands.reduceRegion(',
    't_hist = time.time(); print("[WellScope] Getting histogram..."); hist_raw = continuous_bands.reduceRegion('
)
content = content.replace(
    ').getInfo()',
    ').getInfo(); print(f"[WellScope] Histogram got: {time.time()-t_hist:.2f}s");'
)
content = content.replace(
    'thumb_url = suitability_100.getThumbURL',
    't_thumb = time.time(); print("[WellScope] Getting ThumbURL..."); thumb_url = suitability_100.getThumbURL'
)
content = content.replace(
    'thumb_url = None',
    'print(f"[WellScope] ThumbURL failed: {time.time()-t_thumb:.2f}s"); thumb_url = None'
)
# Note: we should just replace "res = (aoi" to print time
content = content.replace(
    'res = (aoi, dynamic_scale, weights, score_images, suitability_100)',
    'print(f"[WellScope] Base build complete: {time.time()-t_start:.2f}s"); res = (aoi, dynamic_scale, weights, score_images, suitability_100)'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Injected logging into wellscope.py!")
