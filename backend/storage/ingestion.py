import os
import json
import httpx
from pystac import Catalog, Item, Collection

def parse_url(url: str):
    """
    Given a URL, attempts to detect the type of data it points to.
    Returns a normalized tree structure for the frontend.
    """
    try:
        # First check if it's a direct file extension we know
        lower_url = url.lower()
        if lower_url.endswith('.geojson'):
            return {"type": "file", "format": "geojson", "url": url, "name": os.path.basename(url)}
        if lower_url.endswith('.tif') or lower_url.endswith('.tiff'):
            return {"type": "file", "format": "cog", "url": url, "name": os.path.basename(url)}
        if lower_url.endswith('.zip'):
            return {"type": "file", "format": "shapefile", "url": url, "name": os.path.basename(url)}
            
        # Attempt to fetch headers
        response = httpx.head(url, timeout=5.0)
        if response.status_code != 200:
            # Maybe HEAD is not supported, try GET with stream
            pass
            
        content_type = response.headers.get("Content-Type", "").lower()
        if "application/geo+json" in content_type or "application/json" in content_type:
            # Let's see if it's STAC or GeoJSON
            res = httpx.get(url, timeout=10.0)
            data = res.json()
            if "type" in data and data["type"] == "FeatureCollection":
                return {"type": "file", "format": "geojson", "url": url, "name": "FeatureCollection"}
                
            # Check for STAC
            stac_version = data.get("stac_version")
            if stac_version:
                return parse_stac(url, data)
                
            return {"type": "unknown_json", "data": data}
            
        if "xml" in content_type:
            if "wms" in lower_url or "wfs" in lower_url:
                return {"type": "service", "format": "wms/wfs", "url": url, "name": "OGC Web Service"}
                
        # Fallback
        return {"type": "unknown", "url": url}
        
    except Exception as e:
        return {"error": str(e), "url": url}

def parse_stac(url: str, data: dict):
    """Parse a STAC catalog/collection/item into a tree node."""
    node = {
        "type": "folder" if data.get("type") in ["Catalog", "Collection"] else "file",
        "format": "stac",
        "name": data.get("title") or data.get("id") or "STAC Node",
        "url": url,
        "children": []
    }
    
    if node["type"] == "folder":
        for link in data.get("links", []):
            if link.get("rel") in ["child", "item"]:
                child_url = link.get("href")
                if not child_url.startswith("http"):
                    # Resolve relative URLs
                    from urllib.parse import urljoin
                    child_url = urljoin(url, child_url)
                node["children"].append({
                    "type": "link",
                    "name": link.get("title") or child_url.split("/")[-1],
                    "url": child_url
                })
    elif node["type"] == "file":
        # It's an item, extract assets
        assets = []
        for key, asset in data.get("assets", {}).items():
            assets.append({
                "type": "asset",
                "name": key,
                "url": asset.get("href"),
                "content_type": asset.get("type")
            })
        node["assets"] = assets
        
    return node
