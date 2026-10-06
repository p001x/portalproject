import requests
import sys

req = {
    'aoi': {'type': 'rwanda', 'country': 'Rwanda', 'name': 'Rwanda'},
    'start_year': 2024,
    'end_year': 2024,
    'season': 'season_b'
}
try:
    print('Testing /api/drought/map...')
    res = requests.post('http://127.0.0.1:8000/api/drought/map', json=req).json()
    print('dvi_tile_url:', res.get('dvi_tile_url'))
except Exception as e:
    print('Exception:', e)
