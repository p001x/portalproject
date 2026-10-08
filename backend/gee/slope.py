from gee.persistent_cache import with_cache
import json
"""Slope / Terrain analysis — no Streamlit dependency."""
import ee
from gee.persistent_cache import PersistentCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache = PersistentCache(ttl=86400)
_lock = Lock()


def _build_slope_base(aoi_config: dict):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)

    is_world = aoi_config.get("type") == "world"

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False)
    if not is_world:
        dem = dem.clip(aoi)
        
    terrain = ee.Terrain.products(dem)
    slope = terrain.select("slope")
    aspect = terrain.select("aspect")
    hillshade = terrain.select("hillshade")
    if not is_world:
        slope = slope.clip(aoi)
        aspect = aspect.clip(aoi)
        hillshade = hillshade.clip(aoi)

    # Use pixels for kernel so it scales perfectly up to global level
    focal_mean = dem.reduceNeighborhood(reducer=ee.Reducer.mean(), kernel=ee.Kernel.circle(radius=10, units='pixels'))
    tpi = dem.subtract(focal_mean).rename('tpi')
    tri = dem.reduceNeighborhood(reducer=ee.Reducer.stdDev(), kernel=ee.Kernel.square(radius=1, units='pixels')).rename('tri')
    if not is_world:
        tpi = tpi.clip(aoi)
        tri = tri.clip(aoi)

    merit = ee.Image("MERIT/Hydro/v1_0_1")
    if not is_world:
        merit = merit.clip(aoi)
    upa = merit.select("upa").rename("upa")
    dir = merit.select("dir").rename("dir")

    contours = dem.mod(50).lt(2).rename("contours")
    if not is_world:
        contours = contours.clip(aoi)

    # Landslide Susceptibility Index (LSI): composite of slope, tri, and upa
    # Normalized roughly: slope(0-45)*0.5 + tri(0-20)*1.0 + upa(0-100)*0.2
    lsi = slope.multiply(0.5).add(tri.multiply(1.0)).add(upa.multiply(0.2)).rename('lsi')
    if not is_world:
        lsi = lsi.clip(aoi)

    # Solar Insolation (Synthetic): Hillshade at different azimuths (morning + afternoon)
    solar = ee.Terrain.hillshade(dem, 120, 45).add(ee.Terrain.hillshade(dem, 240, 45)).rename('solar')
    if not is_world:
        solar = solar.clip(aoi)

    return aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar

