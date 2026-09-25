with open('backend/gee/earthwork.py', 'a', encoding='utf-8') as f:
    f.write('''

def get_earthwork_3d_surface(
    polygon_coords: list,
    target_elevation: float = None,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    batter_ratio: float = 3.0,
    custom_dem_id: str = None
):
    poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    dist = ee.FeatureCollection([ee.Feature(poly)]).distance(searchRadius=500, maxError=1)
    
    # Calculate target surface
    if target_elevation is None:
        target_elevation = dem.reduceRegion(reducer=ee.Reducer.mean(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get("DEM")
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
    
    if batter_ratio > 0:
        z_batter_cut = target_surface.add(dist.divide(batter_ratio))
        prop_cut = z_batter_cut.min(dem)
        
        z_batter_fill = target_surface.subtract(dist.divide(batter_ratio))
        prop_fill = z_batter_fill.max(dem)
        
        proposed = prop_cut.add(prop_fill).subtract(dem)
    else:
        proposed = target_surface
        
    dem_with_props = dem.addBands(ee.Image.pixelLonLat()).addBands(proposed.rename('proposed'))
    
    samples = dem_with_props.sample(
        region=poly.buffer(100, 1),
        scale=30,
        geometries=False,
        numPixels=3000
    ).getInfo()
    
    features = samples.get("features", [])
    if not features:
        return []
        
    pts = []
    for f in features:
        props = f["properties"]
        if "longitude" in props and "latitude" in props and "DEM" in props and "proposed" in props:
            pts.append({
                "x": props["longitude"],
                "y": props["latitude"],
                "z_exist": props["DEM"],
                "z_prop": props["proposed"]
            })
    return pts
''')
print('Added 3D surface function.')
