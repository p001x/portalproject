"""Rwanda GeoPortal — Flask backend."""
import io
import json
import logging
import os
import threading
from typing import Optional

from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from pydantic import BaseModel, Field, ValidationError

from gee.auth import initialize_gee, authenticate_individual, verify_individual_session, logout_individual
from gee.ndvi import RWANDA_DISTRICTS, compute_ndvi
from gee.lst import compute_lst
from gee.rusle import compute_rusle
from gee.slope import compute_slope
from gee.landfill import compute_landfill_suitability
from gee.landslide import (
    compute_landslide_map, compute_landslide_stats,
    compute_landslide_classify, compute_landslide_export,
    compute_landslide_susceptibility,
)
from gee.drought import compute_agricultural_drought
from gee.flood import compute_flood_susceptibility

from storage.dataset_storage import (
    load_metadata, delete_record, download_dataset_bytes,
    process_and_store_upload, process_and_store_link,
    build_zip_of_datasets, datasets_intersecting,
)
from storage.samples_storage import (
    load_samples, add_sample, delete_sample, samples_to_geojson, TrainingSample,
)
from reports.report_builder import build_report

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

# ── GEE state ───────────────────────────────────────────────────────────────
_gee_ready = False
_gee_error = None

def _init_gee_background() -> None:
    global _gee_ready, _gee_error
    try:
        initialize_gee()
        _gee_ready = True
        logger.info("GEE Initialization successful.")
    except Exception as exc:
        _gee_error = str(exc)
        logger.critical("GEE initialization failed: %s", exc)

def _require_gee():
    if _gee_error:
        return jsonify({"detail": f"GEE initialization failed: {_gee_error}"}), 503
    if not _gee_ready:
        return jsonify({"detail": "GEE is still initializing — please retry in ~30 seconds."}), 503
    return None

# ── App ──────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# Fallback to load secret if not in env
key = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
if not key:
    try:
        key_path = os.path.join(os.path.dirname(__file__), "gee_key.json")
        with open(key_path, "r") as f:
            content = f.read()
            os.environ["GEE_SERVICE_ACCOUNT_KEY"] = content.strip()
    except Exception as e:
        logger.warning(f"Failed to load GEE service account key: {e}")

# Load Kaggle token from .env (so it is never visible in frontend code)
if not os.environ.get("KAGGLE_API_TOKEN"):
    try:
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("KAGGLE_API_TOKEN="):
                    os.environ["KAGGLE_API_TOKEN"] = line.split("=", 1)[1].strip()
                    break
    except Exception as e:
        logger.warning(f"Failed to load Kaggle token from .env: {e}")

logger.info("Starting GEE initialization in background thread...")
threading.Thread(target=_init_gee_background, daemon=True).start()

# ── Meta ─────────────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    if _gee_error:
        return jsonify({"detail": _gee_error}), 503
    if not _gee_ready:
        return jsonify({"status": "initializing", "message": "GEE is starting up, retry in ~30 s"})
    return jsonify({"status": "ok", "version": "2.0.0"})

@app.route("/api/admin/verify", methods=["POST"])
def admin_verify():
    """No-password admin access — returns ok immediately."""
    return jsonify({"ok": True})

@app.route("/api/districts", methods=["GET"])
def get_districts():
    return jsonify({"districts": RWANDA_DISTRICTS})

@app.route("/api/aoi/upload", methods=["POST"])
def upload_aoi_shapefile():
    import tempfile, zipfile, shutil
    import geopandas as gpd
    if "file" not in request.files:
        return jsonify({"detail": "No file uploaded."}), 400
    file = request.files["file"]
    if not file.filename.endswith(".zip"):
        return jsonify({"detail": "Only .zip shapefiles are supported."}), 400
        
    tmp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(tmp_dir, "upload.zip")
    try:
        file.save(zip_path)
        extract_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        shp_file = None
        for root, dirs, files in os.walk(extract_dir):
            for filename in files:
                if filename.endswith(".shp"):
                    shp_file = os.path.join(root, filename)
                    break
        if not shp_file:
            return jsonify({"detail": "No .shp file found inside the zip."}), 400
        gdf = gpd.read_file(shp_file)
        if gdf.crs is None or gdf.crs.to_string() != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")
        geojson_str = gdf.to_json()
        geojson_dict = json.loads(geojson_str)
        return jsonify({"geojson": geojson_dict})
    except Exception as e:
        logger.exception("Error processing shapefile upload")
        return jsonify({"detail": f"Error processing shapefile: {str(e)}"}), 500
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

# ── Models ─────────────────────────────────────────────────────────
class NDVIRequest(BaseModel):
    district: str
    start_date: str
    end_date: str
    n_classes: int = 5

class LSTRequest(BaseModel):
    district: str
    start_date: str
    end_date: str
    n_classes: int = 5

class RUSLERequest(BaseModel):
    district: str
    year: int = 2023
    n_classes: int = 5
    reverse_r: bool = False
    reverse_k: bool = False
    reverse_ls: bool = False
    reverse_c: bool = False
    reverse_p: bool = False

class SlopeRequest(BaseModel):
    district: str
    n_classes: int = 5

class LandfillRequest(BaseModel):
    district: str
    n_classes: int = 5
    reverse_river: bool = False
    reverse_residential: bool = False
    reverse_slope: bool = False
    reverse_road: bool = False
    reverse_lulc: bool = False
    custom_weights: Optional[dict] = None

