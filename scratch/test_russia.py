import ee
import json
ee.Initialize(project='blac-436122')

def _clamp_to_mercator(geometry):
    safe_bounds = ee.Geometry.BBox(-180, -85, 180, 85)
    return geometry.intersection(safe_bounds, maxError=1000)

gaul = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", "Russian Federation"))
gaul_simple = gaul.map(lambda f: ee.Feature(f.geometry().simplify(maxError=5000)))
geom = ee.Geometry(gaul_simple.geometry())

print("Original bounds:", geom.bounds().getInfo())
clamped = _clamp_to_mercator(geom)
print("Clamped bounds:", clamped.bounds().getInfo())

bounds_info = clamped.bounds(maxError=1000).getInfo()
print("Bounds Info:", bounds_info)
