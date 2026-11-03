import json
import os
from storage.courses_storage import COURSES_METADATA_KEY
from storage.dataset_storage import _get_client

LOCAL_FALLBACK_FILE = os.path.join(os.path.dirname(__file__), "storage", "local_courses_metadata.json")

DEFAULT_COURSES = [
    {
        "id": "c1",
        "title": "QGIS Full Course for Beginners",
        "description": "Master GIS Mapping & Analysis for Free! Perfect for complete beginners.",
        "detailedDescription": "This comprehensive tutorial covers the entire GIS workflow, including data installation, vector and raster layers, symbology, spatial analysis, and map layout creation.",
        "videos": [
            {
                "id": "v1_1",
                "title": "Part 1: Learn GIS - QGIS Full Course",
                "youtubeId": "SovdBaus7pM",
                "duration": "45m"
            },
            {
                "id": "v1_2",
                "title": "Part 2: Geoprocessing & Spatial Analysis",
                "youtubeId": "pGm7w-LywO0",
                "duration": "30m"
            }
        ],
        "duration": "1h 15m",
        "level": "Beginner",
        "completed": False
    },
    {
        "id": "c2",
        "title": "Google Earth Engine Fundamentals",
        "description": "Learn to use Google Earth Engine for planetary-scale geospatial analysis.",
        "detailedDescription": "Official Google Earth Engine training covering authentication, the Code Editor, satellite image collections, spatial reducers, and data visualization.",
        "videos": [
            {
                "id": "v2_1",
                "title": "Part 1: Earth Engine 101 Basics",
                "youtubeId": "I-wFYm4Hnhg",
                "duration": "35m"
            },
            {
                "id": "v2_2",
                "title": "Part 2: Image Collections & Reducers",
                "youtubeId": "_Ff8_dME2Gc",
                "duration": "40m"
            }
        ],
        "duration": "1h 15m",
        "level": "Intermediate",
        "completed": False
    },
    {
        "id": "c3",
        "title": "PostGIS & Spatial SQL Crash Course",
        "description": "Manage and query spatial databases like a pro using PostGIS.",
        "detailedDescription": "A complete guide to Spatial SQL. Learn how to set up PostgreSQL with PostGIS, query geometries, calculate spatial intersections, buffers, and distances on massive datasets.",
        "videos": [
            {
                "id": "v3_1",
                "title": "Part 1: PostGIS for Newbies",
                "youtubeId": "vmbNpre02hk",
                "duration": "30m"
            },
            {
                "id": "v3_2",
                "title": "Part 2: PostGIS Architecture & Advanced Joins",
                "youtubeId": "FKzw9HJ6XYA",
                "duration": "25m"
            }
        ],
        "duration": "55m",
        "level": "Advanced",
        "completed": False
    },
    {
        "id": "c4",
        "title": "Web Mapping with Leaflet & GeoJSON",
        "description": "Build interactive web maps from scratch using Leaflet.js.",
        "detailedDescription": "Take your maps to the web! Learn the fundamentals of Leaflet, markers, GeoJSON data loading, circles, polygons, and interactive popups.",
        "videos": [
            {
                "id": "v4_1",
                "title": "Part 1: Leaflet Basics & Map Markers",
                "youtubeId": "ls_Eue1xUtY",
                "duration": "25m"
            },
            {
                "id": "v4_2",
                "title": "Part 2: Circles, Polygons & Popups",
                "youtubeId": "OYjFR_CGV8o",
                "duration": "20m"
            }
        ],
        "duration": "45m",
        "level": "Beginner",
        "completed": False
    }
]

def load_courses():
    client = _get_client()
    try:
        if client.exists(COURSES_METADATA_KEY):
            raw = client.download_as_text(COURSES_METADATA_KEY)
            return json.loads(raw)
    except Exception:
        pass
        
    try:
        if os.path.exists(LOCAL_FALLBACK_FILE):
            with open(LOCAL_FALLBACK_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
        
    return DEFAULT_COURSES

def save_courses(records):
    client = _get_client()
    data_str = json.dumps(records, indent=2)
    try:
        client.upload_from_text(COURSES_METADATA_KEY, data_str)
    except Exception:
        pass
    
    try:
        with open(LOCAL_FALLBACK_FILE, 'w') as f:
            f.write(data_str)
    except Exception:
        pass

# Initialize defaults if not exists, or replace existing for the new schema
save_courses(DEFAULT_COURSES)
print("Updated courses successfully.")
