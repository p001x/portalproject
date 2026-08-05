import os

replacements = {
    r'backend\gee\ndvi.py': [
        ('"tile_url": map_id["tile_fetcher"].url_format,', 
         '"tile_url": map_id["tile_fetcher"].url_format,\n        "thumb_url": median.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
    r'backend\gee\lst.py': [
        ('"tile_url": map_id["tile_fetcher"].url_format,', 
         '"tile_url": map_id["tile_fetcher"].url_format,\n        "thumb_url": lst_median.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
    r'backend\gee\air_pollution.py': [
        ('"tile_url": map_id["tile_fetcher"].url_format,', 
         '"tile_url": map_id["tile_fetcher"].url_format,\n        "thumb_url": composite.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
    r'backend\gee\slope.py': [
        ('"slope_tile_url": slope_map_id["tile_fetcher"].url_format,',
         '"slope_tile_url": slope_map_id["tile_fetcher"].url_format,\n        "slope_thumb_url": slope.getThumbURL({**slope_vis, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),'),
        ('"hillshade_tile_url": hillshade_map_id["tile_fetcher"].url_format,',
         '"hillshade_tile_url": hillshade_map_id["tile_fetcher"].url_format,\n        "hillshade_thumb_url": hillshade.getThumbURL({**hillshade_vis, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),'),
        ('"aspect_tile_url": aspect_map_id["tile_fetcher"].url_format,',
         '"aspect_tile_url": aspect_map_id["tile_fetcher"].url_format,\n        "aspect_thumb_url": aspect.getThumbURL({**aspect_vis, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
    r'backend\gee\uhi.py': [
        ('"lst_tile_url": lst_map_id["tile_fetcher"].url_format,',
         '"lst_tile_url": lst_map_id["tile_fetcher"].url_format,\n        "lst_thumb_url": lst_median.getThumbURL({**lst_vis, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),'),
        ('"ndbi_tile_url": ndbi_map_id["tile_fetcher"].url_format,',
         '"ndbi_tile_url": ndbi_map_id["tile_fetcher"].url_format,\n        "ndbi_thumb_url": ndbi_median.getThumbURL({**ndbi_vis, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
    r'backend\gee\landslide.py': [
        ('"lsi_tile_url": lsi_map_id["tile_fetcher"].url_format,',
         '"lsi_tile_url": lsi_map_id["tile_fetcher"].url_format,\n        "lsi_thumb_url": lsi.getThumbURL({**LSI_VIS, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),'),
        ('"lsi_class_tile_url": lsi_class_map_id["tile_fetcher"].url_format,',
         '"lsi_class_tile_url": lsi_class_map_id["tile_fetcher"].url_format,\n        "lsi_class_thumb_url": lsi_class.getThumbURL({**LSI_VIS, "min":1, "max":5, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),')
    ],
}

for filepath, reps in replacements.items():
    full_path = os.path.join(r'c:\Users\user\Documents\blacportal', filepath)
    if os.path.exists(full_path):
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        for old, new in reps:
            content = content.replace(old, new)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Patched {filepath}')