class AirPollutionRequest(BaseModel):
    district: str
    start_date: str
    end_date: str
    n_classes: int = 5

class LandslideRequest(BaseModel):
    district: str
    start_year: int = 2015
    end_year: int = 2024
    n_classes: int = 5
    reverse_slope: bool = False
    reverse_rainfall: bool = False
    reverse_litho: bool = False
    reverse_soiltype: bool = False
    reverse_landcover: bool = False
    reverse_twi: bool = False
    reverse_dist: bool = False

class UHIRequest(BaseModel):
    district: str
    start_date: str
    end_date: str
    grid_size: int = 6

class DroughtRequest(BaseModel):
    district: str
    year: int = 2023
    n_classes: int = 5
    reverse_sm: bool = False
    reverse_rf: bool = False
    reverse_ndvi: bool = False
    reverse_vci: bool = False
    reverse_lst: bool = False
    reverse_cdd: bool = False
    reverse_evi: bool = False

class FloodRequest(BaseModel):
    district: str
    start_year: int = 2015
    end_year: int = 2024
    n_classes: int = 5
    reverse_rainfall: bool = False
    reverse_twi: bool = False
    reverse_lulc: bool = False
    reverse_elevation: bool = False
    reverse_slope: bool = False
    reverse_river_dist: bool = False
    reverse_road_dist: bool = False
    reverse_soil_type: bool = False
    reverse_drainage_density: bool = False
    reverse_ndvi: bool = False
    custom_weights: Optional[dict] = None

class ReportRequest(BaseModel):
    module_name: str
    district: str
    date_range: str
    stats: dict
    class_areas: dict
    extra_notes: str = ""
    maps: list[tuple[str, str]] = None

# ── Analysis Endpoints ─────────────────────────────────────────────────────────

@app.route("/api/report", methods=["POST"])
def generate_report():
    try:
        req = ReportRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    
    try:
        pdf_bytes = build_report(
            module_name=req.module_name,
            district=req.district,
            date_range=req.date_range,
            stats=req.stats,
            class_areas=req.class_areas,
            extra_notes=req.extra_notes,
            maps=req.maps,
        )
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment;filename={req.module_name.replace(' ', '_')}_Report.pdf"}
        )
    except Exception as e:
        logger.exception("Report generation failed")
        return jsonify({"detail": str(e)}), 500

@app.route("/api/ndvi", methods=["POST"])
def ndvi_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = NDVIRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_ndvi(req.district, req.start_date, req.end_date, req.n_classes)
        return jsonify(res)
    except Exception as exc:
        logger.exception("NDVI failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/lst", methods=["POST"])
def lst_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = LSTRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_lst(req.district, req.start_date, req.end_date, req.n_classes)
        return jsonify(res)
    except Exception as exc:
        logger.exception("LST failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/rusle", methods=["POST"])
