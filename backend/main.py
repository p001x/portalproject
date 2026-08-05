"""Rwanda GeoPortal — FastAPI backend (all modules).

GEE is initialised in a background thread so uvicorn can bind the port
immediately. Endpoints return HTTP 503 while GEE is still starting up.
"""
import io
import json
import logging
import os
import threading
import urllib.request
import zipfile
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from gee.auth import initialize_gee
from gee.auth import (
    authenticate_individual,
    verify_individual_session,
    logout_individual,
)
from gee.aoi_utils import RWANDA_DISTRICTS
from gee.ndvi import compute_ndvi
from gee.lst import compute_lst
from gee.rusle import compute_rusle
from gee.slope import compute_slope
from gee.landfill import compute_landfill_suitability
from gee.air_pollution import compute_no2
from gee.landslide import (
    compute_landslide_map,
    compute_landslide_stats,
    compute_landslide_classify,
    compute_landslide_export,
)
from gee.accessibility import (
    compute_accessibility_map,
    compute_accessibility_stats,
    compute_accessibility_classify,
    compute_accessibility_export,
)
from gee.uhi import compute_uhi
from gee.drought import compute_agricultural_drought
from gee.flood import compute_flood_susceptibility
from reports.cartography import enhance_map_cartography

from storage.dataset_storage import (
    load_metadata, delete_record, download_dataset_bytes,
    process_and_store_upload, process_and_store_link,
    build_zip_of_datasets, datasets_intersecting,
)
from storage.samples_storage import (
    load_samples, add_sample, delete_sample, samples_to_geojson, TrainingSample,
)
from reports.report_builder import build_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── GEE state ───────────────────────────────────────────────────────────────

_gee_ready = False
_gee_error: str | None = None


def _init_gee_background() -> None:
    global _gee_ready, _gee_error
    try:
        initialize_gee()
        _gee_ready = True
        logger.info("GEE background initialization complete! _gee_ready = True")
    except Exception as exc:
        _gee_error = str(exc)
        logger.critical("GEE initialization failed: %s", exc)


def _require_gee() -> None:
    if _gee_error:
        raise HTTPException(status_code=503, detail=f"GEE initialization failed: {_gee_error}")
    if not _gee_ready:
        raise HTTPException(status_code=503, detail="GEE is still initializing — please retry in ~30 seconds.")


# ── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    key = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
    if not key:
        key_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "gee_key.json"))
        if os.path.exists(key_file_path):
            with open(key_file_path, "r", encoding="utf-8") as f:
                key = f.read().strip()
                os.environ["GEE_SERVICE_ACCOUNT_KEY"] = key

    if not key:
        global _gee_error
        _gee_error = "GEE_SERVICE_ACCOUNT_KEY is not set and gee_key.json was not found."
        logger.critical(_gee_error)
    else:
        logger.info("Starting GEE initialization in background thread...")
        t = threading.Thread(target=_init_gee_background, daemon=True)
        t.start()
    yield
    logger.info("GeoPortal API shutting down.")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Rwanda GeoPortal API", version="1.0", lifespan=lifespan)

from fastapi.responses import JSONResponse
from fastapi import Request
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = traceback.format_exc()
    logger.error(f"Global exception: {error_msg}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}", "traceback": error_msg}
    )

app.add_middleware(

    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

from routers.aoi_router import router as aoi_router
app.include_router(aoi_router)

from analytics import log_visit
import asyncio

@app.middleware("http")
async def track_analytics(request: Request, call_next):
    # Log analytics asynchronously, ignore admin and health checks
    if not request.url.path.startswith("/api/admin") and not request.url.path.startswith("/api/health") and not request.url.path.startswith("/assets"):
        ip = request.client.host if request.client else "unknown"
        asyncio.create_task(log_visit(ip, request.url.path))
    response = await call_next(request)
    return response


@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200:
        path = request.url.path
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
    return response

from routers.aoi_router import router as aoi_router
app.include_router(aoi_router)

from analytics import router as analytics_router
app.include_router(analytics_router)

from routers.analytics import router as new_analytics_router
app.include_router(new_analytics_router)

# ── Meta ─────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["meta"])
def health():
    if _gee_error:
        raise HTTPException(status_code=503, detail=_gee_error)
    if not _gee_ready:
        return {"status": "initializing", "message": "GEE is starting up, retry in ~30 s"}
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/districts", tags=["meta"])
def get_districts():
    return {"districts": RWANDA_DISTRICTS}


class GEEConfigRequest(BaseModel):
    project_id: Optional[str] = Field(None, description="Google Earth Engine Cloud Project ID")
    service_account_key: Optional[str] = Field(None, description="Optional custom service account JSON key string")


@app.get("/api/gee/config", tags=["gee"])
def get_gee_config_endpoint():
    from gee.auth import get_gee_status
    st = get_gee_status()
    st["initialized"] = _gee_ready
    return st


@app.post("/api/gee/config", tags=["gee"])
def update_gee_config_endpoint(req: GEEConfigRequest):
    from gee.auth import initialize_gee, get_gee_status
    global _gee_ready, _gee_error
    try:
        p_id = req.project_id.strip() if req.project_id else None
        sa_key = req.service_account_key.strip() if req.service_account_key else None
        if p_id:
            os.environ["GEE_PROJECT_ID"] = p_id
        if sa_key:
            os.environ["GEE_SERVICE_ACCOUNT_KEY"] = sa_key

        initialize_gee(project_id=p_id, key_json_override=sa_key)
        _gee_ready = True
        _gee_error = None
        return {"ok": True, "message": "GEE initialized successfully", "status": get_gee_status()}
    except Exception as exc:
        _gee_error = str(exc)
        raise HTTPException(400, f"Failed to initialize GEE with provided configuration: {exc}")


# ── Individual GEE Account Auth (Sample Digitization gate) ──────────────────

class IndividualAuthRequest(BaseModel):
    token: Optional[str] = Field(None, description="Google OAuth 2.0 ID Token")
    email: Optional[str] = Field(None, description="GEE Account Email for Dev Mode")
    project_name: Optional[str] = Field(None, description="GEE Project Name")


def _require_individual_gee(request: Request) -> dict:
    """Read X-GEE-Token header and verify the individual session.
    Raises HTTP 401 if missing or invalid."""
    token = request.headers.get("X-GEE-Token") or request.query_params.get("gee_token")
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Individual GEE authentication required. Please log in with your GEE email to access Sample Digitization.",
        )
    session = verify_individual_session(token)
    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired GEE session. Please log in again.",
        )
    return session


