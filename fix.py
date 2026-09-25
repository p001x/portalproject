import re

path = 'c:/Users/user/Documents/blacportal/backend/gee/change_detection.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# Update signature
code = re.sub(
    r'threshold: float = None,(\s*)\) -> dict:',
    r'threshold: float = None,\n    n_classes: int = 5,\n    method: str = "threshold",\n    custom_labels: list = None,\n) -> dict:',
    code
)

# Add import for quantile_classify at the top of the function
if "from gee.classify_utils import quantile_classify" not in code:
    code = re.sub(
        r'from gee.aoi_utils import get_aoi_geometry',
        r'from gee.aoi_utils import get_aoi_geometry\n    from gee.classify_utils import quantile_classify',
        code
    )

# Update cache_key
code = re.sub(
    r'threshold,(\s*)\)',
    r'threshold,\n        n_classes,\n        method,\n        tuple(custom_labels) if custom_labels else None,\n    )',
    code
)

# Update compute block
old_block = """    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        f_stats = executor.submit(
            lambda: diff.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi,
                scale=dynamic_scale,
                maxPixels=1e10,
                tileScale=4,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4
            ).getInfo()
        )"""

new_block = """    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        f_stats = executor.submit(
            lambda: diff.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi,
                scale=dynamic_scale,
                maxPixels=1e10,
                tileScale=4,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4
            ).getInfo() if method == "threshold" else {}
        )
        
        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[{"name": "Change", "image": diff, "title": f"{idx_upper} Change Index"}],
                aoi=aoi,
                scale=dynamic_scale,
                n_classes=n_classes,
                method=method,
                custom_labels=custom_labels,
                custom_palette=class_colors if n_classes == 5 else None,
            ) if method != "threshold" else {}
        )"""

code = code.replace(old_block, new_block)

# Update the results gathering
old_try_area = """        try:
            area_dict = f_area.result()
        except Exception:
            area_dict = {}"""
new_try_area = """        try:
            area_dict = f_area.result()
        except Exception:
            area_dict = {}
            
        try:
            classify_res = f_classify.result()
        except Exception:
            classify_res = {}"""
code = code.replace(old_try_area, new_try_area)

# Update class_areas assignment
old_class_areas = """    class_areas = {
        lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(labels)
    }"""
new_class_areas = """    if method == "threshold":
        class_areas = {
            lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
            for i, lbl in enumerate(labels)
        }
    else:
        # Use dynamic classify results
        class_areas = classify_res.get("panels", [{}])[0].get("areas", {})
        labels = list(class_areas.keys())
        class_colors = classify_res.get("panels", [{}])[0].get("palette", class_colors)"""
code = code.replace(old_class_areas, new_class_areas)

# Update net_change assignment
old_net_change = """    # Net change calculation
    area_vals = list(class_areas.values())
    # Index 0 & 1 are loss/decrease, Index 2 is stable, Index 3 & 4 are gain/increase
    loss_km2 = round((area_vals[0] + area_vals[1]) if len(area_vals) >= 2 else 0, 2)
    stable_km2 = round(area_vals[2] if len(area_vals) >= 3 else 0, 2)
    gain_km2 = round((area_vals[3] + area_vals[4]) if len(area_vals) >= 5 else 0, 2)
    net_km2 = round(gain_km2 - loss_km2, 2)
    total_km2 = loss_km2 + stable_km2 + gain_km2
    pct_changed = round(((loss_km2 + gain_km2) / total_km2 * 100) if total_km2 > 0 else 0, 1)

    net_change = {
        "loss_km2": loss_km2,
        "stable_km2": stable_km2,
        "gain_km2": gain_km2,
        "net_km2": net_km2,
        "pct_changed": pct_changed,
        "total_analyzed_km2": round(total_km2, 2),
    }"""
new_net_change = """    # Net change calculation
    area_vals = list(class_areas.values())
    if method == "threshold":
        # Index 0 & 1 are loss/decrease, Index 2 is stable, Index 3 & 4 are gain/increase
        loss_km2 = round((area_vals[0] + area_vals[1]) if len(area_vals) >= 2 else 0, 2)
        stable_km2 = round(area_vals[2] if len(area_vals) >= 3 else 0, 2)
        gain_km2 = round((area_vals[3] + area_vals[4]) if len(area_vals) >= 5 else 0, 2)
    else:
        # Generic approach for dynamic classes: assume lower half is loss, middle is stable, upper half is gain
        mid = len(area_vals) // 2
        loss_km2 = round(sum(area_vals[:mid]), 2)
        stable_km2 = round(area_vals[mid], 2) if len(area_vals) % 2 != 0 else 0
        gain_km2 = round(sum(area_vals[mid+1 if len(area_vals) % 2 != 0 else mid:]), 2)
        
    net_km2 = round(gain_km2 - loss_km2, 2)
    total_km2 = loss_km2 + stable_km2 + gain_km2
    pct_changed = round(((loss_km2 + gain_km2) / total_km2 * 100) if total_km2 > 0 else 0, 1)

    net_change = {
        "loss_km2": loss_km2,
        "stable_km2": stable_km2,
        "gain_km2": gain_km2,
        "net_km2": net_km2,
        "pct_changed": pct_changed,
        "total_analyzed_km2": round(total_km2, 2),
    }"""
code = code.replace(old_net_change, new_net_change)

# Add classify and method to result
code = re.sub(
    r'"class_areas_km2": class_areas,\n(\s*)"class_colors": class_colors,',
    r'"class_areas_km2": class_areas,\n\1"class_colors": class_colors,\n\1"classify": classify_res if method != "threshold" else None,\n\1"method": method,\n\1"n_classes": n_classes,',
    code
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)
print("Updated change_detection.py successfully!")