def rusle_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = RUSLERequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_rusle(
            req.district, req.year, req.n_classes,
            req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("RUSLE failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/slope", methods=["POST"])
def slope_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = SlopeRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_slope(req.district, req.n_classes)
        return jsonify(res)
    except Exception as exc:
        logger.exception("Slope failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landfill", methods=["POST"])
def landfill_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = LandfillRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_landfill_suitability(
            req.district, req.reverse_river, req.reverse_residential,
            req.reverse_slope, req.reverse_road, req.reverse_lulc, req.n_classes,
            custom_weights=req.custom_weights
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landfill failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/air-pollution", methods=["POST"])
def air_pollution_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = AirPollutionRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_no2(req.district, req.start_date, req.end_date, req.n_classes)
        return jsonify(res)
    except Exception as exc:
        logger.exception("Air pollution failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landslide", methods=["POST"])
def landslide_endpoint():
    err = _require_gee()
    if err: return err
    try:
        data = request.json or {}
        aoi = data.get("aoi") or data.get("district") or "Musanze"
        res = compute_landslide_susceptibility(
            aoi, data.get("start_year", 2019), data.get("end_year", 2024), data.get("n_classes", 5),
            data.get("reverse_slope", False), data.get("reverse_rainfall", False), data.get("reverse_litho", False),
            data.get("reverse_soiltype", False), data.get("reverse_landcover", False), data.get("reverse_twi", False),
            data.get("reverse_dist", False), data.get("custom_palettes", {})
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landslide failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landslide/map", methods=["POST"])
def landslide_map_endpoint():
    err = _require_gee()
    if err: return err
    try:
        data = request.json or {}
        aoi = data.get("aoi") or data.get("district") or "Musanze"
        res = compute_landslide_map(
            aoi, data.get("start_year", 2019), data.get("end_year", 2024), data.get("n_classes", 5),
            data.get("reverse_slope", False), data.get("reverse_rainfall", False), data.get("reverse_litho", False),
            data.get("reverse_soiltype", False), data.get("reverse_landcover", False), data.get("reverse_twi", False),
            data.get("reverse_dist", False), data.get("custom_palettes", {})
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landslide map failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landslide/stats", methods=["POST"])
def landslide_stats_endpoint():
    err = _require_gee()
    if err: return err
    try:
        data = request.json or {}
        aoi = data.get("aoi") or data.get("district") or "Musanze"
        res = compute_landslide_stats(
            aoi, data.get("start_year", 2019), data.get("end_year", 2024),
            data.get("reverse_slope", False), data.get("reverse_rainfall", False), data.get("reverse_litho", False),
            data.get("reverse_soiltype", False), data.get("reverse_landcover", False), data.get("reverse_twi", False),
            data.get("reverse_dist", False)
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landslide stats failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landslide/classify", methods=["POST"])
def landslide_classify_endpoint():
    err = _require_gee()
    if err: return err
    try:
        data = request.json or {}
        aoi = data.get("aoi") or data.get("district") or "Musanze"
        res = compute_landslide_classify(
            aoi, data.get("start_year", 2019), data.get("end_year", 2024), data.get("n_classes", 5),
            data.get("reverse_slope", False), data.get("reverse_rainfall", False), data.get("reverse_litho", False),
            data.get("reverse_soiltype", False), data.get("reverse_landcover", False), data.get("reverse_twi", False),
            data.get("reverse_dist", False)
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landslide classify failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/landslide/export", methods=["POST"])
def landslide_export_endpoint():
    err = _require_gee()
    if err: return err
    try:
        data = request.json or {}
        aoi = data.get("aoi") or data.get("district") or "Musanze"
        res = compute_landslide_export(
            aoi, data.get("start_year", 2019), data.get("end_year", 2024),
            data.get("reverse_slope", False), data.get("reverse_rainfall", False), data.get("reverse_litho", False),
            data.get("reverse_soiltype", False), data.get("reverse_landcover", False), data.get("reverse_twi", False),
            data.get("reverse_dist", False), data.get("custom_palettes", {})
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Landslide export failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/uhi", methods=["POST"])
def uhi_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = UHIRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_uhi(req.district, req.start_date, req.end_date, req.grid_size)
        return jsonify(res)
    except Exception as exc:
        logger.exception("UHI failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/drought", methods=["POST"])
def drought_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = DroughtRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_agricultural_drought(
            req.district, req.year, req.n_classes,
            req.reverse_sm, req.reverse_rf, req.reverse_ndvi,
            req.reverse_vci, req.reverse_lst, req.reverse_cdd, req.reverse_evi
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Drought failed")
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/flood", methods=["POST"])
def flood_endpoint():
    err = _require_gee()
    if err: return err
    try:
        req = FloodRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
    if req.district not in RWANDA_DISTRICTS:
        return jsonify({"detail": f"Unknown district '{req.district}'."}), 400
    try:
        res = compute_flood_susceptibility(
            req.district, req.start_year, req.end_year, req.n_classes,
            req.reverse_rainfall, req.reverse_twi, req.reverse_lulc,
            req.reverse_elevation, req.reverse_slope, req.reverse_river_dist,
            req.reverse_road_dist, req.reverse_soil_type,
            req.reverse_drainage_density, req.reverse_ndvi,
            custom_weights=req.custom_weights
        )
        return jsonify(res)
    except Exception as exc:
        logger.exception("Flood failed")
        return jsonify({"detail": str(exc)}), 500

# ── GEE Individual Authentication ───────────────────────────────────────────

@app.route("/api/gee/individual-auth", methods=["POST"])
def gee_individual_auth():
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email", "").strip()
    try:
        result = authenticate_individual(email)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"detail": str(e)}), 400

@app.route("/api/gee/individual-auth/status", methods=["GET"])
def gee_individual_auth_status():
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if session:
        return jsonify({"authenticated": True, "email": session["email"], "authenticated_at": session["authenticated_at"]})
    return jsonify({"authenticated": False}), 401

@app.route("/api/gee/individual-auth/logout", methods=["POST"])
def gee_individual_auth_logout():
    token = request.headers.get("X-GEE-Token")
    ok = logout_individual(token or "")
    return jsonify({"ok": ok})

# ── RARE DATA — Dataset Repository ─────────────────────────────────────────

@app.route("/api/datasets", methods=["GET"])
def list_datasets():
    source = request.args.get("source", "admin")
    if source not in ("admin", "community"):
        return jsonify({"detail": "Invalid source"}), 400
    return jsonify({"records": load_metadata(source=source)})

@app.route("/api/datasets/upload", methods=["POST"])
def upload_dataset():
    source = request.form.get("source", "admin")
    if source not in ("admin", "community"):
        return jsonify({"detail": "source must be 'admin' or 'community'"}), 400
    
    if source == "admin":
        pwd = request.headers.get("X-Admin-Password")
        if pwd != os.environ.get("ADMIN_PASSWORD", "admin123"):
            return jsonify({"detail": "Unauthorized. Admin password required."}), 401
    
    file = request.files.get("file")
    if not file:
        return jsonify({"detail": "file missing"}), 400
        
    name = request.form.get("name")
    if not name:
        return jsonify({"detail": "name missing"}), 400
        
    description = request.form.get("description", "")
    contributor = request.form.get("contributor")
    
    file_bytes = file.read()
    record = process_and_store_upload(
        filename=file.filename or "upload",
        file_bytes=file_bytes,
        name=name,
        description=description,
        source=source,
        contributor=contributor,
    )
    return jsonify(record.to_dict())

class DatasetLinkRequest(BaseModel):
    url: str
    name: str
    description: str = ""
    source: str = "admin"
    contributor: Optional[str] = None

@app.route("/api/datasets/link", methods=["POST"])
def add_dataset_link():
    try:
        req = DatasetLinkRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
        
    if req.source not in ("admin", "community"):
        return jsonify({"detail": "source must be 'admin' or 'community'"}), 400
        
    if req.source == "admin":
        pwd = request.headers.get("X-Admin-Password")
        if pwd != os.environ.get("ADMIN_PASSWORD", "admin123"):
            return jsonify({"detail": "Unauthorized. Admin password required."}), 401
            
    record = process_and_store_link(
        url=req.url, name=req.name, description=req.description,
        source=req.source, contributor=req.contributor,
    )
    return jsonify(record.to_dict())

@app.route("/api/datasets/<dataset_id>/download", methods=["GET"])
def download_dataset(dataset_id):
    source = request.args.get("source", "admin")
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        return jsonify({"detail": "Dataset not found"}), 404
    try:
        file_bytes = download_dataset_bytes(record["storage_key"])
    except Exception as exc:
        return jsonify({"detail": f"Could not fetch file: {exc}"}), 500
    
    return Response(
        file_bytes,
        mimetype="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{record.get("original_filename", "download")}"'}
    )

@app.route("/api/datasets/<dataset_id>", methods=["DELETE"])
def delete_dataset(dataset_id):
    source = request.args.get("source", "admin")
    
    if source == "admin":
        pwd = request.headers.get("X-Admin-Password")
        if pwd != os.environ.get("ADMIN_PASSWORD", "admin123"):
            return jsonify({"detail": "Unauthorized. Admin password required."}), 401
            
    ok = delete_record(dataset_id, source=source)
    if not ok:
        return jsonify({"detail": "Dataset not found"}), 404
    return jsonify({"ok": True})

@app.route("/api/datasets/download-all", methods=["GET"])
def download_all_datasets():
    source = request.args.get("source", "admin")
    records = load_metadata(source=source)
    zip_bytes = build_zip_of_datasets(records)
    return Response(
        zip_bytes,
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{source}_all_datasets.zip"'}
    )

@app.route("/api/datasets/<dataset_id>/clip", methods=["POST"])
def clip_dataset(dataset_id):
    source = request.args.get("source", "admin")
    mask_geojson = request.json.get("mask")
    if not mask_geojson:
        return jsonify({"detail": "Missing mask GeoJSON"}), 400
        
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        return jsonify({"detail": "Dataset not found"}), 404
        
    try:
        from storage.dataset_storage import download_dataset_bytes, clip_dataset_by_mask
        file_bytes = download_dataset_bytes(record["storage_key"])
        clipped_bytes, new_filename = clip_dataset_by_mask(record, file_bytes, mask_geojson)
    except Exception as exc:
        return jsonify({"detail": f"Could not clip file: {exc}"}), 500
        
    return Response(
        clipped_bytes,
        mimetype="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{new_filename}"'}
    )

@app.route("/api/datasets/<dataset_id>/preview", methods=["GET"])
def preview_dataset(dataset_id):
    source = request.args.get("source", "admin")
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        return jsonify({"detail": "Dataset not found"}), 404
        
    try:
        from storage.dataset_storage import download_dataset_bytes, get_dataset_preview, LINK_KEY_PREFIX
        from storage.link_resolver import resolve_link
        if record["storage_key"].startswith(LINK_KEY_PREFIX):
            raw_url = record["storage_key"].replace(LINK_KEY_PREFIX, "", 1)
            file_bytes, _, _ = resolve_link(raw_url, max_mb=500.0)
        else:
            file_bytes = download_dataset_bytes(record["storage_key"])
        preview_data = get_dataset_preview(record, file_bytes)
    except Exception as exc:
        print(f"Preview failed for dataset {dataset_id}: {exc}")
        import traceback
        traceback.print_exc()
        # Fall back to bbox preview when full preview fails (e.g. remote TIFFs)
        bbox = record.get("bbox")
        if bbox and len(bbox) == 4:
            minx, miny, maxx, maxy = bbox
            return jsonify({
                "type": "bbox",
                "bounds": [[miny, minx], [maxy, maxx]],
                "name": record.get("name", ""),
                "file_type": record.get("file_type", ""),
            })
        return jsonify({"detail": f"Could not preview file: {exc}"}), 500
        
    return jsonify(preview_data)


@app.route("/api/datasets/<dataset_id>/bbox", methods=["GET"])
def dataset_bbox(dataset_id):
    """Lightweight endpoint – returns stored bbox without downloading the file."""
    source = request.args.get("source", "admin")
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        return jsonify({"detail": "Dataset not found"}), 404
    bbox = record.get("bbox")
    if not bbox or len(bbox) != 4:
        return jsonify({"detail": "No bounding box stored for this dataset"}), 404
    minx, miny, maxx, maxy = bbox
    return jsonify({
        "type": "bbox",
        "bounds": [[miny, minx], [maxy, maxx]],
        "name": record.get("name", ""),
        "file_type": record.get("file_type", ""),
    })


# ── Sample Digitization ─────────────────────────────────────────────────────

class SampleCreateRequest(BaseModel):
    geometry: dict
    class_label: str
    source_filename: str = "manual"
    source_url: str = ""
    creator: str = "anonymous"
    color: str = "#0F6E4F"

@app.route("/api/samples", methods=["GET"])
def list_samples():
    return jsonify({"samples": load_samples()})

@app.route("/api/samples", methods=["POST"])
def create_sample():
    try:
        req = SampleCreateRequest(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400
        
    import uuid as _uuid
    sample = TrainingSample(
        id=_uuid.uuid4().hex,
        geometry=req.geometry,
        class_label=req.class_label,
        source_filename=req.source_filename,
        source_url=req.source_url,
        creator=req.creator,
        color=req.color,
    )
    res = add_sample(sample)
    return jsonify(res.dict() if hasattr(res, 'dict') else res)

@app.route("/api/samples/<sample_id>", methods=["DELETE"])
def delete_sample_endpoint(sample_id):
    ok = delete_sample(sample_id)
    if not ok:
        return jsonify({"detail": "Sample not found"}), 404
    return jsonify({"ok": True})

@app.route("/api/samples/batch", methods=["POST"])
def batch_save_samples():
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if not session:
        return jsonify({"detail": "GEE authentication required."}), 401
    data = request.get_json(force=True, silent=True) or {}
    raw_samples = data.get("samples", [])
    dataset_name = data.get("dataset_name", "batch")
    creator = data.get("creator") or session.get("email", "anonymous")
    saved = 0
    import uuid as _uuid
    for s in raw_samples:
        try:
            sample = TrainingSample(
                id=_uuid.uuid4().hex,
                geometry=s.get("geometry", {}),
                class_label=s.get("class_label", "unknown"),
                source_filename=dataset_name,
                source_url=s.get("source_url", ""),
                creator=creator,
                color=s.get("color", "#0F6E4F"),
            )
            add_sample(sample)
            saved += 1
        except Exception:
            pass
    return jsonify({"ok": True, "saved_count": saved, "dataset_name": dataset_name, "message": f"Saved {saved} samples."})

@app.route("/api/samples/ingest-url", methods=["POST"])
def ingest_url_samples():
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if not session:
        return jsonify({"detail": "GEE authentication required."}), 401
    data = request.get_json(force=True, silent=True) or {}
    url = data.get("url", "")
    class_label = data.get("class_label", "unknown")
    creator = data.get("creator") or session.get("email", "anonymous")
    if not url:
        return jsonify({"detail": "url is required"}), 400
    try:
        from storage.link_resolver import resolve_link
        file_bytes, filename, _ = resolve_link(url, max_mb=200.0)
        import json as _json, uuid as _uuid
        try:
            geojson = _json.loads(file_bytes)
        except Exception:
            return jsonify({"detail": "URL must point to a GeoJSON file."}), 400
        features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]
        imported = 0
        for f in features:
            try:
                lbl = f.get("properties", {}).get("class_label") or class_label
                col = f.get("properties", {}).get("color", "#3b82f6")
                sample = TrainingSample(
                    id=_uuid.uuid4().hex,
                    geometry=f.get("geometry", f),
                    class_label=lbl,
                    source_filename=filename,
                    source_url=url,
                    creator=creator,
                    color=col,
                )
                add_sample(sample)
                imported += 1
            except Exception:
                pass
        return jsonify({"imported_count": imported, "info": {"filename": filename}})
    except Exception as exc:
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/samples/import-from-dataset", methods=["POST"])
def import_samples_from_dataset():
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if not session:
        return jsonify({"detail": "GEE authentication required."}), 401
    data = request.get_json(force=True, silent=True) or {}
    dataset_id = data.get("dataset_id", "")
    source = data.get("source", "admin")
    class_label = data.get("class_label", "unknown")
    creator = data.get("creator") or session.get("email", "anonymous")
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        return jsonify({"detail": "Dataset not found"}), 404
    try:
        file_bytes = download_dataset_bytes(record["storage_key"])
        import json as _json, uuid as _uuid
        geojson = _json.loads(file_bytes)
        features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]
        imported = 0
        dataset_name = record.get("name", "dataset")
        for f in features:
            try:
                lbl = f.get("properties", {}).get("class_label") or class_label
                col = f.get("properties", {}).get("color", "#3b82f6")
                sample = TrainingSample(
                    id=_uuid.uuid4().hex,
                    geometry=f.get("geometry", f),
                    class_label=lbl,
                    source_filename=dataset_name,
                    source_url="",
                    creator=creator,
                    color=col,
                )
                add_sample(sample)
                imported += 1
            except Exception:
                pass
        return jsonify({"imported_count": imported, "dataset_name": dataset_name})
    except Exception as exc:
        return jsonify({"detail": str(exc)}), 500

@app.route("/api/gee/preview-imagery", methods=["POST"])
def gee_preview_imagery():
    err = _require_gee()
    if err: return err
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if not session:
        return jsonify({"detail": "GEE authentication required."}), 401
    data = request.get_json(force=True, silent=True) or {}
    aoi_bounds = data.get("aoi_bounds")  # [minx, miny, maxx, maxy]
    data_source = data.get("data_source", "sentinel2")
    custom_asset_id = data.get("custom_asset_id")
    try:
        import ee
        if aoi_bounds and len(aoi_bounds) == 4:
            aoi = ee.Geometry.Rectangle(aoi_bounds)
        else:
            aoi = None
        if data_source == "sentinel2":
            img = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
                .filterDate("2023-01-01", "2024-01-01") \
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20)) \
                .select(["B4", "B3", "B2"]).median().visualize(min=0, max=3000)
        elif data_source == "landsat8":
            img = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2") \
                .filterDate("2023-01-01", "2024-01-01") \
                .select(["SR_B4", "SR_B3", "SR_B2"]).median() \
                .multiply(0.0000275).add(-0.2).clamp(0, 1).multiply(255).byte() \
                .visualize(min=0, max=255)
        elif data_source == "custom" and custom_asset_id:
            img = ee.Image(custom_asset_id).visualize()
        else:
            return jsonify({"detail": f"Unknown data_source: {data_source}"}), 400
        if aoi:
            img = img.clip(aoi)
        map_id = img.getMapId({})
        return jsonify({"tile_url": map_id["tile_fetcher"].url_format})
    except Exception as exc:
        logger.exception("GEE preview-imagery failed")
        return jsonify({"detail": str(exc)}), 500


# ── Timelapse tile (Sentinel-2 / Landsat / GEDI) ────────────────────────────
_GEDI_START = 2019

def _gedi_date_range(year: int, mode: str, window: int):
    if year < _GEDI_START:
        year = _GEDI_START
    if mode == "single":
        start_year = year
    elif mode == "rolling":
        start_year = max(_GEDI_START, year - window + 1)
    else:  # cumulative
        start_year = _GEDI_START
    return f"{start_year}-01-01", f"{year}-12-31"

_tl_cache: dict = {}
_tl_lock = __import__("threading").Lock()

@app.route("/api/gee/timelapse-tile", methods=["POST"])
def timelapse_tile():
    err = _require_gee()
    if err: return err
    import ee
    data = request.get_json(force=True, silent=True) or {}
    source    = data.get("source", "sentinel2")      # sentinel2 | landsat | gedi
    year      = int(data.get("year", 2023))
    aoi_bounds = data.get("aoi_bounds")              # [minx, miny, maxx, maxy] optional
    gedi_mode  = data.get("gedi_mode", "rolling")    # single | rolling | cumulative
    gedi_window = int(data.get("gedi_window", 3))

    cache_key = (source, year, str(aoi_bounds), gedi_mode, gedi_window)
    with _tl_lock:
        if cache_key in _tl_cache:
            return jsonify(_tl_cache[cache_key])

    try:
        roi = None
        if aoi_bounds and len(aoi_bounds) == 4:
            roi = ee.Geometry.Rectangle(aoi_bounds)

        start = f"{year}-01-01"
        end   = f"{year}-12-31"

        if source == "sentinel2":
            def _s2_mask(img):
                qa = img.select('QA60')
                mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
                return img.updateMask(mask)
            coll = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                    .filterDate(start, end)
                    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
                    .map(_s2_mask)
                    .select(["B4", "B3", "B2"]))
            if roi: coll = coll.filterBounds(roi)
            img  = coll.median()
            if roi: img = img.clip(roi)
            vis  = {"min": 0, "max": 3000, "bands": ["B4", "B3", "B2"]}
            map_id = img.getMapId(vis)

        elif source == "landsat":
            def _l8_mask(img):
                qa = img.select('QA_PIXEL')
                mask = qa.bitwiseAnd(1 << 3).eq(0).And(qa.bitwiseAnd(1 << 4).eq(0))
                return img.updateMask(mask)
            coll = (ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                    .filterDate(start, end)
                    .filter(ee.Filter.lt("CLOUD_COVER", 30))
                    .map(_l8_mask)
                    .map(lambda i: i.multiply(0.0000275).add(-0.2))
                    .select(["SR_B4", "SR_B3", "SR_B2"]))
            if roi: coll = coll.filterBounds(roi)
            img  = coll.median()
            if roi: img = img.clip(roi)
            vis  = {"min": 0, "max": 0.3, "bands": ["SR_B4", "SR_B3", "SR_B2"]}
            map_id = img.getMapId(vis)

        elif source == "gedi":
            g_start, g_end = _gedi_date_range(year, gedi_mode, gedi_window)
            def _quality_mask(img):
                return img.updateMask(img.select("quality_flag").eq(1)).updateMask(img.select("degrade_flag").eq(0))
            coll = (ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
                    .filterDate(g_start, g_end)
                    .map(_quality_mask)
                    .select("rh98"))
            if roi: 
                coll = coll.filterBounds(roi)
                try:
                    is_empty = coll.limit(1).size().getInfo() == 0
                    shot_count = 0 if is_empty else "1+"
                except Exception:
                    shot_count = "1+"
            else:
                shot_count = "1+"
            img = coll.mean()
            if roi: img = img.clip(roi)
            vis = {"min": 0, "max": 40,
                   "palette": ["440154", "3b528b", "21918c", "5ec962", "fde725"]}
            map_id = img.getMapId(vis)
            result = {
                "tile_url": map_id["tile_fetcher"].url_format,
                "shot_count": shot_count,
                "date_range": [g_start, g_end],
            }
            with _tl_lock:
                _tl_cache[cache_key] = result
            return jsonify(result)

        else:
            return jsonify({"detail": f"Unknown source: {source}"}), 400

        result = {"tile_url": map_id["tile_fetcher"].url_format}
        with _tl_lock:
            _tl_cache[cache_key] = result
        return jsonify(result)

    except Exception as exc:
        logger.exception("timelapse-tile failed")
        return jsonify({"detail": str(exc)}), 500


@app.route("/api/gee/extract-samples", methods=["POST"])
def extract_training_samples():
    """Extract GEE pixel values for drawn sample geometries.

    Body JSON:
      source       – sentinel2 | landsat | gedi
      year         – integer
      scale        – integer (metres, default 30)
      gedi_mode    – single | rolling | cumulative
      gedi_window  – int (years)
      aoi_bounds   – [minx, miny, maxx, maxy] (optional)
      samples      – list of {geometry, class_label}
    Returns JSON with rows + band names, and base64-encoded CSV.
    """
    err = _require_gee()
    if err: return err
    import ee, base64, csv as _csv, io as _io

    data = request.get_json(force=True, silent=True) or {}
    source      = data.get("source", "sentinel2")
    year        = int(data.get("year", 2023))
    scale       = int(data.get("scale", 30))
    gedi_mode   = data.get("gedi_mode", "rolling")
    gedi_window = int(data.get("gedi_window", 3))
    aoi_bounds  = data.get("aoi_bounds")
    raw_samples = data.get("samples", [])  # [{geometry, class_label}, ...]

    if not raw_samples:
        return jsonify({"detail": "No samples provided."}), 400

    try:
        roi = None
        if aoi_bounds and len(aoi_bounds) == 4:
            roi = ee.Geometry.Rectangle(aoi_bounds)

        start = f"{year}-01-01"; end = f"{year}-12-31"

        if source == "sentinel2":
            def _s2_mask(img):
                qa = img.select('QA60')
                mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
                return img.updateMask(mask)
            coll = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                    .filterDate(start, end)
                    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
                    .map(_s2_mask)
                    .select(["B2","B3","B4","B5","B6","B7","B8","B8A","B11","B12"]))
            if roi: coll = coll.filterBounds(roi)
            img = coll.median()
        elif source == "landsat":
            def _l8_mask(img):
                qa = img.select('QA_PIXEL')
                mask = qa.bitwiseAnd(1 << 3).eq(0).And(qa.bitwiseAnd(1 << 4).eq(0))
                return img.updateMask(mask)
            coll = (ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                    .filterDate(start, end)
                    .filter(ee.Filter.lt("CLOUD_COVER", 30))
                    .map(_l8_mask)
                    .map(lambda i: i.multiply(0.0000275).add(-0.2))
                    .select(["SR_B2","SR_B3","SR_B4","SR_B5","SR_B6","SR_B7"]))
            if roi: coll = coll.filterBounds(roi)
            img = coll.median()
        elif source == "gedi":
            g_start, g_end = _gedi_date_range(year, gedi_mode, gedi_window)
            def _qmask(i): return i.updateMask(i.select("quality_flag").eq(1)).updateMask(i.select("degrade_flag").eq(0))
            coll = (ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
                    .filterDate(g_start, g_end).map(_qmask).select("rh98"))
            if roi: coll = coll.filterBounds(roi)
            img = coll.mean()
        else:
            return jsonify({"detail": f"Unknown source: {source}"}), 400

        # Build EE FeatureCollection from sample geometries
        ee_features = []
        for s in raw_samples:
            try:
                geom = ee.Geometry(s["geometry"])
                feat = ee.Feature(geom, {"class_label": s.get("class_label", "unknown")})
                ee_features.append(feat)
            except Exception:
                continue
        if not ee_features:
            return jsonify({"detail": "No valid geometries in samples."}), 400

        fc = ee.FeatureCollection(ee_features)
        sampled = img.sampleRegions(
            collection=fc,
            properties=["class_label"],
            scale=scale,
            geometries=False,
            tileScale=4,
        )
        info = sampled.getInfo()
        feats = info.get("features", [])
        if not feats:
            return jsonify({"detail": "No pixel values returned — try a larger scale or different AOI/year."}), 200

        rows = [f["properties"] for f in feats]
        band_cols = [k for k in rows[0].keys() if k != "class_label"] if rows else []

        # Build CSV
        csv_buf = _io.StringIO()
        writer = _csv.DictWriter(csv_buf, fieldnames=["class_label"] + band_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        csv_b64 = base64.b64encode(csv_buf.getvalue().encode()).decode()

        return jsonify({
            "rows": rows,
            "band_names": band_cols,
            "n_samples": len(rows),
            "csv_b64": csv_b64,
            "source": source,
            "year": year,
        })
    except Exception as exc:
        logger.exception("extract-samples failed")
        return jsonify({"detail": str(exc)}), 500


@app.route("/api/samples/export/geojson", methods=["GET"])
def export_samples_geojson():
    records = load_samples()
    geojson = samples_to_geojson(records)
    return Response(
        json.dumps(geojson, indent=2),
        mimetype="application/geo+json",
        headers={"Content-Disposition": 'attachment; filename="training_samples.geojson"'}
    )

@app.route("/api/samples/export/shapefile", methods=["GET"])
def export_samples_shapefile():
    import geopandas as gpd
    import tempfile
    import shutil
    import io
    
    records = load_samples()
    if not records:
        return jsonify({"detail": "No samples to export"}), 404
        
    geojson = samples_to_geojson(records)
    
    try:
        # Convert the geojson dictionary back to a string, then read it with geopandas
        gdf = gpd.read_file(io.StringIO(json.dumps(geojson)))
        
        # Geopandas needs a CRS. The default leaflet coordinates are WGS84 (EPSG:4326)
        gdf.set_crs(epsg=4326, inplace=True, allow_override=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "training_samples.shp")
            # geopandas saves multiple files: .shp, .shx, .dbf, .prj
            gdf.to_file(out_path)
            
            # Create a zip file of the shapefile contents in another temp dir
            zip_dir = tempfile.mkdtemp()
            zip_path = os.path.join(zip_dir, "training_samples")
            shutil.make_archive(zip_path, 'zip', tmpdir)
            zip_file = f"{zip_path}.zip"
            
            with open(zip_file, 'rb') as f:
                zip_data = f.read()
                
            shutil.rmtree(zip_dir)
            
            return Response(
                zip_data,
                mimetype="application/zip",
                headers={"Content-Disposition": 'attachment; filename="training_samples.zip"'}
            )
            
    except Exception as e:
        return jsonify({"detail": f"Failed to export shapefile: {e}"}), 500

@app.route("/api/samples/push-to-gee", methods=["POST"])
def push_to_gee():
    err = _require_gee()
    if err: return err
    
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'rwanda-geoportal'))
    
    file = request.files.get("file")
    if not file:
        return jsonify({"detail": "file missing"}), 400
        
    asset_name = request.form.get("asset_name")
    if not asset_name:
        return jsonify({"detail": "asset_name missing"}), 400
        
    filename = file.filename or "upload"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    is_raster = ext in {"tif", "tiff"}
    
    file_bytes = file.read()
    
    try:
        if is_raster:
            from gee_scripts.gee_asset_upload import push_raster_to_gee
            result = push_raster_to_gee(file_bytes, filename, asset_name)
            return jsonify({"asset_id": result.asset_id, "kind": "raster"})
        else:
            from gee_scripts.gee_vector_upload import push_vector_to_gee
            result = push_vector_to_gee(file_bytes, filename, asset_name)
            return jsonify({"asset_id": result.asset_id, "kind": "vector", "feature_count": result.feature_count})
    except Exception as exc:
        return jsonify({"detail": str(exc)}), 500