@app.post("/api/gee/individual-auth", tags=["gee-auth"])
def individual_auth_login(req: IndividualAuthRequest):
    """Authenticate with a Google OAuth ID Token or Dev Email."""
    auth_input = req.token or req.email
    if not auth_input:
        raise HTTPException(400, "Either Google OAuth token or email address is required.")
    try:
        result = authenticate_individual(auth_input, project_name=req.project_name)
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/gee/individual-auth/status", tags=["gee-auth"])
def individual_auth_status(request: Request):
    """Check the current individual GEE auth session status."""
    token = request.headers.get("X-GEE-Token")
    session = verify_individual_session(token)
    if session:
        return {"authenticated": True, "email": session["email"], "project_name": session.get("project_name"), "authenticated_at": session["authenticated_at"]}
    return {"authenticated": False}


@app.post("/api/gee/individual-auth/logout", tags=["gee-auth"])
def individual_auth_logout(request: Request):
    """Logout from the individual GEE auth session."""
    token = request.headers.get("X-GEE-Token")
    if token:
        logout_individual(token)
    return {"ok": True}


# ── Analysis models ──────────────────────────────────────────────────────────

class NDVIRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    start_date: str = Field(..., examples=["2024-01-01"])
    end_date: str = Field(..., examples=["2024-06-30"])
    n_classes: int = Field(5, ge=2, le=10)


class LSTRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    start_date: str = Field(..., examples=["2024-01-01"])
    end_date: str = Field(..., examples=["2024-06-30"])
    n_classes: int = Field(5, ge=2, le=10)


class RUSLERequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Huye"])
    year: int = Field(2023, ge=2010, le=2024)
    n_classes: int = Field(5, ge=2, le=10)
    reverse_r: bool = False
    reverse_k: bool = False
    reverse_ls: bool = False
    reverse_c: bool = False
    reverse_p: bool = False


class SlopeRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Musanze"])
    n_classes: int = Field(5, ge=2, le=10)


class LandfillRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Nyagatare"])
    n_classes: int = Field(5, ge=2, le=10)
    reverse_river: bool = False
    reverse_residential: bool = False
    reverse_slope: bool = False
    reverse_road: bool = False
    reverse_lulc: bool = False
    custom_weights: Optional[dict] = Field(
        None,
        description="Optional weight overrides e.g. {'river':0.4,'residential':0.2,'slope':0.2,'road':0.1,'lulc':0.1}. Values are normalized to sum to 1.",
    )


class AirPollutionRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Nyarugenge"])
    start_date: str = Field(..., examples=["2023-01-01"])
    end_date: str = Field(..., examples=["2023-12-31"])
    n_classes: int = Field(5, ge=2, le=10)


class LandslideRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Musanze"])
    start_year: int = Field(2015, ge=1981, le=2024)
    end_year: int = Field(2024, ge=1981, le=2024)
    n_classes: int = Field(5, ge=2, le=10)
    reverse_slope: bool = False
    reverse_rainfall: bool = False
    reverse_litho: bool = False
    reverse_soiltype: bool = False
    reverse_landcover: bool = False
    reverse_twi: bool = False
    reverse_dist: bool = False
    custom_palettes: Optional[dict] = Field(default_factory=dict)


class AccessibilityRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    amenities: list[str] = Field(..., description="List of OSM amenity tags e.g. ['school']")
    n_classes: int = Field(4, ge=2, le=10)


class UHIRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Kicukiro"])
    start_date: str = Field(..., examples=["2024-01-01"])
    end_date: str = Field(..., examples=["2024-06-30"])
    grid_size: int = Field(6, ge=3, le=12)


class DroughtRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Kayonza"])
    year: int = Field(2023, ge=2013, le=2024)
    n_classes: int = Field(5, ge=2, le=10)
    reverse_sm: bool = False
    reverse_rf: bool = False
    reverse_ndvi: bool = False
    reverse_vci: bool = False
    reverse_lst: bool = False
    reverse_cdd: bool = False
    reverse_evi: bool = False

class FloodRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Kigali City", "Gasabo"])
    start_year: int = Field(2019, ge=1981, le=2024)
    end_year: int = Field(2024, ge=1981, le=2024)
    n_classes: int = Field(5, ge=2, le=10)
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
    custom_weights: Optional[dict] = Field(None, description="Optional weight overrides")


class ReportRequest(BaseModel):
    module_name: str
    aoi: dict = Field(default_factory=dict)
    district: Optional[str] = None
    date_range: str
    stats: dict
    class_areas: dict
    extra_notes: str = ""
    maps: list[tuple[str, str]] | None = None


class StaticMapRequest(BaseModel):
    district: str
    title: str
    url: str
    bbox: Optional[list[float]] = None
    class_areas: Optional[dict] = None
    override_palette: Optional[list[str]] = None
    show_frame: bool = True
    show_grid: bool = False
    show_legend: bool = True
    show_scale: bool = True
    show_compass: bool = True
    size_multiplier: float = 1.0
    legend_pos: str = 'center left'
    scale_pos: str = 'lower left'
    north_arrow_pos: str = 'top right'
    output_format: str = 'PNG'


# ── Analysis endpoints ───────────────────────────────────────────────────────

@app.post("/api/report", tags=["analysis"])
def generate_report(req: ReportRequest):
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
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment;filename={req.module_name.replace(' ', '_')}_Report.pdf"}
        )
    except Exception as exc:
        logger.exception("Report generation failed")
        raise HTTPException(status_code=500, detail=str(exc))


import functools

