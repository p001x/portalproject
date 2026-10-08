import ee
import os
import json
import math
import time
import random

def safe_get_info(ee_obj, retries=6):
    """
    Robust wrapper for ee.getInfo() that automatically implements exponential backoff 
    when Google Earth Engine triggers HTTP 429 'Too Many Requests' due to concurrency limits 
    in Restricted Mode (Free Tier).
    """
    for i in range(retries):
        try:
            return ee_obj.getInfo()
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Too Many Requests" in err_str or "concurrency" in err_str.lower():
                if i < retries - 1:
                    sleep_time = (2 ** i) + random.uniform(0, 1)
                    print(f"GEE 429 Concurrency Limit Hit. Retrying in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    continue
            raise

def get_dynamic_scale(geom: ee.Geometry, aoi_config: dict = None) -> int:
    """
    Dynamically scales processing resolution to ensure Earth Engine limits are never exceeded.
    Handles anything from a small village to the entire globe.
    """
    if aoi_config:
        t = aoi_config.get("type")
        if t == "world": return 100000
        
    try:
        # Attempt to detect if it's the exact whole world polygon before making EE requests
        try:
            geom_str = str(geom.serialize())
            if "-180" in geom_str and "180" in geom_str and "-90" in geom_str and "90" in geom_str:
                return 100000
        except Exception:
            pass
            
        # Use bounding box area for extremely fast and stable approximation on massive polygons
        # Use maxError=1000 to avoid projection failures on massive continental geometries
        area_sqkm = safe_get_info(geom.bounds().area(maxError=1000).divide(1e6))
        
        # Smoothly and dynamically scale resolution to target ~2.5M pixels for normal regions,
        # but aggressively reduce pixel count for massive countries to prevent GEE timeouts.
        if area_sqkm > 10000000:
            target_pixels = 25000   # e.g., Russia (massive reduction)
        elif area_sqkm > 5000000:
            target_pixels = 100000  # e.g., Brazil, Australia, USA, Canada
        elif area_sqkm > 1000000:
            target_pixels = 500000  # e.g., India, Argentina
        else:
            target_pixels = 1000000 # normal target
        area_sqm = area_sqkm * 1_000_000
        scale = math.sqrt(area_sqm / target_pixels)
        
        # Snap scale to sensible integers (e.g., 30m, 40m, 50m) and clamp to 10m minimum
        return max(10, int(round(scale / 10.0) * 10))
    except Exception:
        # If EE area calculation fails (usually because polygon is global/massive and crosses dateline)
        # default to a very large safe scale rather than 2000 to prevent 4GB request size crashes.
        return 50000

RWANDA_DISTRICTS = [
    "Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo",
    "Gicumbi", "Gisagara", "Huye", "Kamonyi", "Karongi",
    "Kayonza", "Kicukiro", "Kirehe", "Muhanga", "Musanze",
    "Ngoma", "Ngororero", "Nyabihu", "Nyagatare", "Nyamagabe",
    "Nyamasheke", "Nyanza", "Nyarugenge", "Nyaruguru", "Rubavu",
    "Ruhango", "Rulindo", "Rusizi", "Rutsiro", "Rwamagana",
    "Custom Study Area"
]

def parse_geojson_to_ee_geometry(geojson) -> ee.Geometry:
    """Safely convert any GeoJSON dictionary/string (FeatureCollection, Feature, or Geometry) to an ee.Geometry."""
    if isinstance(geojson, str):
        geojson = json.loads(geojson)
    if not isinstance(geojson, dict):
        raise ValueError(f"Invalid GeoJSON structure: expected dict or JSON string, got {type(geojson)}")
    
    gtype = geojson.get("type")
    if gtype == "FeatureCollection":
        return ee.FeatureCollection(geojson).geometry()
    elif gtype == "Feature":
        geom = geojson.get("geometry")
        if not geom:
            raise ValueError("Feature missing geometry")
        return ee.Geometry(geom)
    elif gtype in ("Polygon", "MultiPolygon", "Point", "MultiPoint", "LineString", "MultiLineString", "GeometryCollection"):
        return ee.Geometry(geojson)
    else:
        try:
            return ee.FeatureCollection(geojson).geometry()
        except Exception:
            try:
                geom = geojson.get("geometry")
                return ee.Geometry(geom) if geom else ee.Geometry(geojson)
            except Exception:
                return ee.Geometry(geojson)

def get_district_geometry(district_name: str) -> ee.Geometry:
    if district_name == "Custom Study Area":
        boundary_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "study_area_boundary.geojson")
        if os.path.exists(boundary_path):
            with open(boundary_path, "r", encoding="utf-8") as f:
                geojson = json.load(f)
            geom = parse_geojson_to_ee_geometry(geojson)
            return geom.simplify(100)
        else:
            raise ValueError("Custom Study Area boundary file not found.")

    # Backward compatibility: query the shapefile for the given district name
    import geopandas as gpd
    from shapely.geometry import mapping
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    shp_path = os.path.join(base_dir, "sectrstu", "villages.shp")
    gdf = gpd.read_file(shp_path)
    if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
    
    filtered = gdf[gdf["NAME_2"] == district_name]
    if len(filtered) == 0:
        raise ValueError(f"District {district_name} not found in local shapefile.")
        
    if hasattr(filtered.geometry, "union_all"):
        boundary = filtered.geometry.union_all()
    else:
        boundary = filtered.geometry.unary_union
        
    boundary_simplified = boundary.simplify(0.001, preserve_topology=True)
    geojson = mapping(boundary_simplified)
    return parse_geojson_to_ee_geometry(geojson)

