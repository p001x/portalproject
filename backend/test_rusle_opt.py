import ee
import time
import concurrent.futures

# Initialize GEE
from gee.auth import initialize_gee
initialize_gee()

def test_rusle_optimization():
    aoi = ee.Geometry.Rectangle([29.5, -2.5, 30.0, -2.0]) # Example bbox for Rwanda
    start = "2023-01-01"
    end = "2023-12-31"

    # Minimal RUSLE setup
    chirps_annual = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start, end).filterBounds(aoi).sum().clip(aoi)
    R = chirps_annual.multiply(0.35).add(38.5).rename("R")
    K = ee.Image(0.04).rename("K") # mock
    LS = ee.Image(1.5).rename("LS") # mock
    C = ee.Image(0.2).rename("C") # mock
    P = ee.Image(0.5).rename("P") # mock
    A = R.multiply(K).multiply(LS).multiply(C).multiply(P).rename("A")

    all_factors_img = ee.Image.cat([R, K, LS, C, P, A])
    percentile_steps = [20, 40, 60, 80]

    print("Running optimized Step 1...")
    t0 = time.time()
    
    # Combined reducer for mean, min, max, stdDev, AND percentiles
    full_reducer = (
        ee.Reducer.mean()
        .combine(ee.Reducer.min(), sharedInputs=True)
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.stdDev(), sharedInputs=True)
        .combine(ee.Reducer.percentile(percentile_steps), sharedInputs=True)
    )
    
    # 1 single call!
    stats_dict = all_factors_img.reduceRegion(
        reducer=full_reducer,
        geometry=aoi,
        scale=250,
        maxPixels=1e6,
        bestEffort=True,
        tileScale=4
    ).getInfo()
    
    t1 = time.time()
    print(f"Step 1 completed in {t1-t0:.2f} seconds")
    print(list(stats_dict.keys())[:10]) # print some keys to verify

    # Step 2: Risk areas
    # mock risk index and areas
    risk_index = all_factors_img.reduce(ee.Reducer.mean()).rename("RiskIndex")
    fixed_area_img = ee.Image.pixelArea().rename("c0")
    risk_area_img = ee.Image.pixelArea().rename("r0")
    a_class_area_img = ee.Image.pixelArea().rename("a0")

    print("Running optimized Step 2...")
    t2 = time.time()
    
    all_areas_img = ee.Image.cat([fixed_area_img, risk_area_img, a_class_area_img])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_areas = executor.submit(
            lambda: all_areas_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=250, maxPixels=1e6, bestEffort=True, tileScale=4).getInfo()
        )
        f_risk_stats = executor.submit(
            lambda: risk_index.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi, scale=250, maxPixels=1e6, bestEffort=True, tileScale=4,
            ).getInfo()
        )
        
        areas_dict = f_areas.result()
        risk_stats_dict = f_risk_stats.result()
        
    t3 = time.time()
    print(f"Step 2 completed in {t3-t2:.2f} seconds")
    print("Optimization successful!")

if __name__ == "__main__":
    test_rusle_optimization()