@functools.lru_cache(maxsize=64)
def _download_png(url: str) -> bytes:
    import time
    max_retries = 5
    backoff = 1.0
    for attempt in range(max_retries):
        try:
            req_obj = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req_obj, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503, 504) and attempt < max_retries - 1:
                logger.warning(f"HTTP {err.code} downloading image (attempt {attempt+1}/{max_retries}), retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 2.0
            else:
                raise
        except Exception as err:
            if attempt < max_retries - 1:
                logger.warning(f"Error downloading image ({err}) (attempt {attempt+1}/{max_retries}), retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 1.5
            else:
                raise

@app.post("/api/static-map", tags=["analysis"])
def static_map_endpoint(req: StaticMapRequest):
    _require_gee()
    try:
        raw_png = _download_png(req.url)
        carto_buf = enhance_map_cartography(
            raw_png, req.district, req.title, bbox=req.bbox, class_areas=req.class_areas, override_palette=req.override_palette,
            show_frame=req.show_frame, show_grid=req.show_grid, 
            show_legend=req.show_legend, show_scale=req.show_scale, show_compass=req.show_compass,
            size_multiplier=req.size_multiplier,
            legend_pos=req.legend_pos, scale_pos=req.scale_pos, north_arrow_pos=req.north_arrow_pos,
            output_format=req.output_format
        )
        
        ext = "png"
        media_type = "image/png"
        fmt_upper = (req.output_format or "PNG").upper()
        if fmt_upper in ("JPG", "JPEG"):
            media_type = "image/jpeg"
            ext = "jpg"
        elif fmt_upper in ("TIF", "TIFF"):
            media_type = "image/tiff"
            ext = "tif"

        safe_title = req.title.encode("ascii", "ignore").decode("ascii").replace(" ", "_").replace("/", "_")
        filename = f"Map_{req.district}_{safe_title}.{ext}"

        return Response(
            content=carto_buf.getvalue(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as exc:
        logger.exception("Static map generation failed")
        raise HTTPException(status_code=500, detail=str(exc))


class ProxyImageRequest(BaseModel):
    url: str

@app.post("/api/proxy-image", tags=["analysis"])
def proxy_image_endpoint(req: ProxyImageRequest):
    _require_gee()
    try:
        raw_png = _download_png(req.url)
        return Response(content=raw_png, media_type="image/png")
    except Exception as exc:
        logger.exception("Proxy image failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/static-map-download", tags=["analysis"])
def static_map_download_endpoint(
    district: str = Form(...),
    bbox_json: Optional[str] = Form(None),
    title: str = Form(...),
    url: str = Form(...),
    class_areas_json: Optional[str] = Form(None),
    override_palette_json: Optional[str] = Form(None),
    show_frame: bool = Form(True),
    show_grid: bool = Form(False),
    show_legend: bool = Form(True),
    show_scale: bool = Form(True),
    show_compass: bool = Form(True),
    size_multiplier: float = Form(1.0),
    output_format: str = Form("PNG"),
):
    _require_gee()
    try:
        class_areas = json.loads(class_areas_json) if class_areas_json and class_areas_json != "null" else None
        override_palette = json.loads(override_palette_json) if override_palette_json and override_palette_json != "null" else None

        raw_png = _download_png(url)
        bbox = json.loads(bbox_json) if bbox_json and bbox_json != "null" else None
        carto_buf = enhance_map_cartography(
            raw_png, district, title, bbox, class_areas, override_palette,
            show_frame=show_frame, show_grid=show_grid, 
            show_legend=show_legend, show_scale=show_scale, show_compass=show_compass,
            size_multiplier=size_multiplier,
            output_format=output_format
        )
        
        ext = "png"
        media_type = "image/png"
        fmt_upper = (output_format or "PNG").upper()
        if fmt_upper in ("JPG", "JPEG"):
            media_type = "image/jpeg"
            ext = "jpg"
        elif fmt_upper in ("TIF", "TIFF"):
            media_type = "image/tiff"
            ext = "tif"

        safe_title = title.encode("ascii", "ignore").decode("ascii").replace(" ", "_").replace("/", "_")
        filename = f"Map_{district}_{safe_title}.{ext}"

        return Response(
            content=carto_buf.getvalue(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as exc:
        logger.exception("Static map download failed")
        raise HTTPException(status_code=500, detail=str(exc))



@app.post("/api/flood", tags=["analysis"])
def flood_endpoint(req: FloodRequest):
    _require_gee()
    try:
        reverse_flags = {
            "rainfall": req.reverse_rainfall,
            "twi": req.reverse_twi,
            "lulc": req.reverse_lulc,
            "elevation": req.reverse_elevation,
            "slope": req.reverse_slope,
            "river_dist": req.reverse_river_dist,
            "road_dist": req.reverse_road_dist,
            "soil_type": req.reverse_soil_type,
            "drainage_density": req.reverse_drainage_density,
            "ndvi": req.reverse_ndvi,
        }
        return compute_flood_susceptibility(
            aoi_config=req.aoi,
            start_year=req.start_year,
            end_year=req.end_year,
            n_classes=req.n_classes,
            weights=req.custom_weights,
            reverse_flags=reverse_flags,
        )
    except Exception as exc:
        logger.exception("Flood Susceptibility failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/ndvi", tags=["analysis"])
def ndvi_endpoint(req: NDVIRequest):
    _require_gee()
    try:
        return compute_ndvi(req.aoi, req.start_date, req.end_date, req.n_classes)
    except Exception as exc:
        logger.exception("NDVI failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/lst", tags=["analysis"])
def lst_endpoint(req: LSTRequest):
    _require_gee()
    try:
        return compute_lst(req.aoi, req.start_date, req.end_date, req.n_classes)
    except Exception as exc:
        logger.exception("LST failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/rusle", tags=["analysis"])
def rusle_endpoint(req: RUSLERequest):
    _require_gee()
    try:
        return compute_rusle(req.aoi, req.year, req.n_classes,
            req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p,
        )
    except Exception as exc:
        logger.exception("RUSLE failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/slope", tags=["analysis"])
def slope_endpoint(req: SlopeRequest):
    _require_gee()
    try:
        return compute_slope(req.aoi, req.n_classes)
    except Exception as exc:
        logger.exception("Slope failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/landfill", tags=["analysis"])
def landfill_endpoint(req: LandfillRequest):
    _require_gee()
    try:
        return compute_landfill_suitability(req.aoi, req.reverse_river, req.reverse_residential,
            req.reverse_slope, req.reverse_road, req.reverse_lulc, req.n_classes,
            custom_weights=req.custom_weights,
        )
    except Exception as exc:
        logger.exception("Landfill failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/air-pollution", tags=["analysis"])
def air_pollution_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_no2(req.aoi, req.start_date, req.end_date, req.n_classes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Air pollution failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/landslide/map", tags=["analysis"])
def landslide_map_endpoint(req: LandslideRequest):
    _require_gee()
    try:
        return compute_landslide_map(req.aoi, req.start_year, req.end_year,
            reverse_slope=req.reverse_slope, reverse_rainfall=req.reverse_rainfall,
            reverse_litho=req.reverse_litho, reverse_soiltype=req.reverse_soiltype,
            reverse_landcover=req.reverse_landcover, reverse_twi=req.reverse_twi,
            reverse_dist=req.reverse_dist, custom_palettes=req.custom_palettes,
        )
    except Exception as exc:
        logger.exception("Landslide map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/landslide/stats", tags=["analysis"])
def landslide_stats_endpoint(req: LandslideRequest):
    _require_gee()
    try:
        return compute_landslide_stats(req.aoi, req.start_year, req.end_year,
            reverse_slope=req.reverse_slope, reverse_rainfall=req.reverse_rainfall,
            reverse_litho=req.reverse_litho, reverse_soiltype=req.reverse_soiltype,
            reverse_landcover=req.reverse_landcover, reverse_twi=req.reverse_twi,
            reverse_dist=req.reverse_dist,
        )
    except Exception as exc:
        logger.exception("Landslide stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/landslide/classify", tags=["analysis"])
def landslide_classify_endpoint(req: LandslideRequest):
    _require_gee()
    try:
        return compute_landslide_classify(req.aoi, req.start_year, req.end_year, req.n_classes,
            reverse_slope=req.reverse_slope, reverse_rainfall=req.reverse_rainfall,
            reverse_litho=req.reverse_litho, reverse_soiltype=req.reverse_soiltype,
            reverse_landcover=req.reverse_landcover, reverse_twi=req.reverse_twi,
            reverse_dist=req.reverse_dist,
        )
    except Exception as exc:
        logger.exception("Landslide classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/landslide/export", tags=["analysis"])
def landslide_export_endpoint(req: LandslideRequest):
    _require_gee()
    try:
        return compute_landslide_export(req.aoi, req.start_year, req.end_year,
            reverse_slope=req.reverse_slope, reverse_rainfall=req.reverse_rainfall,
            reverse_litho=req.reverse_litho, reverse_soiltype=req.reverse_soiltype,
            reverse_landcover=req.reverse_landcover, reverse_twi=req.reverse_twi,
            reverse_dist=req.reverse_dist, custom_palettes=req.custom_palettes,
        )
    except Exception as exc:
        logger.exception("Landslide export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/accessibility/map", tags=["analysis"])
def accessibility_map_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_map(req.aoi, req.amenities)
    except Exception as exc:
        logger.exception("Accessibility map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/stats", tags=["analysis"])
def accessibility_stats_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_stats(req.aoi, req.amenities)
    except Exception as exc:
        logger.exception("Accessibility stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/classify", tags=["analysis"])
def accessibility_classify_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_classify(req.aoi, req.amenities, req.n_classes)
    except Exception as exc:
        logger.exception("Accessibility classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/export", tags=["analysis"])
def accessibility_export_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_export(req.aoi, req.amenities)
    except Exception as exc:
        logger.exception("Accessibility export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/uhi", tags=["analysis"])
def uhi_endpoint(req: UHIRequest):
    _require_gee()
    try:
        return compute_uhi(req.aoi, req.start_date, req.end_date, req.grid_size)
    except Exception as exc:
        logger.exception("UHI failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/drought", tags=["analysis"])
def drought_endpoint(req: DroughtRequest):
    _require_gee()
    try:
        return compute_agricultural_drought(req.aoi, req.year, req.n_classes,
            reverse_sm=req.reverse_sm,
            reverse_rf=req.reverse_rf,
            reverse_ndvi=req.reverse_ndvi,
            reverse_vci=req.reverse_vci,
            reverse_lst=req.reverse_lst,
            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
        )
    except Exception as exc:
        logger.exception("Drought failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


# ── RARE DATA — Dataset Repository ─────────────────────────────────────────

@app.get("/api/datasets", tags=["rare-data"])
def list_datasets(source: str = Query("admin", pattern="^(admin|community|all)$")):
    if source == "all":
        return {"records": load_metadata("admin") + load_metadata("community")}
    return {"records": load_metadata(source=source)}


@app.post("/api/datasets/upload", tags=["rare-data"])
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    source: str = Form("admin"),
    contributor: Optional[str] = Form(None),
):
    if source not in ("admin", "community"):
        raise HTTPException(400, "source must be 'admin' or 'community'")
    file_bytes = await file.read()
    record = process_and_store_upload(
        filename=file.filename or "upload",
        file_bytes=file_bytes,
        name=name,
        description=description,
        source=source,
        contributor=contributor,
    )
    return record.to_dict()


class DatasetLinkRequest(BaseModel):
    url: str
    name: str
    description: str = ""
    source: str = "admin"
    contributor: Optional[str] = None


@app.post("/api/datasets/link", tags=["rare-data"])
def add_dataset_link(req: DatasetLinkRequest):
    if req.source not in ("admin", "community"):
        raise HTTPException(400, "source must be 'admin' or 'community'")
    record = process_and_store_link(
        url=req.url, name=req.name, description=req.description,
        source=req.source, contributor=req.contributor,
    )
    return record.to_dict()


@app.get("/api/datasets/{dataset_id}/download", tags=["rare-data"])
def download_dataset(dataset_id: str, source: str = Query("admin", pattern="^(admin|community)$")):
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        raise HTTPException(404, "Dataset not found")
    try:
        file_bytes = download_dataset_bytes(record["storage_key"])
    except Exception as exc:
        raise HTTPException(500, f"Could not fetch file: {exc}") from exc
    return Response(
        content=file_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{record["original_filename"]}"'},
    )


@app.delete("/api/datasets/{dataset_id}", tags=["rare-data"])
def delete_dataset(dataset_id: str, source: str = Query("admin", pattern="^(admin|community)$")):
    ok = delete_record(dataset_id, source=source)
    if not ok:
        raise HTTPException(404, "Dataset not found")
    return {"ok": True}


@app.get("/api/datasets/download-all", tags=["rare-data"])
def download_all_datasets(source: str = Query("admin", pattern="^(admin|community)$")):
    records = load_metadata(source=source)
    zip_bytes = build_zip_of_datasets(records)
    return Response(
        content=zip_bytes, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{source}_all_datasets.zip"'},
    )


# ── Admin auth ──────────────────────────────────────────────────────────────

class AdminVerifyRequest(BaseModel):
    password: str


@app.post("/api/admin/verify", tags=["admin"])
def admin_verify(req: AdminVerifyRequest):
    return {"ok": True}


# ── Sample Digitization ─────────────────────────────────────────────────────

class SampleCreateRequest(BaseModel):
    geometry: dict
    class_label: str
    class_value: int = 1
    source_filename: str = "manual"
    source_url: str = ""
    creator: str = "anonymous"
    color: str = "#0F6E4F"


@app.get("/api/samples", tags=["samples"])
def list_samples(request: Request):
    _require_individual_gee(request)
    return {"samples": load_samples()}


@app.post("/api/samples", tags=["samples"])
def create_sample(req: SampleCreateRequest, request: Request):
    _require_individual_gee(request)
    import uuid as _uuid
    sample = TrainingSample(
        id=_uuid.uuid4().hex,
        geometry=req.geometry,
        class_label=req.class_label,
        class_value=req.class_value,
        source_filename=req.source_filename,
        source_url=req.source_url,
        creator=req.creator,
        color=req.color,
    )
    return add_sample(sample)


class BatchSampleCreateRequest(BaseModel):
    dataset_name: str = Field(..., description="Name of the training dataset / session")
    creator: str = "anonymous"
    samples: list[dict] = Field(..., description="List of sample objects { geometry, class_label, color }")


@app.post("/api/samples/batch", tags=["samples"])
def create_batch_samples(req: BatchSampleCreateRequest, request: Request):
    _require_individual_gee(request)
    """Save an entire digitization editing session with dataset name and features."""
    import uuid as _uuid
    added = []
    for item in req.samples:
        sample = TrainingSample(
            id=_uuid.uuid4().hex,
            geometry=item["geometry"],
            class_label=item.get("class_label", "Unclassified"),
            class_value=item.get("class_value", 1),
            source_filename=req.dataset_name.strip() or "manual_session",
            creator=req.creator.strip() or item.get("creator", "anonymous"),
            color=item.get("color", "#0F6E4F"),
        )
        added.append(add_sample(sample))
    return {
        "ok": True,
        "saved_count": len(added),
        "dataset_name": req.dataset_name.strip(),
        "message": f"Successfully saved {len(added)} feature(s) into dataset '{req.dataset_name.strip()}'!"
    }


@app.delete("/api/samples/{sample_id}", tags=["samples"])
def delete_sample_endpoint(sample_id: str, request: Request):
    _require_individual_gee(request)
    ok = delete_sample(sample_id)
    if not ok:
        raise HTTPException(404, "Sample not found")
    return {"ok": True}


@app.get("/api/samples/export/geojson", tags=["samples"])
def export_samples_geojson(request: Request):
    _require_individual_gee(request)
    records = load_samples()
    geojson = samples_to_geojson(records)
    return Response(
        content=json.dumps(geojson, indent=2),
        media_type="application/geo+json",
        headers={"Content-Disposition": 'attachment; filename="training_samples.geojson"'},
    )


@app.get("/api/samples/export/shapefile", tags=["samples"])
def export_samples_shapefile(request: Request):
    _require_individual_gee(request)
    """Export all digitized training samples as a zipped ESRI Shapefile (.zip)."""
    import sys
    from pathlib import Path
    geoportal_path = str(Path(__file__).parent.parent / "rwanda-geoportal")
    if geoportal_path not in sys.path:
        sys.path.append(geoportal_path)
    from utils.samples_export import export_shapefile_zip, ExportError

    records = load_samples()
    if not records:
        raise HTTPException(400, "No training samples digitized yet.")

    try:
        zip_bytes = export_shapefile_zip(records)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="training_samples_shapefile.zip"'},
        )
    except ExportError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Shapefile export error: {e}")


class PushSamplesToGEEAssetRequest(BaseModel):
    asset_id: str = Field(..., description="Destination GEE Asset ID e.g. projects/your-project/assets/samples")
    description: Optional[str] = "training_samples_export"
    project_id: Optional[str] = None


@app.post("/api/samples/export/gee-asset", tags=["samples"])
def export_samples_to_gee_asset_endpoint(req: PushSamplesToGEEAssetRequest, request: Request):
    _require_individual_gee(request)
    """Export digitized training samples directly into a permanent GEE FeatureCollection Asset in user GEE project."""
    _require_gee()
    import sys, os as _os
    sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), '..', 'rwanda-geoportal'))
    import ee
    from gee.auth import initialize_gee

    if req.project_id and req.project_id.strip():
        initialize_gee(project_id=req.project_id.strip())

    records = load_samples()
    if not records:
        raise HTTPException(400, "No training samples found to export. Please digitize or import samples first.")

    geojson = samples_to_geojson(records)
    features = []
    for f in geojson.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        features.append(ee.Feature(geom, props))

    fc = ee.FeatureCollection(features)

    from utils.samples_export import export_to_gee_asset, ExportError
    try:
        task = export_to_gee_asset(fc, asset_id=req.asset_id.strip(), description=req.description or "training_samples_export")
        return {
            "ok": True,
            "task_id": getattr(task, "id", "submitted"),
            "asset_id": req.asset_id.strip(),
            "feature_count": len(features),
            "message": f"Successfully launched GEE Asset export task for {len(features)} feature(s)!"
        }
    except ExportError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"GEE Asset export failed: {e}")


@app.post("/api/samples/push-to-gee", tags=["samples"])
async def push_to_gee(
    request: Request,
    file: UploadFile = File(...),
    asset_name: str = Form(...),
    project_id: Optional[str] = Form(None),
):
    """Push a raster or vector file to GEE as a permanent asset in a specific user GEE project."""
    _require_individual_gee(request)
    _require_gee()
    import sys, os as _os
    sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), '..', 'rwanda-geoportal'))

    file_bytes = await file.read()
    filename = file.filename or "upload"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    is_raster = ext in {"tif", "tiff"}

    try:
        if is_raster:
            from gee_scripts.gee_asset_upload import push_raster_to_gee, AssetUploadError
            result = push_raster_to_gee(file_bytes, filename, asset_name, custom_project_id=project_id)
            return {"asset_id": result.asset_id, "kind": "raster", "project_id": project_id or "default"}
        else:
            from gee_scripts.gee_vector_upload import push_vector_to_gee, AssetUploadError
            result = push_vector_to_gee(file_bytes, filename, asset_name, custom_project_id=project_id)
            return {"asset_id": result.asset_id, "kind": "vector", "feature_count": result.feature_count, "project_id": project_id or "default"}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


