import ee
import json
import os
from gee.earthwork import analyze_earthwork

# Initialize
try:
    ee.Initialize(project='ee-blac')
except Exception as e:
    ee.Initialize()

polygon_coords = [
    [30.05, -1.94],
    [30.06, -1.94],
    [30.06, -1.95],
    [30.05, -1.95],
    [30.05, -1.94]
]

res = analyze_earthwork(polygon_coords)
print(json.dumps(res, indent=2))
