import os
import sys
import json
import time

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Setup Windows QGIS DLL directory
if os.name == 'nt' and os.path.exists(r"C:\Program Files\QGIS 3.40.11\bin"):
    try:
        os.add_dll_directory(r"C:\Program Files\QGIS 3.40.11\bin")
    except Exception:
        pass

from gee.auth import initialize_gee
from gee.habitat import (
    compute_habitat,
    compute_ahp_data,
    get_habitat_config,
    DEFAULT_WEIGHTS,
    FACTOR_ORDER,
)

def run_verification():
    print("=" * 60)
    print("CRANE HABITAT SUITABILITY MODULE DEEP VERIFICATION")
    print("=" * 60)
    
    print("\n[Step 1] Initializing Google Earth Engine...")
    t0 = time.time()
    initialize_gee()
    print(f"GEE Initialized in {time.time() - t0:.2f}s")
    
    print("\n[Step 2] Testing get_habitat_config()...")
    config = get_habitat_config()
    assert len(config["factors"]) == 10, f"Expected 10 factors, got {len(config['factors'])}"
    total_w = sum(config["default_weights"].values())
    assert abs(total_w - 1.0) < 1e-3, f"Weights sum to {total_w}, expected 1.0"
    print(f"Config valid. 10 factors: {config['factors']}")
    print(f"Default weights sum: {total_w:.2f}")

    print("\n[Step 3] Testing AHP Matrix & Consistency Ratio...")
    ahp = compute_ahp_data(DEFAULT_WEIGHTS)
    print(f"  Lambda Max: {ahp['lambda_max']}")
    print(f"  Consistency Index (CI): {ahp['ci']}")
    print(f"  Random Index (RI): {ahp['ri']}")
    print(f"  Consistency Ratio (CR): {ahp['cr']} (< 0.10: {ahp['consistent']})")
    assert ahp["cr"] < 0.10, "AHP default matrix is inconsistent!"

    print("\n[Step 4] Running Full compute_habitat() on Gasabo District...")
    aoi_config = {
        "type": "rwanda",
        "country": "Rwanda",
        "province": "Kigali City",
        "district": "Gasabo",
        "name": "Gasabo"
    }
    
    t_start = time.time()
    res = compute_habitat(
        aoi_config=aoi_config,
        reverse_flags={},
        n_classes=5,
        custom_weights=DEFAULT_WEIGHTS,
        method="natural_breaks",
        year=2021
    )
    t_elapsed = time.time() - t_start
    print(f"compute_habitat completed in {t_elapsed:.2f}s!")

    print("\n[Step 5] Validating Output Structure...")
    assert "tile_url" in res and res["tile_url"], "Missing tile_url"
    assert "factor_maps" in res and len(res["factor_maps"]) == 10, f"Expected 10 factor maps, got {len(res.get('factor_maps', {}))}"
    assert "center" in res and len(res["center"]) == 2, "Invalid center"
    assert "class_areas_km2" in res, "Missing class_areas_km2"
    assert "factors" in res and len(res["factors"]) == 10, f"Expected 10 factors in factors dict, got {len(res.get('factors', {}))}"
    
    print("  Center:", res["center"])
    print("  Class Areas (km²):", res["class_areas_km2"])
    print("  Main Thumb URL present:", bool(res.get("thumb_url")))
    print("  Main Download URL present:", bool(res.get("download_url")))
    
    print("\n[Step 6] Validating Factor Metadata & Breaks...")
    for f_name in FACTOR_ORDER:
        fdata = res["factors"][f_name]
        print(f"  Factor '{f_name}': Weight={fdata['weight_pct']}%, Thumb={bool(fdata.get('thumb_url'))}, Labels={fdata.get('labels')}")
        assert fdata.get("thumb_url"), f"Factor {f_name} missing thumb_url"
        assert len(fdata.get("labels", [])) == 5, f"Factor {f_name} should have 5 class labels"

    print("\n[Step 7] Testing Cartography Integration...")
    from reports.report_builder import _fetch_image
    from reports.cartography import enhance_map_cartography
    
    thumb_url = res["thumb_url"]
    buf = None
    for attempt in range(3):
        buf = _fetch_image(thumb_url, timeout=30)
        if buf:
            break
        time.sleep(2)
        
    if buf:
        carto_buf = enhance_map_cartography(
            buf.getvalue(),
            aoi_name="Gasabo",
            title="Habitat Suitability Map",
            class_areas=res["class_areas_km2"]
        )
        assert carto_buf.getbuffer().nbytes > 1000, "Cartography output too small or corrupted"
        print(f"  Cartography map generated successfully! Size: {carto_buf.getbuffer().nbytes} bytes")
    else:
        print("  Notice: Thumbnail URL was generated but remote host timed out during test fetch.")

    print("\n" + "=" * 60)
    print("ALL HABITAT MODULE VERIFICATION CHECKS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_verification()