class SupervisedClassifyRequest(BaseModel):
    aoi: Optional[dict] = None
    data_source: str = "sentinel2"
    custom_asset_id: Optional[str] = None
    samples: Optional[list] = None


@app.get("/api/native/imagery/bounds", tags=["samples"])
def native_imagery_bounds(url: str, request: Request):
    _require_individual_gee(request)
    import os, tempfile
    from rio_tiler.io import Reader
    from fastapi.responses import Response

    try:
        if not url.startswith("http://") and not url.startswith("https://"):
            from storage.dataset_storage import download_dataset_bytes, get_dataset_local_path
            local_path = get_dataset_local_path(url)
            if local_path:
                url = local_path
            else:
                cache_key = url.replace('/', '_').replace(':', '_')
                temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}")
                if not os.path.exists(temp_path):
                    file_bytes = download_dataset_bytes(url)
                    with open(temp_path, "wb") as f:
                        f.write(file_bytes)
                url = temp_path

        with Reader(url) as src:
            bounds = src.bounds # (minx, miny, maxx, maxy)
            if src.crs is not None and str(src.crs) != "EPSG:4326":
                from rasterio.warp import transform_bounds
                bounds = transform_bounds(src.crs, "EPSG:4326", *bounds)
            return {"bbox": list(bounds)}
    except Exception as e:
        logger.error(f"Error reading bounds for {url}: {e}")
        raise HTTPException(500, f"Failed to get raster bounds: {e}")