@with_cache
def compute_slope_map(aoi_config: dict) -> dict:
    cache_key = ("slope_map", json.dumps(aoi_config, sort_keys=True))
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)

    slope_vis = {"min": 0, "max": 45, "palette": ["#2166ac", "#92c5de", "#f7f7f7", "#f4a582", "#d6604d", "#b2182b"]}
    hillshade_vis = {"min": 0, "max": 255, "palette": ["#000000", "#ffffff"]}
    aspect_vis = {"min": 0, "max": 360, "palette": ["#d53e4f", "#fc8d59", "#fee08b", "#e6f598", "#99d594", "#3288bd", "#d53e4f"]}
    tpi_vis = {"min": -20, "max": 20, "palette": ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"]}
    tri_vis = {"min": 0, "max": 20, "palette": ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"]}
    upa_vis = {"min": 0, "max": 100, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}
    dir_vis = {"min": 1, "max": 128, "palette": ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00"]}
    lsi_vis = {"min": 0, "max": 40, "palette": ["#006837", "#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf", "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026"]}
    solar_vis = {"min": 0, "max": 510, "palette": ["#4a1486", "#6a51a3", "#807dba", "#9e9ac8", "#bcbddc", "#dadaeb", "#f2f0f7", "#fff7bc", "#fee391", "#fec44f", "#fe9929", "#ec7014"]}

    slope_map_id = slope.getMapId(slope_vis)
    hillshade_map_id = hillshade.getMapId(hillshade_vis)
    aspect_map_id = aspect.getMapId(aspect_vis)
    tpi_map_id = tpi.getMapId(tpi_vis)
    tri_map_id = tri.getMapId(tri_vis)
    upa_map_id = upa.getMapId(upa_vis)
    dir_map_id = dir.getMapId(dir_vis)
    lsi_map_id = lsi.getMapId(lsi_vis)
    solar_map_id = solar.getMapId(solar_vis)
    contours_masked = contours.updateMask(contours)
    contours_map_id = contours_masked.getMapId({"palette": ["#000000"]})

    try:
        bounds_info = aoi.bounds(maxError=1000).getInfo()
        if bounds_info.get("type") == "Polygon":
            bounds = bounds_info.get("coordinates", [[[0,0]]])[0]
        elif bounds_info.get("type") == "MultiPolygon":
            bounds = bounds_info.get("coordinates", [[[[0,0]]]])[0][0]
        else:
            bounds = [[0,0],[0,0],[0,0],[0,0]]
            
        center_coords = aoi.centroid(maxError=1000).getInfo().get("coordinates", [0, 0])
        center = [center_coords[1], center_coords[0]]
    except Exception:
        bounds = [[0,0],[0,0],[0,0],[0,0]]
        center = [0, 0]

    result = {
        "slope_tile_url": slope_map_id["tile_fetcher"].url_format,
        "slope_thumb_url": slope.getThumbURL({**slope_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "hillshade_tile_url": hillshade_map_id["tile_fetcher"].url_format,
        "hillshade_thumb_url": hillshade.getThumbURL({**hillshade_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "aspect_tile_url": aspect_map_id["tile_fetcher"].url_format,
        "aspect_thumb_url": aspect.getThumbURL({**aspect_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "tpi_tile_url": tpi_map_id["tile_fetcher"].url_format,
        "tpi_thumb_url": tpi.getThumbURL({**tpi_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "tri_tile_url": tri_map_id["tile_fetcher"].url_format,
        "tri_thumb_url": tri.getThumbURL({**tri_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "upa_tile_url": upa_map_id["tile_fetcher"].url_format,
        "upa_thumb_url": upa.getThumbURL({**upa_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "dir_tile_url": dir_map_id["tile_fetcher"].url_format,
        "dir_thumb_url": dir.getThumbURL({**dir_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "lsi_tile_url": lsi_map_id["tile_fetcher"].url_format,
        "lsi_thumb_url": lsi.getThumbURL({**lsi_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "solar_tile_url": solar_map_id["tile_fetcher"].url_format,
        "solar_thumb_url": solar.getThumbURL({**solar_vis, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "contours_tile_url": contours_map_id["tile_fetcher"].url_format,
        "contours_thumb_url": contours_masked.getThumbURL({"palette": ["#000000"], "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "center": center,
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    with _lock:
        _cache[cache_key] = result
    return result

@with_cache
def compute_slope_stats(aoi_config: dict) -> dict:
    cache_key = ("slope_stats", json.dumps(aoi_config, sort_keys=True))
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)

    combined_stats_img = slope.rename("slope").addBands(dem.rename("elevation")).addBands(tpi.rename("tpi")).addBands(tri.rename("tri")).addBands(upa.rename("upa"))
    classes = {
        "Flat (0–5°)": slope.lt(5),
        "Gentle (5–15°)": slope.gte(5).And(slope.lt(15)),
        "Moderate (15–25°)": slope.gte(15).And(slope.lt(25)),
        "Steep (25–35°)": slope.gte(25).And(slope.lt(35)),
        "Very Steep (>35°)": slope.gte(35),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat(
        [classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(labels)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_stats = executor.submit(
            lambda: combined_stats_img.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.percentile([25, 75]), sharedInputs=True)
                .combine(ee.Reducer.min(), sharedInputs=True),
                geometry=aoi.bounds(maxError=1000), scale=dynamic_scale, maxPixels=1e10,
            ).getInfo()
        )
        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi.bounds(maxError=1000), scale=dynamic_scale, maxPixels=1e10
            ).getInfo()
        )
        combined_stats = f_stats.result()
        area_dict = f_area.result()

    class_areas = {lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(labels)}

    result = {
        "stats": {
            "Mean Slope (°)": round(combined_stats.get("slope_mean") or 0, 2),
            "Max Slope (°)": round(combined_stats.get("slope_max") or 0, 2),
            "P25 Slope (°)": round(combined_stats.get("slope_p25") or 0, 2),
            "P75 Slope (°)": round(combined_stats.get("slope_p75") or 0, 2),
            "Mean Elevation (m)": round(combined_stats.get("elevation_mean") or 0, 0),
            "Min Elevation (m)": round(combined_stats.get("elevation_min") or 0, 0),
            "Max Elevation (m)": round(combined_stats.get("elevation_max") or 0, 0),
            "Mean TRI": round(combined_stats.get("tri_mean") or 0, 2),
            "Max TRI": round(combined_stats.get("tri_max") or 0, 2),
            "Max UPA (km²)": round(combined_stats.get("upa_max") or 0, 2),
        },
        "class_areas_km2": class_areas,
    }
    with _lock:
        _cache[cache_key] = result
    return result

@with_cache
def compute_slope_classify(aoi_config: dict, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None, custom_breaks: list = None) -> dict:
    cache_key = ("slope_classify", json.dumps(aoi_config, sort_keys=True), n_classes, method, tuple(custom_labels) if custom_labels else None, tuple(custom_breaks) if custom_breaks else None)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)

    classify = quantile_classify(
        layers=[
            {"name": "slope", "image": slope, "title": "Slope (°)"},
            {"name": "elevation", "image": dem, "title": "Elevation (m)"},
            {"name": "aspect", "image": aspect, "title": "Aspect (°)"},
            {"name": "tpi", "image": tpi, "title": "TPI (Position)"},
            {"name": "tri", "image": tri, "title": "TRI (Ruggedness)"},
            {"name": "upa", "image": upa, "title": "Flow Accumulation (km²)"},
        ],
        aoi=aoi, scale=dynamic_scale, n_classes=n_classes,
        method=method, custom_labels=custom_labels,
        custom_breaks={"slope": custom_breaks} if custom_breaks else None
    )

    result = {
        "classify": classify,
    }
    with _lock:
        _cache[cache_key] = result
    return result

@with_cache
def compute_slope_export(aoi_config: dict) -> dict:
    cache_key = ("slope_export", json.dumps(aoi_config, sort_keys=True))
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)

    result = {
        "slope_download_url": slope.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "hillshade_download_url": hillshade.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "aspect_download_url": aspect.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "tpi_download_url": tpi.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "tri_download_url": tri.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "upa_download_url": upa.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "dir_download_url": dir.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "contours_download_url": contours.getDownloadURL({"region": aoi.bounds(), "scale": dynamic_scale, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
    }
    with _lock:
        _cache[cache_key] = result
    return result

def inspect_slope_point(lat: float, lon: float, aoi_config: dict) -> dict:
    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)
    point = ee.Geometry.Point([lon, lat])
    
    combined = dem.rename('elevation').addBands([
        slope.rename('slope'),
        aspect.rename('aspect'),
        tpi.rename('tpi'),
        tri.rename('tri'),
        upa.rename('upa')
    ])
    
    data = combined.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=point,
        scale=30,
        maxPixels=1e9
    ).getInfo()
    
    return data

import math
import numpy as np

def profile_slope_line(coords: list, aoi_config: dict) -> list:
    aoi, dynamic_scale, dem, slope, aspect, hillshade, tpi, tri, upa, dir, contours, lsi, solar = _build_slope_base(aoi_config)
    
    lon1, lat1 = coords[0]
    lon2, lat2 = coords[-1]
    
    lons = np.linspace(lon1, lon2, 100)
    lats = np.linspace(lat1, lat2, 100)
    points = [ee.Feature(ee.Geometry.Point([float(lon), float(lat)])) for lon, lat in zip(lons, lats)]
    fc = ee.FeatureCollection(points)
    
    combined = dem.rename('elevation').addBands(slope.rename('slope'))
    
    sampled = combined.reduceRegions(
        collection=fc,
        reducer=ee.Reducer.first(),
        scale=30
    ).getInfo()
    
    features = sampled.get("features", [])
    
    def haversine(lon1, lat1, lon2, lat2):
        R = 6371
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c * 1000

    profile = []
    for f in features:
        geom = f.get("geometry", {}).get("coordinates", [lon1, lat1])
        dist = haversine(lon1, lat1, geom[0], geom[1])
        props = f.get("properties", {})
        profile.append({
            "distance": round(dist, 2),
            "elevation": round(props.get("elevation") or 0, 2),
            "slope": round(props.get("slope") or 0, 2)
        })
        
    return profile

_watershed_cache = PersistentCache(ttl=86400)

def delineate_watershed(lat: float, lon: float, level: int = 12) -> dict:
    cache_key = (lat, lon, level)
    if cache_key in _watershed_cache:
        return _watershed_cache[cache_key]

    point = ee.Geometry.Point([float(lon), float(lat)])
    basins = ee.FeatureCollection(f"WWF/HydroSHEDS/v1/Basins/hybas_{level}")
    
    intersecting = basins.filterBounds(point)
    
    # Check if empty
    size = intersecting.size().getInfo()
    if size == 0:
        raise ValueError("No watershed found at this location. It may be over the ocean or outside data coverage.")
        
    basin = ee.Feature(intersecting.first())
    
    # Export as a collection to allow SHP download
    fc = ee.FeatureCollection([basin])
    url = fc.getDownloadURL(
        filetype="SHP",
        filename="watershed_basin"
    )
    
    # Get river network intersecting the basin
    rivers = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers").filterBounds(basin.geometry())
    rivers_url = ""
    rivers_geojson = None
    if rivers.size().getInfo() > 0:
        rivers_url = rivers.getDownloadURL(
            filetype="SHP",
            filename="watershed_rivers"
        )
        rivers_geojson = rivers.getInfo()
    
    geojson = basin.getInfo()
    
    props = geojson.get("properties", {})
    area_km2 = props.get("SUB_AREA")
    if area_km2 is None:
        area_km2 = basin.bounds().area(maxError=1000).divide(1e6).getInfo()
        
    res = {
        "geojson": geojson,
        "download_url": url,
        "area_km2": round(area_km2, 2),
        "river_geojson": rivers_geojson,
        "river_download_url": rivers_url
    }
    _watershed_cache[cache_key] = res
    return res



@with_cache
def compute_earthwork(polygon_coords: list, target_elevation: float) -> dict:
    """
    polygon_coords: list of [lon, lat] points forming a closed ring.
    target_elevation: float representing the desired flat elevation in meters.
    Returns cut and fill volumes in cubic meters.
    """
    # Use convex hull to prevent self-intersecting polygons from user clicks
    poly = ee.Geometry.MultiPoint(polygon_coords).convexHull()

    
    # 30m SRTM DEM
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).clip(poly)
    
    # Difference = DEM - Target
    # Positive means DEM is higher than target -> Cut
    # Negative means DEM is lower than target -> Fill
    diff = dem.subtract(target_elevation)
    
    # Multiply by pixel area to get volume
    pixel_area = ee.Image.pixelArea()
    
    cut = diff.updateMask(diff.gt(0)).multiply(pixel_area)
    fill = diff.updateMask(diff.lt(0)).abs().multiply(pixel_area)
    
    # Reduce
    cut_vol = cut.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=poly,
        scale=30,
        maxPixels=1e9
    ).get("elevation").getInfo()
    
    fill_vol = fill.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=poly,
        scale=30,
        maxPixels=1e9
    ).get("elevation").getInfo()
    
    area_m2 = poly.area(maxError=1).getInfo()
    
    return {
        "cut_m3": round(cut_vol or 0, 2),
        "fill_m3": round(fill_vol or 0, 2),
        "area_m2": round(area_m2 or 0, 2)
    }