def _get_aoi_geometry_internal(aoi_config: dict) -> ee.Geometry:
    aoi_type = aoi_config.get("type")
    
    if aoi_type in ("FeatureCollection", "Feature", "Polygon", "MultiPolygon", "Point", "MultiPoint", "LineString", "MultiLineString", "GeometryCollection"):
        return parse_geojson_to_ee_geometry(aoi_config)

    if aoi_type == "geojson":
        # Direct GeoJSON feature collection or geometry
        geojson = aoi_config.get("geojson")
        if not geojson:
            raise ValueError("Missing geojson data in AOI config.")
        return parse_geojson_to_ee_geometry(geojson)

    elif aoi_type in ("rwanda", "rwanda-micro"):
        province = aoi_config.get("province")
        district = aoi_config.get("district")
        sector = aoi_config.get("sector")
        cell = aoi_config.get("cell")
        village = aoi_config.get("village")

        # Use fast GAUL collections only for Country and Province level.
        # Districts, Sectors, Cells, and Villages use the local shapefile
        has_micro = any(val and val != "none" for val in [province, district, sector, cell, village])
        
        if not has_micro:
            # Country level only
            return ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", "Rwanda")).first().geometry().simplify(maxError=500)

        # Fallback to local shapefile for all province and micro-level queries
        import geopandas as gpd
        from shapely.geometry import mapping
        
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        shp_path = os.path.join(base_dir, "sectrstu", "villages.shp")
        gdf = gpd.read_file(shp_path)
        if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
        
        filtered = gdf
        
        # Local shapefile uses Kinyarwanda names
        LOCAL_PROVINCE_MAPPING = {
            "Northern": "Amajyaruguru", "North/Amajyaruguru": "Amajyaruguru",
            "Southern": "Amajyepfo", "South/Amajyepfo": "Amajyepfo",
            "Eastern": "Iburasirazuba", "East/Iburasirazuba": "Iburasirazuba",
            "Western": "Iburengerazuba", "West/Iburengerazuba": "Iburengerazuba",
            "Kigali City": "Umujyi wa Kigali", "Kigali City/Umujyi wa Kigali": "Umujyi wa Kigali"
        }
        
        if province and province != "none":
            local_province = LOCAL_PROVINCE_MAPPING.get(province, province)
            filtered = filtered[filtered["NAME_1"] == local_province]
        if district and district != "none":
            filtered = filtered[filtered["NAME_2"] == district]
        if sector and sector != "none":
            filtered = filtered[filtered["NAME_3"] == sector]
        if cell and cell != "none":
            filtered = filtered[filtered["NAME_4"] == cell]
        if village and village != "none":
            filtered = filtered[filtered["NAME_5"] == village]

        if len(filtered) == 0:
            raise ValueError("No area matched the specified Rwanda hierarchy.")
            
        if hasattr(filtered.geometry, "union_all"):
            boundary = filtered.geometry.union_all()
        else:
            boundary = filtered.geometry.unary_union
            
        boundary_simplified = boundary.simplify(0.001, preserve_topology=True)
        geojson = mapping(boundary_simplified)
        return parse_geojson_to_ee_geometry(geojson)
        
        
    elif aoi_type == "world":
        return ee.Geometry.Rectangle([-180, -90, 180, 90], "EPSG:4326", False)
        
    elif aoi_type == "gaul0":
        country = aoi_config.get("country")
        
        # Name mapping for GAUL -> LSIB to use cleaner boundaries for massive countries
        name_map = {
            "Russian Federation": "Russia",
            "United States of America": "United States",
            "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
            "Iran  (Islamic Republic of)": "Iran",
            "Venezuela (Bolivarian Republic of)": "Venezuela",
            "Syrian Arab Republic": "Syria",
            "Republic of Korea": "South Korea",
            "Democratic People's Republic of Korea": "North Korea",
            "Viet Nam": "Vietnam",
            "Lao People's Democratic Republic": "Laos",
            "CÃƒÂ´te d'Ivoire": "Cote d'Ivoire",
            "Congo": "Republic of the Congo",
            "Democratic Republic of the Congo": "Democratic Republic of the Congo"
        }
        lsib_name = name_map.get(country, country)
        
        lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017").filter(ee.Filter.eq("country_na", lsib_name))
        
        gaul = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", country))
        gaul_simple = gaul.map(lambda f: ee.Feature(f.geometry().simplify(maxError=5000)))
        
        geom = ee.Algorithms.If(
            lsib.size().gt(0),
            lsib.geometry(),
            gaul_simple.geometry()
        )
        return ee.Geometry(geom)
        
    elif aoi_type == "gaul1":
        country = aoi_config.get("country")
        level1 = aoi_config.get("level1")
        filters = [ee.Filter.eq("ADM0_NAME", country)]
        if level1:
            filters.append(ee.Filter.eq("ADM1_NAME", level1))
        fc = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.And(*filters))
        return fc.first().geometry().simplify(maxError=500)
        
    elif aoi_type == "gaul2":
        country = aoi_config.get("country")
        level1 = aoi_config.get("level1")
        level2 = aoi_config.get("level2")
        filters = [ee.Filter.eq("ADM0_NAME", country)]
        if level1:
            filters.append(ee.Filter.eq("ADM1_NAME", level1))
        if level2:
            filters.append(ee.Filter.eq("ADM2_NAME", level2))
        fc = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(ee.Filter.And(*filters))
        return fc.first().geometry().simplify(maxError=100)
        
    # Fallback to old behavior for backwards compatibility during refactor
    district = aoi_config.get("district", "Musanze")
    return get_district_geometry(district)


