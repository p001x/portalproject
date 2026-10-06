import os
import logging
import geopandas as gpd
import json

logger = logging.getLogger(__name__)

GDB_PATH = os.path.abspath(r"C:\Users\user\Documents\blacportal\dataset vector\CROM_Vector.gdb")

def get_district_vectors(district_name: str) -> dict:
    """Extracts official ground-truth vector layers from CROM_Vector.gdb for a given district.
    
    Returns:
        GeoJSON FeatureCollections for roads, national parks, forests, and sector metrics.
    """
    if not os.path.exists(GDB_PATH):
        logger.warning(f"CROM_Vector.gdb not found at {GDB_PATH}")
        return {"roads": None, "parks": None, "forests": None, "sectors": []}

    try:
        dist_clean = district_name.strip().upper()

        # 1. Load District Boundary to clip features
        dist_gdf = gpd.read_file(GDB_PATH, layer="District")
        dist_match = dist_gdf[dist_gdf["District"].str.upper() == dist_clean]
        
        if dist_match.empty:
            # Fallback to case-insensitive partial match
            dist_match = dist_gdf[dist_gdf["District"].str.upper().str.contains(dist_clean, na=False)]
            
        if dist_match.empty:
            logger.warning(f"District '{district_name}' not found in CROM_Vector District layer")
            dist_geom = None
        else:
            dist_geom = dist_match.iloc[0].geometry
            dist_poly = dist_match

        # 2. Roads clipped to district
        roads_geojson = None
        try:
            if dist_geom is not None:
                roads_gdf = gpd.read_file(GDB_PATH, layer="Road_Network", mask=dist_poly)
            else:
                roads_gdf = gpd.read_file(GDB_PATH, layer="Road_Network")
            
            if not roads_gdf.empty:
                roads_4326 = roads_gdf.to_crs(epsg=4326)
                # Simplify to reduce payload size (approx 100m)
                roads_4326.geometry = roads_4326.geometry.simplify(0.001)
                # Keep essential columns to keep payload fast
                cols = [c for c in ['Class', 'Status', 'minutes', 'Trajectory', 'geometry'] if c in roads_4326.columns]
                roads_geojson = json.loads(roads_4326[cols].to_json())
        except Exception as e:
            logger.error(f"Error loading Road_Network from CROM: {e}")

        # 3. National Parks intersecting district
        parks_geojson = None
        try:
            parks_gdf = gpd.read_file(GDB_PATH, layer="National_Parks_main")
            if not parks_gdf.empty:
                if dist_geom is not None:
                    # Filter parks intersecting the district
                    parks_in_dist = parks_gdf[parks_gdf.intersects(dist_geom)]
                else:
                    parks_in_dist = parks_gdf
                
                if not parks_in_dist.empty:
                    parks_4326 = parks_in_dist.to_crs(epsg=4326)
                    parks_4326["geometry"] = parks_4326.geometry.simplify(0.005)
                    cols = [c for c in ['NAME1_', 'NAME2', 'geometry'] if c in parks_4326.columns]
                    parks_geojson = json.loads(parks_4326[cols].to_json())
        except Exception as e:
            logger.error(f"Error loading National_Parks from CROM: {e}")

        # 4. Forest & Degraded Forest
        forests_geojson = None
        try:
            if dist_geom is not None:
                forest_gdf = gpd.read_file(GDB_PATH, layer="Forest", mask=dist_poly)
            else:
                forest_gdf = gpd.read_file(GDB_PATH, layer="Forest")
                
            if not forest_gdf.empty:
                forest_4326 = forest_gdf.to_crs(epsg=4326)
                forest_4326.geometry = forest_4326.geometry.simplify(0.005)
                cols = [c for c in ['Name', 'Category', 'Class', 'Canopy', 'Area_ha', 'geometry'] if c in forest_4326.columns]
                forests_geojson = json.loads(forest_4326[cols].to_json())
        except Exception as e:
            logger.error(f"Error loading Forest from CROM: {e}")

        # 5. Sector-level Poverty & Demographics
        sector_metrics = []
        try:
            sec_pov = gpd.read_file(GDB_PATH, layer="Sector_Poverty")
            if dist_geom is not None:
                sec_match = sec_pov[sec_pov["District"].str.upper() == dist_clean]
                if sec_match.empty:
                    sec_match = sec_pov[sec_pov["District"].str.upper().str.contains(dist_clean, na=False)]
            else:
                sec_match = sec_pov
                
            for _, row in sec_match.iterrows():
                poverty_val = row.get("Poverty_Headcount_Index", 0)
                try:
                    poverty_float = round(float(poverty_val), 1)
                except (ValueError, TypeError):
                    poverty_float = 0.0
                    
                risk_tier = "Critical" if poverty_float > 55 else "High" if poverty_float > 40 else "Moderate"
                intervention = (
                    "Deploy Clean Cookstoves (Tier 4) & Establish Energy Woodlot"
                    if poverty_float > 55
                    else "Agroforestry Expansion & Controlled Gathering Quotas"
                    if poverty_float > 40
                    else "Monitoring & Sustainable Forest Management"
                )
                
                sector_metrics.append({
                    "sector": str(row.get("Sector", "Unknown")),
                    "poverty_headcount_pct": poverty_float,
                    "poverty_level": str(row.get("Poverty_Level", "Medium")),
                    "risk_tier": risk_tier,
                    "recommended_intervention": intervention
                })
                
            sector_metrics.sort(key=lambda x: x["poverty_headcount_pct"], reverse=True)
        except Exception as e:
            logger.error(f"Error loading Sector_Poverty from CROM: {e}")

        return {
            "district": district_name,
            "roads": roads_geojson,
            "parks": parks_geojson,
            "forests": forests_geojson,
            "sectors": sector_metrics
        }
    except Exception as exc:
        logger.exception(f"Failed to extract CROM vectors: {exc}")
        return {"district": district_name, "roads": None, "parks": None, "forests": None, "sectors": []}
