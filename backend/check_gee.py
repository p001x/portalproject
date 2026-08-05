import ee
import traceback
ee.Initialize(project='ee-antigravity') # or whatever is in main.py, let's just do ee.Initialize()

try:
    fc = ee.FeatureCollection("FAO/GAUL/2015/level2")
    rwa = fc.filter(ee.Filter.eq("ADM0_NAME", "Rwanda"))
    print("GAUL Level 2 features:", rwa.size().getInfo())
except Exception as e:
    print("GAUL L2 error:", e)

try:
    fc = ee.FeatureCollection("FAO/GAUL/2015/level3")
    rwa = fc.filter(ee.Filter.eq("ADM0_NAME", "Rwanda"))
    print("GAUL Level 3 features:", rwa.size().getInfo())
except Exception as e:
    print("GAUL L3 error:", e)

# Maybe another dataset? Let's check UNICEF or other boundaries