def get_aoi_geometry(aoi_config: dict) -> ee.Geometry:
    """Gets the AOI geometry and dynamically simplifies it for massive regions to prevent vector processing bottlenecks."""
    geom = _get_aoi_geometry_internal(aoi_config)
    
    try:
        area_sqkm = geom.bounds().area(maxError=1000).divide(1e6).getInfo()
        if area_sqkm > 1000000:
            # Massive country > 1M sq km -> simplify by 10000 meters
            geom = geom.simplify(maxError=10000)
        elif area_sqkm > 100000:
            # Large country > 100k sq km -> simplify by 2000 meters
            geom = geom.simplify(maxError=2000)
        elif area_sqkm > 10000:
            # Medium country -> simplify by 500 meters
            geom = geom.simplify(maxError=500)
    except Exception as e:
        print(f"Warning: Geometry simplification failed: {e}")
        
    try:
        bounds_info = geom.bounds(maxError=1000).getInfo()
        coords = bounds_info.get("coordinates", [[[[0,0]]]])
        if bounds_info.get("type") == "Polygon":
            lons = [p[0] for p in coords[0]]
        else:
            lons = []
            for poly in coords:
                lons.extend([p[0] for p in poly[0]])
                
        if max(lons) - min(lons) > 180:
            if not (min(lons) == -180 and max(lons) == 180 and len(lons) == 5):
                # Dateline crossed. Reconstruct GeoJSON with positive longitudes
                geojson = geom.getInfo()
                if geojson["type"] == "MultiPolygon":
                    new_coords = []
                    for poly in geojson["coordinates"]:
                        new_poly = []
                        for ring in poly:
                            new_poly.append([[lon + 360 if lon < 0 else lon, lat] for lon, lat in ring])
                        new_coords.append(new_poly)
                    geom = ee.Geometry.MultiPolygon(new_coords, "EPSG:4326", False)
                elif geojson["type"] == "Polygon":
                    new_coords = []
                    for ring in geojson["coordinates"]:
                        new_coords.append([[lon + 360 if lon < 0 else lon, lat] for lon, lat in ring])
                    geom = ee.Geometry.Polygon(new_coords, "EPSG:4326", False)
    except Exception as e:
        print(f"Warning: Dateline wrapping failed: {e}")
        
    return geom


