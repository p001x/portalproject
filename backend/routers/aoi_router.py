import ee
import json
import zipfile
import shutil
import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional
import geopandas as gpd

router = APIRouter(prefix="/api/aoi", tags=["aoi"])

# In-memory cache for GAUL regions to avoid hitting GEE every time
_gaul_cache = {
    "countries": [],
    "level1": {},
    "level2": {}
}

# In-memory cache for Rwanda hierarchy to avoid reading the shapefile multiple times
_rwanda_hierarchy = None

@router.get("/regions")
def get_regions(country: Optional[str] = None, level1: Optional[str] = None):
    """
    Returns the hierarchy of GAUL regions.
    If no params: returns list of countries.
    If country: returns list of level1 regions for that country.
    If country and level1: returns list of level2 regions for that level1 region.
    """
    from main import _require_gee
    _require_gee()
    
    try:
        if not country:
            if not _gaul_cache["countries"]:
                # The user requested to limit the countries to this specific list
                allowed_countries = [
                    "Rwanda", 
                    "Burundi", 
                    "Democratic Republic of the Congo", 
                    "Kenya", 
                    "Uganda"
                ]
                _gaul_cache["countries"] = sorted(allowed_countries)
            return {"regions": _gaul_cache["countries"]}
            
        if country and not level1:
            if country not in _gaul_cache["level1"]:
                fc = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.eq("ADM0_NAME", country))
                hist = fc.aggregate_histogram("ADM1_NAME")
                l1 = ee.Dictionary(hist).keys().getInfo()
                _gaul_cache["level1"][country] = sorted(l1)
            return {"regions": _gaul_cache["level1"][country]}
            
        if country and level1:
            cache_key = f"{country}_{level1}"
            if cache_key not in _gaul_cache["level2"]:
                fc = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
                    ee.Filter.And(
                        ee.Filter.eq("ADM0_NAME", country),
                        ee.Filter.eq("ADM1_NAME", level1)
                    )
                )
                hist = fc.aggregate_histogram("ADM2_NAME")
                l2 = ee.Dictionary(hist).keys().getInfo()
                _gaul_cache["level2"][cache_key] = sorted(l2)
            return {"regions": _gaul_cache["level2"][cache_key]}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching regions: {str(e)}")

@router.post("/upload")
async def upload_shapefile(file: UploadFile = File(...)):
    """
    Accepts a .zip shapefile, extracts it, reads it with geopandas,
    reprojects to EPSG:4326, and returns a GeoJSON FeatureCollection.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip shapefiles are supported.")
        
    tmp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(tmp_dir, "upload.zip")
    
    try:
        # Save zip
        with open(zip_path, "wb") as f:
            f.write(await file.read())
            
        # Extract zip
        extract_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # Find .shp file
        shp_file = None
        for root, dirs, files in os.walk(extract_dir):
            for filename in files:
                if filename.endswith(".shp"):
                    shp_file = os.path.join(root, filename)
                    break
        
        if not shp_file:
            raise HTTPException(status_code=400, detail="No .shp file found inside the zip.")
            
        # Read with geopandas
        gdf = gpd.read_file(shp_file)
        
        # Reproject to WGS84
        if gdf.crs is None or gdf.crs.to_string() != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")
            
        # Convert to GeoJSON
        geojson_str = gdf.to_json()
        geojson_dict = json.loads(geojson_str)
        
        return {"geojson": geojson_dict}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing shapefile: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

@router.get("/rwanda-hierarchy")
def get_rwanda_hierarchy():
    """
    Reads the local sectrstu/sector.shp and returns a nested dictionary of:
    { "ProvinceName": { "DistrictName": ["Sector1", "Sector2"] } }
    """
    global _rwanda_hierarchy
    if _rwanda_hierarchy is not None:
        return _rwanda_hierarchy

    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        shp_path = os.path.join(base_dir, "sectrstu", "sector.shp")
        
        if not os.path.exists(shp_path):
            raise HTTPException(status_code=404, detail="Rwanda sector shapefile not found.")

        gdf = gpd.read_file(shp_path)
        
        hierarchy = {}
        for _, row in gdf.iterrows():
            prov = row.get("REGION")
            dist = row.get("DISTR")
            sect = row.get("NOMSECT")
            
            if not prov or not dist or not sect:
                continue
                
            if prov not in hierarchy:
                hierarchy[prov] = {}
            if dist not in hierarchy[prov]:
                hierarchy[prov][dist] = []
            if sect not in hierarchy[prov][dist]:
                hierarchy[prov][dist].append(sect)
                
        # Sort everything alphabetically for the frontend
        sorted_hierarchy = {}
        for prov in sorted(hierarchy.keys()):
            sorted_hierarchy[prov] = {}
            for dist in sorted(hierarchy[prov].keys()):
                sorted_hierarchy[prov][dist] = sorted(hierarchy[prov][dist])
                
        _rwanda_hierarchy = sorted_hierarchy
        return _rwanda_hierarchy
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading Rwanda shapefile: {str(e)}")

