import ee
import json

ee.Initialize()

poly = ee.Geometry.Polygon([[[-1, -1], [1, -1], [1, 1], [-1, 1]]])
diff = ee.Image(10).rename("DEM").clip(poly)

diff_with_coords = diff.addBands(ee.Image.pixelLonLat())
feat = diff_with_coords.reduceRegion(
    reducer=ee.Reducer.max(3).setOutputs(['depth', 'lon', 'lat']),
    geometry=poly,
    scale=30,
    maxPixels=1e9
).getInfo()

print("Result:")
print(json.dumps(feat, indent=2))