def get_historical_ndvi(aoi, year: int, start_date: str = None, end_date: str = None, cloud_limit=30):
    import ee
    
    year = int(year)
    if not start_date: start_date = f"{year}-01-01"
    if not end_date: end_date = f"{year}-12-31"
    
    is_global = False
    try:
        geom_str = str(aoi.serialize())
        if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
            is_global = True
    except Exception:
        pass

    try:
        area_sqkm = aoi.bounds().area(maxError=1000).divide(1e6).getInfo() if not is_global else 999999999
    except Exception:
        area_sqkm = 999999999
        
    # Massive Area Handling (>200,000 kmÃ‚Â² or global):
    # Only use MODIS if year >= 2000 (MODIS Terra was launched in Dec 1999, data starts Feb 2000)
    if (is_global or area_sqkm > 100000) and year >= 2000:
        modis_dataset = "MODIS/061/MOD13A2" if (is_global or area_sqkm > 300000) else "MODIS/061/MOD13Q1"
        modis_col = ee.ImageCollection(modis_dataset).filterDate(start_date, end_date)
        try:
            if modis_col.limit(1).size().getInfo() > 0:
                return modis_col.select("NDVI").median().multiply(0.0001).rename("NDVI").clip(aoi)
        except Exception:
            pass

    # For continental/global areas before 2000, use NOAA CDR AVHRR NDVI (available 1981-present at 0.05Ã‚Â°)
    if (is_global or area_sqkm > 2000000) and year < 2000 and year >= 1981:
        try:
            avhrr_col = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V5").filterDate(start_date, end_date).select("NDVI")
            if avhrr_col.limit(1).size().getInfo() > 0:
                return avhrr_col.median().multiply(0.0001).rename("NDVI").clip(aoi)
        except Exception:
            pass

    # Cloud masking and NDVI calculation helpers
    def prep_l457(img):
        qa = img.select("QA_PIXEL")
        mask = qa.bitwiseAnd(1 << 3).eq(0).And(qa.bitwiseAnd(1 << 4).eq(0))
        sr = img.select(["SR_B4", "SR_B3"]).multiply(0.0000275).add(-0.2)
        ndvi = sr.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI")
        return ndvi.updateMask(mask)

    def prep_l89(img):
        qa = img.select("QA_PIXEL")
        mask = qa.bitwiseAnd(1 << 3).eq(0).And(qa.bitwiseAnd(1 << 4).eq(0))
        sr = img.select(["SR_B5", "SR_B4"]).multiply(0.0000275).add(-0.2)
        ndvi = sr.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")
        return ndvi.updateMask(mask)

    def prep_s2(img):
        return img.normalizedDifference(["B8", "B4"]).rename("NDVI")

    # Select satellite mission according to the year
    if year >= 2016:
        # Sentinel-2 Harmonized (2015-present)
        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_limit))
            .map(prep_s2)
        )
        annual_col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", max(cloud_limit, 50)))
            .map(prep_s2)
        )
    elif year >= 2013:
        # Landsat 8 & 9 (2013-present)
        col = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LC08/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(prep_l89)
        )
        annual_col = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 60))
            .map(prep_l89)
        )
    elif year >= 1999:
        # Landsat 7 (1999-2024) + Landsat 5 (up to 2012)
        l7 = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LE07/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(prep_l457)
        )
        l5 = (
            ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(prep_l457)
        )
        col = l7.merge(l5)
        annual_col = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"))
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 60))
            .map(prep_l457)
        )
    elif year >= 1984:
        # Landsat 5 TM (1984-2012) Ã¢â‚¬â€ Full operational era covering 1990!
        col = (
            ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", max(cloud_limit, 40)))
            .map(prep_l457)
        )
        annual_col = (
            ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 75))
            .map(prep_l457)
        )
    else:
        # Landsat 4 TM (1982-1993) & Landsat 5
        l4 = (
            ee.ImageCollection("LANDSAT/LT04/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT04/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", max(cloud_limit, 40)))
            .map(prep_l457)
        )
        l5 = (
            ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", max(cloud_limit, 40)))
            .map(prep_l457)
        )
        col = l4.merge(l5)
        annual_col = (
            ee.ImageCollection("LANDSAT/LT04/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"))
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 75))
            .map(prep_l457)
        )

    # Seamless fallback resolution to guarantee valid NDVI band:
    try:
        col_count = col.limit(1).size().getInfo()
    except Exception:
        col_count = 0

    if col_count > 0:
        primary_median = col.median().rename("NDVI")
        try:
            ann_count = annual_col.limit(1).size().getInfo()
        except Exception:
            ann_count = 0
            
        if ann_count > 0:
            ann_median = annual_col.median().rename("NDVI")
            return primary_median.unmask(ann_median).clip(aoi)
        return primary_median.clip(aoi)
    else:
        # Fallback to annual composite if date window was too narrow / cloudy
        try:
            ann_count = annual_col.limit(1).size().getInfo()
        except Exception:
            ann_count = 0

        if ann_count > 0:
            return annual_col.median().rename("NDVI").clip(aoi)

        # Relax cloud cover and broaden window +/- 1 year if needed
        if 1984 <= year < 1999:
            relaxed = (
                ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
                .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
                .filterDate(f"{year-1}-01-01", f"{year+1}-12-31")
                .filterBounds(aoi)
                .map(prep_l457)
            )
            try:
                if relaxed.limit(1).size().getInfo() > 0:
                    return relaxed.median().rename("NDVI").clip(aoi)
            except Exception:
                pass
        elif 1981 <= year < 1984:
            avhrr = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V5").filterDate(f"{year}-01-01", f"{year}-12-31").select("NDVI")
            try:
                if avhrr.limit(1).size().getInfo() > 0:
                    return avhrr.median().multiply(0.0001).rename("NDVI").clip(aoi)
            except Exception:
                pass

        raise ValueError(
            f"No satellite imagery available for the requested study area during {start_date} to {end_date}. "
            f"Please choose a date range between 1984 and present, or broaden the date window."
        )

