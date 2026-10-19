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

    def test_ssrf_safety_validation(self):
        from harvester import is_safe_url, assert_safe_url
        self.assertFalse(is_safe_url("http://localhost:8000/api"))
        self.assertFalse(is_safe_url("http://127.0.0.1:8000/"))
        self.assertFalse(is_safe_url("http://169.254.169.254/computeMetadata/v1/"))
        self.assertFalse(is_safe_url("http://metadata.google.internal/"))
        self.assertFalse(is_safe_url("http://10.0.0.5/secret"))
        self.assertFalse(is_safe_url("http://192.168.1.100/admin"))
        self.assertTrue(is_safe_url("https://waterportal.rwb.rw/"))
        self.assertTrue(is_safe_url("https://earth-search.aws.element84.com/v1"))

        with self.assertRaises(ValueError):
            assert_safe_url("http://169.254.169.254/secret")

    def test_sqlite_task_persistence(self):
        from harvester import HarvesterTaskStore, create_task, get_task
        task = create_task(action="save_to_portal", source_url="https://example.com/raster.tif", target_name="persistent_test")
        
        # Clear in-memory cache to force a reload from the SQLite DB
        HarvesterTaskStore._cache.clear()
        
        loaded = get_task(task.task_id)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.task_id, task.task_id)
        self.assertEqual(loaded.action, "save_to_portal")
        self.assertEqual(loaded.target_name, "persistent_test")

    def test_harvester_tasks_proxy(self):
        from harvester import HARVESTER_TASKS, create_task
        task = create_task(action="download", source_url="https://example.com/data.zip", target_name="proxy_test")
        self.assertIn(task.task_id, HARVESTER_TASKS)
        self.assertEqual(HARVESTER_TASKS.get(task.task_id).target_name, "proxy_test")

    def test_direct_file_protocol_mode(self):
        res = HarvesterScanner.scan_url("https://example.com/custom_layer?query=true", source_type="file")
        self.assertEqual(res["source_type"], "direct_file")
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["datasets"][0]["category"], "raster")

    def test_shapefile_package_manifest_inspection(self):
        import io, zipfile
        from unittest.mock import MagicMock
        
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("districts.shp", b"dummy shp")
            z.writestr("districts.shx", b"dummy shx")
            z.writestr("districts.dbf", b"dummy dbf")
            z.writestr("districts.prj", b"GEOGCS[\"GCS_WGS_1984\"...]")
            z.writestr("elevation.tif", b"dummy tiff")
            z.writestr("readme.txt", b"notes")
        buf.seek(0)

        mock_resp = MagicMock()
        mock_resp.headers = {}
        mock_resp.content = buf.getvalue()

        res = HarvesterScanner._parse_zip_source("https://example.com/dataset.zip", mock_resp)
        self.assertEqual(res["count"], 2)  # 1 shapefile package + 1 elevation.tif
        
        shp_pkg = next(d for d in res["datasets"] if d["format"] == "shp")
        self.assertEqual(shp_pkg["name"], "districts (Shapefile Package)")
        self.assertEqual(shp_pkg["internal_path"], "districts.shp")
        self.assertTrue(shp_pkg["has_prj"])
        self.assertIn("Projection (.prj) included", shp_pkg["description"])

        tif_ds = next(d for d in res["datasets"] if d["format"] == "tif")
        self.assertEqual(tif_ds["name"], "elevation.tif")

    def test_shapefile_missing_prj_warning(self):
        import io, zipfile
        from unittest.mock import MagicMock
        
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("rivers.shp", b"dummy shp")
            z.writestr("rivers.shx", b"dummy shx")
            z.writestr("rivers.dbf", b"dummy dbf")
        buf.seek(0)

        mock_resp = MagicMock()
        mock_resp.headers = {}
        mock_resp.content = buf.getvalue()

        res = HarvesterScanner._parse_zip_source("https://example.com/rivers.zip", mock_resp)
        self.assertEqual(res["count"], 1)
        shp_pkg = res["datasets"][0]
        self.assertFalse(shp_pkg["has_prj"])
        self.assertIn("missing", shp_pkg["description"].lower())


if __name__ == "__main__":
    unittest.main()