# ── Static Cartographic Map ──────────────────────────────────────────────────
import hashlib, urllib.request as _urllib_req
from functools import lru_cache as _lru_cache

@_lru_cache(maxsize=32)
def _cached_cartographic_png(
    url: str,
    district: str,
    title: str,
    class_areas_json: str,       # JSON string so it is hashable
    override_palette_json: str,  # JSON string so it is hashable
    show_frame: bool = True,
    show_grid: bool = False,
    show_legend: bool = True,
    show_scale: bool = True,
    show_compass: bool = True,
    show_title: bool = True,
) -> bytes:
    """Download + render once; identical calls return cached bytes instantly."""
    import json
    from reports.cartography import enhance_map_cartography

    class_areas      = json.loads(class_areas_json)      if class_areas_json      else {}
    override_palette = json.loads(override_palette_json) if override_palette_json else None

    # Download thumbnail
    req = _urllib_req.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with _urllib_req.urlopen(req, timeout=60) as resp:
        png_bytes = resp.read()

    # Render cartographic map
    buf = enhance_map_cartography(
        png_bytes,
        district=district,
        title=title,
        class_areas=class_areas,
        override_palette=override_palette,
        show_frame=show_frame,
        show_grid=show_grid,
        show_legend=show_legend,
        show_scale=show_scale,
        show_compass=show_compass,
        show_title=show_title,
    )
    return buf.read()


