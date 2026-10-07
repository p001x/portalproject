import sys
import os
os.environ["HTTP_PROXY"] = ""
os.environ["HTTPS_PROXY"] = ""
os.environ["NO_PROXY"] = "*"
import ee
import time
from gee.auth import initialize_gee
from gee.aoi_utils import get_aoi_geometry, get_dynamic_scale
from gee.drought import compute_drought_stats, compute_drought_classify

print('Authenticating...')
initialize_gee()

aoi_config = {'type': 'gaul0', 'country': 'China'}
print('Getting Geometry...')
t0 = time.time()
geom = get_aoi_geometry(aoi_config)

scale = get_dynamic_scale(geom)
print(f'Scale selected: {scale}')

print('Running compute_drought_stats...')
t1 = time.time()
try:
    stats = compute_drought_stats(aoi_config, 2023, 2023)
    print(f'Stats done in {time.time()-t1:.2f}s')
except Exception as e:
    print('Failed stats:', e)

print('Running compute_drought_classify...')
t2 = time.time()
try:
    classify = compute_drought_classify(aoi_config, 2023, 2023)
    print(f'Classify done in {time.time()-t2:.2f}s')
except Exception as e:
    print('Failed classify:', e)
