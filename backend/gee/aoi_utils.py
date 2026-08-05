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

    rwanda = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
        ee.Filter.And(
            ee.Filter.eq("ADM0_NAME", "Rwanda"),
            ee.Filter.eq("ADM2_NAME", district_name),
        )
    )
    return rwanda.geometry()

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

    elif aoi_type == "rwanda":
        province = aoi_config.get("province")
        district = aoi_config.get("district")
        sector = aoi_config.get("sector")

        import geopandas as gpd
        from shapely.geometry import mapping
        
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        shp_path = os.path.join(base_dir, "sectrstu", "sector.shp")
        gdf = gpd.read_file(shp_path)
        if gdf.crs != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")

        if sector and sector != "none":
            filtered = gdf[(gdf["REGION"] == province) & (gdf["DISTR"] == district) & (gdf["NOMSECT"] == sector)]
        elif district and district != "none":
            filtered = gdf[(gdf["REGION"] == province) & (gdf["DISTR"] == district)]
        elif province and province != "none":
            filtered = gdf[gdf["REGION"] == province]
        else:
            filtered = gdf

        if len(filtered) == 0:
            raise ValueError("No area matched the specified Rwanda hierarchy.")
            
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