@app.get("/api/native/imagery/tiles/{z}/{x}/{y}", tags=["samples"])
def native_imagery_tile(z: int, x: int, y: int, url: str, request: Request):
    _require_individual_gee(request)
    import io, os, tempfile
    from rio_tiler.io import Reader
    from fastapi.responses import Response
    from PIL import Image
    import numpy as np

    try:
        if not url.startswith("http://") and not url.startswith("https://"):
            from storage.dataset_storage import download_dataset_bytes, get_dataset_local_path
            local_path = get_dataset_local_path(url)
            if local_path:
                url = local_path
            else:
                cache_key = url.replace('/', '_').replace(':', '_')
                temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}")
                if not os.path.exists(temp_path):
                    file_bytes = download_dataset_bytes(url)
                    with open(temp_path, "wb") as f:
                        f.write(file_bytes)
                url = temp_path

        with Reader(url) as src:
            if not src.tile_exists(x, y, z):
                return Response(status_code=404)
                
            img = src.tile(x, y, z)
            # data is (bands, height, width)
            data = img.data
            
            # Simple RGB rendering (use first 3 bands, or grayscale if 1 band)
            bands, h, w = data.shape
            rgb_arr = np.zeros((h, w, 4), dtype=np.uint8)
            
            # Very basic stretch
            if img.mask is not None:
                valid_mask = img.mask > 0
            else:
                valid_mask = np.ones((h, w), dtype=bool)
                
            for b in range(min(bands, 3)):
                band_data = data[b].astype(float)
                if valid_mask.any():
                    valid_pixels = band_data[valid_mask]
                    p2, p98 = np.percentile(valid_pixels, (2, 98))
                    if p98 > p2:
                        stretched = np.clip((band_data - p2) / (p98 - p2) * 255, 0, 255)
                        rgb_arr[:, :, b] = stretched.astype(np.uint8)
                    else:
                        vmin, vmax = valid_pixels.min(), valid_pixels.max()
                        if vmax > vmin:
                            stretched = np.clip((band_data - vmin) / (vmax - vmin) * 255, 0, 255)
                            rgb_arr[:, :, b] = stretched.astype(np.uint8)
                        elif vmax > 0:
                            rgb_arr[:, :, b] = 128
            
            if bands == 1:
                rgb_arr[:, :, 1] = rgb_arr[:, :, 0]
                rgb_arr[:, :, 2] = rgb_arr[:, :, 0]
                
            # Alpha channel
            rgb_arr[:, :, 3] = 255
            if img.mask is not None:
                rgb_arr[img.mask == 0, 3] = 0
                
            pil_img = Image.fromarray(rgb_arr, mode="RGBA")
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            
            return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        logger.error(f"Error serving imagery tile {z}/{x}/{y}: {e}")
        raise HTTPException(500, "Error rendering tile")


