import time
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

import main
import ee

print("Initializing GEE...")
main._init_gee_background()

while not main._gee_ready:
    time.sleep(0.5)

print("GEE initialized.")
hist = ee.FeatureCollection("FAO/GAUL/2015/level0").aggregate_histogram("ADM0_NAME")
countries = ee.Dictionary(hist).keys().getInfo()

for c in ['Rwanda', 'Burundi', 'Kenya', 'Uganda', 'Democratic Republic of the Congo', 'Congo', 'DRC', 'Dem. Rep. Congo', 'The Democratic Republic of the Congo']:
    if c in countries:
        print(f"FOUND: {c}")
