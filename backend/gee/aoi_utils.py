import ee
import os
import json

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

def get_aoi_geometry(aoi_config: dict) -> ee.Geometry:
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
        has_micro = any(val and val != "none" for val in [district, sector, cell, village])
        
        if not has_micro:
            # Country level
            if not province or province == "none":
                return ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", "Rwanda")).geometry()
            
            # Province Mapping from frontend (English) or Kinyarwanda to exact GAUL ADM1_NAME
            GAUL_PROVINCE_MAPPING = {
                "Northern": "North/Amajyaruguru", "Amajyaruguru": "North/Amajyaruguru",
                "Southern": "South/Amajyepfo", "Amajyepfo": "South/Amajyepfo",
                "Eastern": "East/Iburasirazuba", "Iburasirazuba": "East/Iburasirazuba",
                "Western": "West/Iburengerazuba", "Iburengerazuba": "West/Iburengerazuba",
                "Kigali City": "Kigali City/Umujyi wa Kigali", "Umujyi wa Kigali": "Kigali City/Umujyi wa Kigali"
            }
            gaul_province = GAUL_PROVINCE_MAPPING.get(province, province)

            # Province level
            if not district or district == "none":
                return ee.FeatureCollection("FAO/GAUL/2015/level1").filter(
                    ee.Filter.And(
                        ee.Filter.eq("ADM0_NAME", "Rwanda"),
                        ee.Filter.eq("ADM1_NAME", gaul_province)
                    )
                ).geometry()
            
            # District level (districts match exactly)
            return ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
                ee.Filter.And(
                    ee.Filter.eq("ADM0_NAME", "Rwanda"),
                    ee.Filter.eq("ADM1_NAME", gaul_province),
                    ee.Filter.eq("ADM2_NAME", district)
                )
            ).geometry()

        # Fallback to local shapefile for micro-level queries
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
        
        
    elif aoi_type == "gaul0":
        country = aoi_config.get("country")
        fc = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", country))
        return fc.geometry()
        
    elif aoi_type == "gaul1":
        country = aoi_config.get("country")
        level1 = aoi_config.get("level1")
        fc = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(
            ee.Filter.And(
                ee.Filter.eq("ADM0_NAME", country),
                ee.Filter.eq("ADM1_NAME", level1)
            )
        )
        return fc.geometry()
        
    elif aoi_type == "gaul2":
        country = aoi_config.get("country")
        level1 = aoi_config.get("level1")
        level2 = aoi_config.get("level2")
        fc = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
            ee.Filter.And(
                ee.Filter.eq("ADM0_NAME", country),
                ee.Filter.eq("ADM1_NAME", level1),
                ee.Filter.eq("ADM2_NAME", level2)
            )
        )
        return fc.geometry()
        
    # Fallback to old behavior for backwards compatibility during refactor
    district = aoi_config.get("district", "Musanze")
    return get_district_geometry(district)


def get_historical_ndvi(aoi, year: int, start_date: str = None, end_date: str = None, cloud_limit=30):
    import ee
    
    if not start_date: start_date = f"{year}-01-01"
    if not end_date: end_date = f"{year}-12-31"
    
    if year >= 2016:
        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_limit))
            .map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
        )
    elif year >= 2014:
        col = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))
        )
    else:
        col = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(lambda img: img.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI"))
        )
    return col.median().rename("NDVI").clip(aoi)