@app.get("/api/native_classify/tiles/{z}/{x}/{y}", tags=["samples"])
def native_classify_tile(z: int, x: int, y: int, url: str, model_id: str, request: Request):
    import joblib
    import os
    import tempfile
    import numpy as np
    from rio_tiler.io import Reader
    from fastapi.responses import Response
    from PIL import Image
    import io
    from matplotlib.colors import to_rgb
    
    CACHE_DIR = tempfile.gettempdir()
    model_path = os.path.join(CACHE_DIR, f"rf_model_{model_id}.joblib")
    if not os.path.exists(model_path):
        raise HTTPException(404, "Model not found. Please train the classifier again.")
        
    try:
        model_data = joblib.load(model_path)
        clf = model_data["model"]
        unique_classes = model_data["classes"]
        class_colors = model_data["colors"]
    except Exception as e:
        raise HTTPException(500, f"Failed to load model: {e}")
        
    try:
        if not url.startswith("http://") and not url.startswith("https://"):
            from storage.dataset_storage import download_dataset_bytes
            cache_key = url.replace('/', '_').replace(':', '_')
            temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}")
            if not os.path.exists(temp_path):
                file_bytes = download_dataset_bytes(url)
                with open(temp_path, "wb") as f:
                    f.write(file_bytes)
            url = temp_path

        with Reader(url) as src:
            if not src.tile_exists(x, y, z):
                return Response(status_code=404)
                
            img = src.tile(x, y, z)
            data = img.data
            
            bands, h, w = data.shape
            pixels = data.transpose(1, 2, 0).reshape(-1, bands)
            
            # Predict
            preds = clf.predict(pixels)
            preds_2d = preds.reshape(h, w)
            
            # Create RGB array
            rgb_arr = np.zeros((h, w, 4), dtype=np.uint8)
            for i, cls_name in enumerate(unique_classes):
                hex_color = class_colors.get(cls_name, "#000000")
                try:
                    r, g, b = [int(c * 255) for c in to_rgb(hex_color)]
                except:
                    r, g, b = 0, 0, 0
                
                mask = (preds_2d == i)
                rgb_arr[mask, 0] = r
                rgb_arr[mask, 1] = g
                rgb_arr[mask, 2] = b
                rgb_arr[mask, 3] = 255
            
            # Apply original nodata mask if it exists
            if img.mask is not None:
                # If img.mask is boolean or 0/255
                nodata_mask = (img.mask == 0)
                rgb_arr[nodata_mask, 3] = 0
            
            # Encode as PNG
            pil_img = Image.fromarray(rgb_arr, mode="RGBA")
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            
            return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        logger.error(f"Error serving tile {z}/{x}/{y}: {e}")
        raise HTTPException(500, "Error rendering tile")


@app.post("/api/classify/supervised", tags=["samples"])
def supervised_classify_endpoint(request: Request, req: SupervisedClassifyRequest = SupervisedClassifyRequest()):
    _require_individual_gee(request)
    _require_gee()
    from gee.supervised_classify import train_and_classify
    samples = req.samples if req.samples else load_samples()
    if not samples:
        raise HTTPException(400, "No training samples found. Please digitize or import samples first.")
    sample_dicts = [s.to_dict() if hasattr(s, "to_dict") else s for s in samples]
    try:
        result = train_and_classify(
            sample_dicts, 
            aoi=req.aoi, 
            data_source=req.data_source, 
            custom_asset_id=req.custom_asset_id
        )
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Supervised classification failed")
        raise HTTPException(500, str(exc)) from exc


@app.get("/api/datasets/{dataset_id}/preview", tags=["rare-data"])
def preview_dataset(dataset_id: str, source: str = Query("admin", pattern="^(admin|community)$")):
    from storage.dataset_storage import get_dataset_preview
    records = load_metadata(source=source)
    record = next((r for r in records if r["id"] == dataset_id), None)
    if record is None:
        raise HTTPException(404, "Dataset not found")

    bbox = record.get("bbox")
    storage_key = record.get("storage_key", "")
    file_type = record.get("file_type", "")

    try:
        preview_data = get_dataset_preview(record)
        if isinstance(preview_data, dict):
            preview_data["name"] = record.get("name")
            preview_data["file_type"] = file_type
            preview_data["bbox"] = bbox
            preview_data["storage_key"] = storage_key
            return preview_data
        return {
            "type": "geojson",
            "geojson": preview_data,
            "name": record.get("name"),
            "file_type": file_type,
            "bbox": bbox,
            "storage_key": storage_key,
        }
    except Exception as exc:
        logger.warning(f"Full dataset preview failed for {dataset_id}: {exc}, falling back to metadata")
        if storage_key.startswith("url::"):
            raw_url = storage_key[5:]
            return {
                "type": "url",
                "url": raw_url,
                "file_type": file_type,
                "bbox": bbox,
                "name": record.get("name"),
                "storage_key": storage_key,
            }
        return {
            "type": "bbox" if bbox else "metadata",
            "bbox": bbox,
            "name": record.get("name"),
            "file_type": file_type,
            "storage_key": storage_key,
        }


class PreviewImageryRequest(BaseModel):
    aoi_bounds: Optional[list] = None
    data_source: str = "sentinel2"
    custom_asset_id: Optional[str] = None

