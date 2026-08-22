"""
Unit & Integration Tests for Universal Spatial Data Harvester.
"""
import unittest
import sys, os

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from harvester import HarvesterScanner, HarvesterTransferManager, create_task, get_task, update_task


class TestHarvester(unittest.TestCase):

    def test_categorize_format(self):
        self.assertEqual(HarvesterScanner._categorize_format("https://example.com/data.tif", "data.tif")[0], "raster")
        self.assertEqual(HarvesterScanner._categorize_format("https://example.com/boundary.geojson", "boundary.geojson")[0], "vector")
        self.assertEqual(HarvesterScanner._categorize_format("https://example.com/layers.zip", "layers.zip")[0], "archive")
        self.assertEqual(HarvesterScanner._categorize_format("https://example.com/table.csv", "table.csv")[0], "tabular")

    def test_html_page_scanner(self):
        html_sample = """
        <html>
          <head><title>Rwanda Spatial Open Data</title></head>
          <body>
            <h1>Downloads</h1>
            <a href="/layers/wetlands_2023.geojson">Rwanda Wetlands 2023 GeoJSON</a>
            <a href="https://example.org/rasters/kigali_dem.tif">Kigali DEM GeoTIFF</a>
            <a href="/shapes/districts.zip">District Boundaries Shapefile</a>
            <a href="https://google.com">Search Engine</a>
          </body>
        </html>
        """
        res = HarvesterScanner._parse_html_page("https://geodata.gov.rw/portal", html_sample)
        self.assertEqual(res["count"], 3)
        self.assertEqual(res["title"], "Rwanda Spatial Open Data")
        names = [d["name"] for d in res["datasets"]]
        self.assertIn("Rwanda Wetlands 2023 GeoJSON", names)
        self.assertIn("Kigali DEM GeoTIFF", names)
        self.assertIn("District Boundaries Shapefile", names)

    def test_stac_item_scanner(self):
        stac_item = {
            "type": "Feature",
            "stac_version": "1.0.0",
            "id": "S2A_36MBE_20240115_0_L2A",
            "assets": {
                "B02": {"href": "https://sentinel-cogs.s3.amazonaws.com/B02.tif", "title": "Blue Band", "type": "image/tiff; application=geotiff; profile=cloud-optimized"},
                "B04": {"href": "https://sentinel-cogs.s3.amazonaws.com/B04.tif", "title": "Red Band", "type": "image/tiff; application=geotiff; profile=cloud-optimized"},
                "B08": {"href": "https://sentinel-cogs.s3.amazonaws.com/B08.tif", "title": "NIR Band", "type": "image/tiff; application=geotiff; profile=cloud-optimized"},
                "visual": {"href": "https://sentinel-cogs.s3.amazonaws.com/TCI.tif", "title": "True Color Image", "type": "image/tiff; application=geotiff"},
            }
        }
        res = HarvesterScanner._parse_json_source("https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A", stac_item)
        self.assertEqual(res["count"], 4)
        self.assertEqual(res["source_type"], "stac_item")
        categories = [d["category"] for d in res["datasets"]]
        self.assertTrue(all(c == "raster" for c in categories))

    def test_geojson_scanner(self):
        geojson_data = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [30.0, -1.9]}, "properties": {"class": "Forest"}},
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [30.1, -1.95]}, "properties": {"class": "Water"}},
            ]
        }
        res = HarvesterScanner._parse_json_source("https://example.com/rwanda_samples.geojson", geojson_data)
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["source_type"], "geojson")
        self.assertEqual(res["datasets"][0]["category"], "vector")
        self.assertEqual(res["datasets"][0]["feature_count"], 2)

    def test_harvester_task_lifecycle(self):
        task = create_task(action="push_to_gee", source_url="https://example.com/test.tif", target_name="test_asset")
        self.assertEqual(task.status, "pending")
        self.assertEqual(task.progress, 0)
        
        update_task(task.task_id, status="in_progress", progress=50, message="Uploading...")
        t = get_task(task.task_id)
        self.assertEqual(t.status, "in_progress")
        self.assertEqual(t.progress, 50)
        
        update_task(task.task_id, status="completed", progress=100, message="Done!", result_data={"asset_id": "projects/my-proj/assets/test_asset"})
        t = get_task(task.task_id)
        self.assertEqual(t.status, "completed")
        self.assertEqual(t.progress, 100)
        self.assertEqual(t.result_data["asset_id"], "projects/my-proj/assets/test_asset")


if __name__ == "__main__":
    unittest.main()