@app.route("/api/static-map", methods=["POST"])
def static_map():
    """
    POST body (JSON):
      district         – e.g. "Kigali"
      title            – map title string
      url              – GEE tile thumbnail URL
      class_areas      – {class_name: area_km2}  (optional)
      override_palette – list of hex colours      (optional)

    Returns a cartographic PNG. Results are cached in-process.
    """
    import json

    data = request.get_json(force=True, silent=True) or {}
    district         = data.get("district", "Rwanda")
    title            = data.get("title", "Analysis Map")
    url              = data.get("url", "")
    class_areas      = data.get("class_areas") or {}
    override_palette = data.get("override_palette") or None
    show_frame       = data.get("show_frame", True)
    show_grid        = data.get("show_grid", False)
    show_legend      = data.get("show_legend", True)
    show_scale       = data.get("show_scale", True)
    show_compass     = data.get("show_compass", True)
    show_title       = data.get("show_title", True)

    if not url:
        return jsonify({"detail": "url is required"}), 400

    # Serialise dict/list to stable JSON strings for cache key
    class_areas_json      = json.dumps(class_areas,      sort_keys=True) if class_areas      else ""
    override_palette_json = json.dumps(override_palette)                  if override_palette else ""

    try:
        png_bytes = _cached_cartographic_png(
            url, district, title, class_areas_json, override_palette_json
        )
    except Exception as exc:
        logger.error("static-map error: %s", exc)
        return jsonify({"detail": str(exc)}), 500

    # Strip non-latin-1 chars (e.g. em-dash in "A — Annual Soil Loss") from
    # HTTP headers which must be latin-1 encoded.
    safe_title = (
        title.replace(" ", "_").replace("/", "-")
             .encode("latin-1", errors="ignore").decode("latin-1")
    )
    return Response(
        png_bytes,
        mimetype="image/png",
        headers={"Content-Disposition": f'inline; filename="{safe_title}.png"'},
    )


@app.route("/api/classify/supervised", methods=["POST"])
def classify_supervised():
    err = _require_gee()
    if err: return err
    
    samples = load_samples()
    if not samples:
        return jsonify({"detail": "No training samples available. Please draw some samples first."}), 400
        
    try:
        from gee.supervised_classify import train_and_classify
        import ee
        
        # Optional AOI from the request
        aoi_data = request.json.get("aoi") if request.json else None
        aoi = None
        if aoi_data:
            if aoi_data["type"] == "bbox":
                miny, minx = aoi_data["bounds"][0]
                maxy, maxx = aoi_data["bounds"][1]
                aoi = ee.Geometry.Rectangle([minx, miny, maxx, maxy])
            elif aoi_data["type"] == "FeatureCollection":
                # Assuming geojson
                aoi = ee.FeatureCollection(aoi_data).geometry()
                
        result = train_and_classify(samples, aoi)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Supervised classification failed: {e}", exc_info=True)
        return jsonify({"detail": f"Classification failed: {e}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)