@app.post("/api/gee/preview-imagery", tags=["gee"])
def preview_imagery_endpoint(req: PreviewImageryRequest, request: Request):
    _require_individual_gee(request)
    _require_gee()
    from gee.supervised_classify import get_training_imagery_tile
    try:
        url = get_training_imagery_tile(req.aoi_bounds, req.data_source, req.custom_asset_id)
        return {"tile_url": url}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


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
_tl_lock = threading.Lock()

class TimelapseTileRequest(BaseModel):
    source: str = "sentinel2"
    year: int = 2023
    aoi_bounds: Optional[list] = None
    gedi_mode: str = "rolling"
    gedi_window: int = 3

@app.post("/api/gee/timelapse-tile", tags=["gee"])
def timelapse_tile(req: TimelapseTileRequest):
    _require_gee()
    import ee
    
    source = req.source
    year = req.year
    aoi_bounds = req.aoi_bounds
    gedi_mode = req.gedi_mode
    gedi_window = req.gedi_window

    cache_key = (source, year, str(aoi_bounds), gedi_mode, gedi_window)
    with _tl_lock:
        if cache_key in _tl_cache:
            return _tl_cache[cache_key]

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
            coll = (ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
                    .filterDate(g_start, g_end)
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
            return result
        else:
            raise HTTPException(400, f"Unknown source: {source}")

        result = {"tile_url": map_id["tile_fetcher"].url_format}
        with _tl_lock:
            _tl_cache[cache_key] = result
        return result

    except Exception as exc:
        logger.exception("timelapse-tile failed")
        raise HTTPException(500, detail=str(exc))


class ExtractSamplesRequest(BaseModel):
    source: str = "sentinel2"
    year: int = 2023
    scale: int = 30
    gedi_mode: str = "rolling"
    gedi_window: int = 3
    aoi_bounds: Optional[list] = None
    samples: list = []

@app.post("/api/gee/extract-samples", tags=["gee"])
def extract_training_samples(req: ExtractSamplesRequest):
    _require_gee()
    import ee, base64, csv as _csv, io as _io

    source      = req.source
    year        = req.year
    scale       = req.scale
    gedi_mode   = req.gedi_mode
    gedi_window = req.gedi_window
    aoi_bounds  = req.aoi_bounds
    raw_samples = req.samples

    if not raw_samples:
        raise HTTPException(400, "No samples provided.")

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
            raise HTTPException(400, f"Unknown source: {source}")

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
            raise HTTPException(400, "No valid geometries in samples.")

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
            return {"detail": "No pixel values returned — try a larger scale or different AOI/year."}

        rows = [f["properties"] for f in feats]
        band_cols = [k for k in rows[0].keys() if k != "class_label"] if rows else []

        # Build CSV
        csv_buf = _io.StringIO()
        writer = _csv.DictWriter(csv_buf, fieldnames=["class_label"] + band_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        csv_b64 = base64.b64encode(csv_buf.getvalue().encode()).decode()

        return {
            "rows": rows,
            "band_names": band_cols,
            "n_samples": len(rows),
            "csv_b64": csv_b64,
            "source": source,
            "year": year,
        }
    except Exception as exc:
        logger.exception("extract-samples failed")
        raise HTTPException(500, detail=str(exc))



import urllib.request
import urllib.parse
import re
import json

@app.get("/api/datasets/scrape-directory", tags=["rare-data"])
def scrape_directory_endpoint(url: str):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read()
            content_type = response.headers.get('Content-Type', '')
            
            links = []
            
            if 'json' in content_type.lower():
                try:
                    data = json.loads(content)
                    def extract_strings(obj):
                        if isinstance(obj, str):
                            if obj.lower().endswith(('.tif', '.tiff', '.geojson', '.json', '.shp', '.zip')):
                                links.append(obj)
                        elif isinstance(obj, list):
                            for item in obj: extract_strings(item)
                        elif isinstance(obj, dict):
                            for v in obj.values(): extract_strings(v)
                    extract_strings(data)
                except:
                    pass
            else:
                html_str = content.decode('utf-8', errors='ignore')
                raw_links = re.findall(r'href=[\'"]?([^\'" >]+)', html_str)
                for l in raw_links:
                    if l.lower().endswith(('.tif', '.tiff', '.geojson', '.json', '.shp', '.zip')):
                        links.append(l)
                        
            absolute_links = []
            for link in links:
                abs_url = urllib.parse.urljoin(url, link)
                if abs_url not in absolute_links:
                    absolute_links.append(abs_url)
            
            return {"links": absolute_links}
            
    except Exception as e:
        raise HTTPException(500, f"Failed to scrape directory: {str(e)}")


class IngestUrlRequest(BaseModel):
    url: str
    class_label: str = "Unclassified"
    class_value: int = 1
    creator: str = "link_import"

@app.post("/api/samples/ingest-url", tags=["samples"])
def ingest_url_endpoint(req: IngestUrlRequest, request: Request):
    _require_individual_gee(request)
    url = req.url
    import re
    # Convert Google Drive links
    gd_match = re.search(r"drive\.google\.com/file/d/([^/]+)", url)
    if gd_match:
        url = f"https://drive.google.com/uc?export=download&id={gd_match.group(1)}"
    # Convert Dropbox links
    elif "dropbox.com" in url and "dl=0" in url:
        url = url.replace("dl=0", "dl=1")
    
    req.url = url

    from storage.ingestion import parse_url
    info = parse_url(req.url)

    is_vector = info.get("format") == "geojson" or req.url.lower().endswith(".geojson")
    is_raster = not is_vector
    if is_raster:
        import sys, os as _os
        sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), '..', 'rwanda-geoportal'))
        from gee_scripts.gee_asset_upload import push_raster_to_gee
        try:
            if req.url.startswith("kaggle://"):
                from storage.dataset_storage import download_dataset_bytes
                file_bytes = download_dataset_bytes(req.url)
            else:
                req_obj = urllib.request.Request(req.url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_obj, timeout=60) as resp:
                    file_bytes = resp.read()
                
            filename = _os.path.basename(req.url) or "imported_raster.tif"
            if not filename.endswith(".tif") and not filename.endswith(".tiff"):
                filename += ".tif"
            import uuid as _uuid
            asset_name = "url_import_" + _uuid.uuid4().hex[:8]
            
            result = push_raster_to_gee(file_bytes, filename, asset_name)
            
            from storage.dataset_storage import add_dataset, DatasetRecord
            new_dataset = DatasetRecord(
                id=_uuid.uuid4().hex,
                name=req.class_label or filename,
                source="community",
                category="Raster Imagery",
                description=f"Imported from {req.url}",
                storage_key=result.asset_id,
                file_type="tiff",
                layer_type="raster",
            )
            add_dataset(new_dataset)
            
            return {"imported_count": 0, "asset_id": result.asset_id, "kind": "raster", "info": info}
        except Exception as exc:
            logger.warning("Could not ingest raster URL %s: %s", req.url, exc)
            raise HTTPException(status_code=400, detail=f"Failed to ingest raster URL to GEE: {str(exc)}")

    imported_count = 0
    if info.get("format") == "geojson" or req.url.lower().endswith(".geojson"):
        try:
            req_obj = urllib.request.Request(req.url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req_obj, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]
                import uuid as _uuid
                for f in features[:100]:
                    geom = f.get("geometry")
                    if not geom:
                        continue
                    props = f.get("properties", {})
                    cls = props.get("class_label") or props.get("label") or req.class_label
                    sample = TrainingSample(
                        id=_uuid.uuid4().hex,
                        geometry=geom,
                        class_label=cls,
                        class_value=req.class_value,
                        source_filename=os.path.basename(req.url),
                        source_url=req.url,
                        creator=req.creator,
                        color="#3b82f6",
                    )
                    add_sample(sample)
                    imported_count += 1
        except Exception as exc:
            logger.warning("Could not automatically extract features from %s: %s", req.url, exc)
            
    if imported_count == 0:
        # Try using geopandas as a fallback for ALL other formats (shp, zip, kml, gpkg, etc.)
        try:
            import geopandas as gpd
            from shapely.geometry import mapping
            import uuid as _uuid
            
            # GeoPandas handles remote URLs natively
            gdf = gpd.read_file(req.url)
            if gdf.crs is not None:
                gdf = gdf.to_crs(epsg=4326)
                
            for idx, row in gdf.iterrows():
                if imported_count >= 100: break
                geom = row.geometry
                if not geom or geom.is_empty: continue
                
                geom_json = mapping(geom)
                cls = req.class_label
                for col in gdf.columns:
                    if col.lower() in ['class', 'class_label', 'label', 'name', 'type', 'category', 'class_name']:
                        cls = str(row[col])
                        break
                        
                sample = TrainingSample(
                    id=_uuid.uuid4().hex,
                    geometry=geom_json,
                    class_label=cls,
                    class_value=req.class_value,
                    source_filename=os.path.basename(req.url),
                    source_url=req.url,
                    creator=req.creator,
                    color="#3b82f6",
                )
                add_sample(sample)
                imported_count += 1
        except Exception as exc:
            logger.warning("Geopandas fallback failed for %s: %s", req.url, exc)

    if imported_count == 0:
        raise HTTPException(status_code=400, detail="The provided URL does not point to a valid GeoJSON FeatureCollection or spatial dataset that can be imported as training samples.")

    return {"imported_count": imported_count, "info": info}