def get_bounds_and_center(aoi):
    try:
        bounds_info = aoi.bounds(maxError=1000).getInfo()
        all_coords = []
        if bounds_info.get("type") == "Polygon":
            all_coords = bounds_info.get("coordinates", [[[0,0]]])[0]
        elif bounds_info.get("type") == "MultiPolygon":
            for poly in bounds_info.get("coordinates", [[[[0,0]]]]):
                all_coords.extend(poly[0])
        else:
            all_coords = [[0,0],[0,0],[0,0],[0,0],[0,0]]
            
        lons = [p[0] for p in all_coords]
        lats = [p[1] for p in all_coords]
        
        # Handle dateline crossing
        min_lon, max_lon = min(lons), max(lons)
        if max_lon - min_lon > 180:
            shifted_lons = [x + 360 if x < 0 else x for x in lons]
            if max(shifted_lons) - min(shifted_lons) > 0:
                lons = shifted_lons
                min_lon, max_lon = min(lons), max(lons)
                
        min_lat, max_lat = min(lats), max(lats)
        
        # Clamp latitudes to Web Mercator safe bounds (-85 to 85) to prevent Can't transform errors
        min_lat = max(-85.0, min_lat)
        max_lat = min(85.0, max_lat)
        
        bounds = [
            [min_lon, min_lat],
            [max_lon, min_lat],
            [max_lon, max_lat],
            [min_lon, max_lat],
            [min_lon, min_lat]
        ]
            
        center_coords = aoi.centroid(maxError=1000).getInfo().get("coordinates", [0, 0])
        c_lon, c_lat = center_coords[0], center_coords[1]
        if max_lon > 180 and c_lon < 0:
            c_lon += 360
        center = [c_lat, c_lon]
    except Exception:
        bounds = [[0,0],[0,0],[0,0],[0,0]]
        center = [0, 0]
    return bounds, center
