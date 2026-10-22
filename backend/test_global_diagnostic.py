import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from gee.auth import initialize_gee
initialize_gee()

import ee
from gee.aoi_utils import get_aoi_geometry
from gee.landfill import compute_landfill_map, compute_landfill_stats, compute_landfill_classify

print("Testing with 'World' AOI...")
world_aoi = {"type": "world", "country": "World", "name": "World"}

try:
    print("1. Testing get_aoi_geometry(world)...")
    geom = get_aoi_geometry(world_aoi)
    print("Geom type:", geom.type().getInfo())
except Exception as e:
    import traceback
    traceback.print_exc()

try:
    print("2. Testing compute_landfill_map(world)...")
    m = compute_landfill_map(world_aoi)
    print("Map success! Tile url:", m.get("tile_url")[:50])
except Exception as e:
    import traceback
    traceback.print_exc()

try:
    print("3. Testing compute_landfill_stats(world)...")
    s = compute_landfill_stats(world_aoi)
    print("Stats success:", s)
except Exception as e:
    import traceback
    traceback.print_exc()

try:
    print("4. Testing compute_landfill_classify(world)...")
    c = compute_landfill_classify(world_aoi)
    print("Classify success! Panels:", len(c.get("panels", [])))
except Exception as e:
    import traceback
    traceback.print_exc()