class ClassifySupervisedRequest(BaseModel):
    data_source: str = "sentinel2"
    custom_asset_id: Optional[str] = None
    samples: list = []
    study_area: Optional[dict] = None


@app.post("/api/classify/supervised", tags=["samples"])
def classify_supervised(req: ClassifySupervisedRequest, request: Request):
    _require_individual_gee(request)
    if not req.samples:
        raise HTTPException(status_code=400, detail="No samples provided for classification.")
    
    import sys, os as _os
    gee_path = _os.path.join(_os.path.dirname(__file__), '..', 'rwanda-geoportal')
    if gee_path not in sys.path:
        sys.path.insert(0, gee_path)
        
    from gee.supervised_classify import train_and_classify
    
    try:
        result = train_and_classify(
            samples=req.samples,
            data_source=req.data_source,
            custom_asset_id=req.custom_asset_id,
            aoi=req.study_area
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Classification failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class ImportDatasetRequest(BaseModel):
    dataset_id: str
    source: str = "admin"
    class_label: Optional[str] = None
    creator: str = "rare_data"


@app.post("/api/samples/import-from-dataset", tags=["samples"])
def import_dataset_endpoint(req: ImportDatasetRequest, request: Request):
    _require_individual_gee(request)
    records = load_metadata(source=req.source)
    record = next((r for r in records if r["id"] == req.dataset_id), None)
    if record is None:
        raise HTTPException(404, "Dataset not found")

    storage_key = record.get("storage_key", "")
    imported_count = 0
    import uuid as _uuid
    default_label = req.class_label or record.get("name", "Dataset_Import")

    # 1. Try reading GeoJSON features from dataset file if format is GeoJSON/JSON
    if record.get("file_type") in ("geojson", "json") or storage_key.endswith(".geojson"):
        try:
            file_bytes = download_dataset_bytes(storage_key)
            data = json.loads(file_bytes.decode("utf-8"))
            features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]
            for f in features[:200]:
                geom = f.get("geometry")
                if not geom:
                    continue
                props = f.get("properties", {})
                cls = props.get("class_label") or props.get("label") or default_label
                sample = TrainingSample(
                    id=_uuid.uuid4().hex,
                    geometry=geom,
                    class_label=cls,
                    source_filename=record.get("original_filename", record.get("name")),
                    source_url="",
                    creator=req.creator,
                    color="#8b5cf6",
                )
                add_sample(sample)
                imported_count += 1
            if imported_count > 0:
                return {"imported_count": imported_count, "dataset_name": record.get("name")}
        except Exception as exc:
            logger.warning("GeoJSON feature extraction failed for dataset %s: %s", req.dataset_id, exc)

    # 2. Try pushing as an Earth Engine image asset if format is a raster (TIFF)
    elif record.get("file_type") in ("tif", "tiff") or storage_key.endswith((".tif", ".tiff")):
        try:
            file_bytes = download_dataset_bytes(storage_key)
            import sys, os as _os
            sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), '..', 'rwanda-geoportal'))
            from gee_scripts.gee_asset_upload import push_raster_to_gee
            
            asset_name = "dataset_import_" + _uuid.uuid4().hex[:8]
            filename = record.get("original_filename") or (record.get("name", "raster") + ".tif")
            if not filename.endswith(".tif") and not filename.endswith(".tiff"):
                filename += ".tif"
            
            result = push_raster_to_gee(file_bytes, filename, asset_name)
            return {"imported_count": 0, "asset_id": result.asset_id, "kind": "raster", "dataset_name": record.get("name")}
        except FileNotFoundError as exc:
            logger.warning("Could not find physical file for dataset %s: %s", req.dataset_id, exc)
            raise HTTPException(
                status_code=404,
                detail=f"The physical file for this dataset is missing from the disk. It may have been deleted or not copied properly. Please re-upload the dataset to the repository."
            )
        except Exception as exc:
            logger.warning("Could not ingest raster dataset %s: %s", req.dataset_id, exc)
            raise HTTPException(status_code=400, detail=f"Failed to ingest raster dataset to GEE: {str(exc)}")

    # 3. Reject if no features or raster could be extracted
    raise HTTPException(status_code=400, detail="This dataset does not contain vector features (e.g. GeoJSON/JSON) suitable for importing as Machine Learning training samples, nor is it a valid raster (TIFF) for asset ingestion. Please download it or view its preview instead.")

    raise HTTPException(400, f"No spatial features or bounding box available for dataset '{record.get('name')}'")
