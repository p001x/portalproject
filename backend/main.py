"""Rwanda GeoPortal — FastAPI backend (all modules).

GEE is initialised in a background thread so uvicorn can bind the port
immediately. Endpoints return HTTP 503 while GEE is still starting up.
"""
import io
import json
import logging
import os

# Add QGIS bin directory to DLL search path for sqlite3 and other QGIS dependencies
if os.name == 'nt' and os.path.exists(r"C:\Program Files\QGIS 3.40.11\bin"):
    os.add_dll_directory(r"C:\Program Files\QGIS 3.40.11\bin")

import logging
import os
import threading
import urllib.request
import zipfile

from dotenv import load_dotenv
load_dotenv()

import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Query, Request, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field


from gee.auth import initialize_gee
from gee.auth import (
    authenticate_individual,
    verify_individual_session,
    logout_individual,
)
from auth_users import (
    get_current_user,
    verify_user,
    create_new_user,
    create_access_token,
    decode_token,
    generate_reset_token,
    reset_password_with_token,
    change_user_password,
)
import auth_db

from gee.irrigation import compute_irrigation_map, compute_irrigation_stats, compute_irrigation_export
from gee.water_harvesting import compute_water_harvesting_map, compute_water_harvesting_stats, compute_water_harvesting_export
from gee.wellscope import (
    compute_wellscope_map,
    compute_wellscope_stats,
    compute_wellscope_classify,
    compute_wellscope_export
)
from gee.biomass import (
    compute_biomass_map,
    compute_biomass_stats,
    compute_biomass_classify,
    compute_biomass_export
)
from gee.aoi_utils import RWANDA_DISTRICTS
from gee.ndvi import compute_ndvi
# Trigger hot reload for Option A+C LST Mono-Window engine
from gee.lst import compute_lst
from gee.rusle import compute_rusle_map, compute_rusle_stats, compute_rusle_classify, compute_rusle_export
from gee.slope import (
    compute_slope_map,
    compute_slope_stats,
    compute_slope_classify,
    compute_slope_export
)
from gee.landfill import (
    compute_landfill_map,
    compute_landfill_stats,
    compute_landfill_classify,
    compute_landfill_export
)
from gee.habitat import (
    compute_habitat,
    compute_ahp_data as compute_habitat_ahp
)
from gee.air_pollution import (
    compute_air_pollution_map,
    compute_air_pollution_stats,
    compute_air_pollution_classify,
    compute_air_pollution_export,
    compute_air_pollution_timeseries,
)
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
from gee.drought import (
    compute_drought_map,
    compute_drought_stats,
    compute_drought_classify,
    compute_drought_export
)
from gee.flood import (
    compute_flood_map,
    compute_flood_stats,
    compute_flood_classify,
    compute_flood_export,
)
from gee.change_detection import compute_change_detection, inspect_change_point
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
async def check_rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    heavy_prefixes = [
        "/api/biomass", "/api/wellscope", "/api/ndvi", "/api/flood",
        "/api/change-detection", "/api/lst", "/api/rusle", "/api/slope",
        "/api/landfill", "/api/habitat", "/api/air-pollution", "/api/landslide",
        "/api/accessibility", "/api/uhi", "/api/drought", "/api/irrigation",
        "/api/water-harvesting", "/api/report", "/api/static-map"
    ]
    if request.method in ["POST", "GET"] and any(path.startswith(prefix) for prefix in heavy_prefixes):
        from auth_users import decode_token
        import auth_db
        from fastapi.responses import JSONResponse
        
        api_key = request.headers.get("X-API-Key")
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer sk_"):
            api_key = auth_header[7:]
        
        email = None
        role = "user"
        if api_key:
            user_rec = auth_db.get_user_by_api_key(api_key)
            if not user_rec:
                return JSONResponse({"detail": "Invalid API Key"}, status_code=401)
            email = user_rec["email"]
            role = user_rec["role"]
        elif auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_token(token)
            if not payload or not payload.get("sub"):
                return JSONResponse({"detail": "Invalid or expired token. Please log in again."}, status_code=401, headers={"WWW-Authenticate": "Bearer"})
            email = payload.get("sub")
            role = payload.get("role", "user")
        else:
            return JSONResponse({"detail": "Authentication required for map processing. Please log in."}, status_code=401, headers={"WWW-Authenticate": "Bearer"})
        
        # Retroactive admin check from auth_users logic
        if email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
            role = "admin"

        if role != "admin":
            # Usage tracking without blocking (Limits removed for all users)
            auth_db.increment_and_check_gee_usage(email, max_requests=999999)
            # if not usage["allowed"]:
            #     return JSONResponse(
            #         {"detail": "Daily GEE processing limit exceeded (15/day). Please try again tomorrow."},
            #         status_code=429
            #     )
    
    return await call_next(request)

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

# ── Auth Endpoints ───────────────────────────────────────────────────────────

from auth_users import create_new_user, verify_user, create_access_token, get_current_user, generate_reset_token, reset_password_with_token
from auth_db import increment_and_check_gee_usage, get_gee_usage

from pydantic import BaseModel, Field
from typing import Optional
from fastapi import Depends, HTTPException

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    email: str
    password: str = Field(..., min_length=8)

@app.get("/api/auth/gee-usage", tags=["auth"])
def get_gee_usage_endpoint(user: dict = Depends(get_current_user)):
    # All users have unlimited access
    used = get_gee_usage(user["email"]) if user.get("role") != "admin" else 0
    return {"used": used, "limit": "Unlimited"}

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)

class ResetPasswordRequest(BaseModel):
    token: str = Field(...)
    new_password: str = Field(..., min_length=6)

class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1)

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


@app.post("/api/auth/register", tags=["auth"])
def register(req: RegisterRequest):
    email = req.email.strip().lower()
    name = req.name.strip()
    try:
        user = create_new_user(name, email, req.password)
        token = create_access_token({"sub": user["email"], "name": user["name"], "role": user["role"]})
        if isinstance(token, bytes):
            token = token.decode("utf-8")
        return {"ok": True, "token": str(token), "user": user}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("Register error: %s", e)
        raise HTTPException(500, f"Registration error: {str(e)}")

@app.post("/api/auth/login", tags=["auth"])
def login(req: LoginRequest):
    email = req.email.strip().lower()
    password = req.password.strip()
    try:
        user = verify_user(email, password)
        if not user:
            # Auto-provision or sync admin user if first time / changed
            existing = auth_db.get_user_by_email(email)
            if not existing:
                try:
                    user = create_new_user(email.split("@")[0].replace(".", " ").title(), email, password)
                except Exception as ex:
                    logger.warning("Could not auto-create user in main.py: %s", ex)
            elif email in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
                try:
                    import bcrypt
                    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                    auth_db.update_user_password(email, password_hash)
                    user = auth_db.get_user_by_email(email)
                except Exception as ex:
                    logger.warning("Could not update admin password in main.py: %s", ex)

            if not user:
                raise HTTPException(401, "Invalid email or password")

        user_dict = {
            "id": str(user.get("id") or user.get("email")),
            "email": str(user["email"]),
            "name": str(user.get("name") or user["email"].split("@")[0]),
            "role": str(user.get("role", "user")),
        }
        token = create_access_token({"sub": user_dict["email"], "name": user_dict["name"], "role": user_dict["role"]})
        if isinstance(token, bytes):
            token = token.decode("utf-8")
        return {"ok": True, "token": str(token), "user": user_dict}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.error("Login 500 error: %s\n%s", e, trace)
        raise HTTPException(500, f"Internal Server Error: {str(e)}\n{trace}")
    except Exception as exc:
        logger.error("FastAPI login error: %s", exc, exc_info=True)
        raise HTTPException(500, f"Login error: {str(exc)}")

@app.post("/api/auth/forgot-password", tags=["auth"])
def forgot_password(req: ForgotPasswordRequest, request: Request):
    try:
        token = generate_reset_token(req.email)
        origin = request.headers.get("origin")
        if origin:
            reset_link = f"{origin}/reset-password?token={token}"
        else:
            reset_link = f"https://geoportal-ui.onrender.com/reset-password?token={token}"
        from email_sender import send_reset_email
        from auth_db import get_user_by_email
        user = get_user_by_email(req.email)
        user_name = user["name"] if user else "Valued User"
        send_reset_email(req.email, reset_link, user_name)
        return {"ok": True, "message": "If the email is registered, a reset link has been sent."}
    except ValueError:
        # Don't leak whether email exists for security
        return {"ok": True, "message": "If the email is registered, a reset link has been sent."}


@app.post("/api/auth/reset-password", tags=["auth"])
def reset_password(req: ResetPasswordRequest):
    try:
        reset_password_with_token(req.token, req.new_password)
        return {"ok": True, "message": "Password has been reset successfully."}
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.get("/api/auth/me", tags=["auth"])
def get_me(user: dict = Depends(get_current_user)):
    return {"ok": True, "user": user}



@app.put("/api/auth/profile", tags=["auth"])
def update_profile(req: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    auth_db.update_user_name(user["email"], req.name)
    user["name"] = req.name
    token = create_access_token({"sub": user["email"], "name": user["name"], "role": user["role"]})
    return {"ok": True, "token": token, "user": user}

@app.post("/api/auth/change-password", tags=["auth"])
def change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    try:
        from auth_users import change_user_password
        change_user_password(user["email"], req.old_password, req.new_password)
        return {"ok": True, "message": "Password changed successfully."}
    except ValueError as e:
        raise HTTPException(400, str(e))

class ServiceRequestModel(BaseModel):
    service_type: str
    message: str

import services_db
import email_notifier

@app.post("/api/services/request", tags=["services"])
def request_service_endpoint(req: ServiceRequestModel, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    try:
        services_db.create_request(user["email"], req.service_type, req.message)
        background_tasks.add_task(email_notifier.send_consultation_alert, user["email"], user.get("name", "User"), req.service_type, req.message)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(400, str(exc))

@app.get("/api/services/requests", tags=["services"])
def get_service_requests_endpoint(user: dict = Depends(get_current_user)):
    return {"requests": services_db.get_all_requests()}

class NewCourseNotification(BaseModel):
    title: str
    description: str

@app.post("/api/admin/notify-new-course", tags=["admin"])
def notify_new_course_endpoint(req: NewCourseNotification, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    from auth_db import get_all_users
    users = get_all_users()
    background_tasks.add_task(email_notifier.send_new_course_alert, users, req.title, req.description)
    return {"ok": True, "notified": len(users)}

# ── Academy ──────────────────────────────────────────────────────────────────

from storage.books_storage import load_books, process_and_store_book_upload, delete_book, get_book_bytes, update_book
from storage.courses_storage import load_courses, create_course, update_course, delete_course

@app.get("/api/academy/books", tags=["academy"])
def api_get_books():
    return {"books": load_books()}

@app.post("/api/academy/books/upload", tags=["academy"])
def api_upload_book(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: Optional[str] = Form("Unknown"),
    description: Optional[str] = Form(""),
    pages: Optional[int] = Form(0),
    user: dict = Depends(get_current_user)
):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized to upload books")
        
    try:
        file_bytes = file.file.read()
        record = process_and_store_book_upload(
            filename=file.filename,
            file_bytes=file_bytes,
            title=title,
            author=author,
            description=description,
            pages=pages
        )
        return {"ok": True, "book": record}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/academy/books/{book_id}", tags=["academy"])
def api_delete_book(book_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    if delete_book(book_id):
        return {"ok": True}
    raise HTTPException(404, "Book not found")

class BookUpdateRequest(BaseModel):
    title: str
    author: Optional[str] = "Unknown"
    description: Optional[str] = ""
    pages: Optional[int] = 0

@app.put("/api/academy/books/{book_id}", tags=["academy"])
def api_update_book(book_id: str, req: BookUpdateRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    
    updated = update_book(book_id, req.title, req.author, req.description, req.pages)
    if updated:
        return {"ok": True, "book": updated}
    raise HTTPException(404, "Book not found")

@app.get("/api/academy/books/{book_id}/download", tags=["academy"])
def api_download_book(book_id: str):
    records = load_books()
    target = next((r for r in records if str(r.get("id")) == str(book_id)), None)
    if not target:
        raise HTTPException(404, "Book not found")
        
    try:
        file_bytes = get_book_bytes(target["storage_key"])
        return Response(
            file_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{target["original_filename"]}"'}
        )
    except Exception as e:
        raise HTTPException(500, str(e))

class FetchBookRequest(BaseModel):
    url: str
    title: str
    author: Optional[str] = "Unknown"
    description: Optional[str] = ""
    pages: Optional[int] = 0

@app.post("/api/academy/books/fetch-from-url", tags=["academy"])
def api_fetch_book_from_url(req: FetchBookRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized to upload books")
    import requests
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        url = req.url
        if "drive.google.com/file/d/" in url:
            import re
            match = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
            if match:
                url = f"https://drive.google.com/uc?export=download&id={match.group(1)}"
        
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        
        filename = req.url.split("/")[-1]
        if not filename.endswith(".pdf") and not ".pdf?" in filename:
            filename += ".pdf"
            
        file_bytes = resp.content
        if not file_bytes.startswith(b'%PDF-'):
            raise HTTPException(400, "The provided URL did not return a valid PDF file. Please ensure it is a direct download link.")

        record = process_and_store_book_upload(
            filename=filename,
            file_bytes=file_bytes,
            title=req.title,
            author=req.author,
            description=req.description,
            pages=req.pages
        )
        return {"ok": True, "book": record}
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch book from URL: {str(e)}")

@app.get("/api/academy/courses", tags=["academy"])
def api_get_courses():
    return {"courses": load_courses()}

class CreateCourseRequest(BaseModel):
    title: str
    description: str
    detailedDescription: str
    videos: Optional[list] = None
    youtubeId: Optional[str] = None
    duration: Optional[str] = "New"
    level: Optional[str] = "Beginner"

@app.post("/api/academy/courses", tags=["academy"])
def api_create_course(req: CreateCourseRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    
    videos = req.videos
    if not videos and req.youtubeId:
        videos = [{
            "id": "v1",
            "title": req.title,
            "youtubeId": req.youtubeId,
            "duration": req.duration or "15m"
        }]
    elif not videos:
        videos = []

    record = create_course(
        title=req.title,
        description=req.description,
        detailed_description=req.detailedDescription,
        videos=videos,
        duration=req.duration,
        level=req.level
    )
    return {"ok": True, "course": record}

class UpdateCourseRequest(BaseModel):
    title: str
    description: str
    detailedDescription: str
    videos: Optional[list] = None
    youtubeId: Optional[str] = None
    duration: Optional[str] = None
    level: Optional[str] = None

@app.put("/api/academy/courses/{course_id}", tags=["academy"])
def api_update_course(course_id: str, req: UpdateCourseRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
        
    videos = req.videos
    if videos is None and req.youtubeId:
        videos = [{
            "id": "v1",
            "title": req.title,
            "youtubeId": req.youtubeId,
            "duration": req.duration or "15m"
        }]

    updated = update_course(
        course_id=course_id,
        title=req.title,
        description=req.description,
        detailed_description=req.detailedDescription,
        videos=videos,
        duration=req.duration,
        level=req.level
    )
    if updated:
        return {"ok": True, "course": updated}
    raise HTTPException(404, "Course not found")

@app.delete("/api/academy/courses/{course_id}", tags=["academy"])
def api_delete_course(course_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    if delete_course(course_id):
        return {"ok": True}
    raise HTTPException(404, "Course not found")

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
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method: natural_breaks, quantiles, equal_interval")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")


class ChangeDetectionRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    before_start: str = Field(..., examples=["2023-01-01"])
    before_end: str = Field(..., examples=["2023-06-30"])
    after_start: str = Field(..., examples=["2024-01-01"])
    after_end: str = Field(..., examples=["2024-06-30"])
    index_type: Optional[str] = Field("NDVI", description="Index: NDVI, NDBI, NDWI, BSI")
    mask_water: Optional[bool] = Field(True, description="Mask permanent water bodies")
    threshold: Optional[float] = Field(None, description="Custom sensitivity threshold")


class ChangeDetectionPointRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    before_start: str = Field(..., examples=["2023-01-01"])
    before_end: str = Field(..., examples=["2023-06-30"])
    after_start: str = Field(..., examples=["2024-01-01"])
    after_end: str = Field(..., examples=["2024-06-30"])
    lat: float
    lng: float
    index_type: Optional[str] = Field("NDVI", description="Index: NDVI, NDBI, NDWI, BSI")



class LSTRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Gasabo"])
    start_date: str = Field(..., examples=["2024-01-01"])
    end_date: str = Field(..., examples=["2024-06-30"])
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")

class LSTPointRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    start_date: str
    end_date: str
    lat: float
    lng: float


class RUSLERequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Huye"])
    start_year: int = Field(2010, ge=1980, le=2024)
    end_year: int = Field(2024, ge=1980, le=2024)
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
    reverse_r: bool = False
    reverse_k: bool = False
    reverse_ls: bool = False
    reverse_c: bool = False
    reverse_p: bool = False


class SlopeInspectRequest(BaseModel):
    aoi: dict
    lat: float
    lon: float

class SlopeProfileRequest(BaseModel):
    aoi: dict
    line: list[list[float]]

class SlopeWatershedRequest(BaseModel):
    lat: float
    lon: float
    level: int = 12

class SlopeEarthworkRequest(BaseModel):
    polygon: list[list[float]]
    target_elevation: float

class GradingZone(BaseModel):
    polygon: list[list[float]]
    target_elevation: float = None
    auto_balance: bool = False

class EarthworkAdvancedRequest(BaseModel):
    polygon: list[list[float]] = None
    zones: list[GradingZone] = None
    target_elevation: float = None
    auto_balance: bool = False
    swell_factor: float = 1.0
    shrink_factor: float = 1.0
    slope_grade: float = 0.0
    slope_angle: float = 0.0
    topsoil_depth: float = 0.0
    batter_ratio: float = 3.0
    strata_layers: list = None
    water_table_depth: float = 0.0
    boreholes: list = None
    custom_dem_id: Optional[str] = None

class SlopeRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Musanze"])
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
    custom_breaks: Optional[list[float]] = Field(None, description="Custom breakpoints")


class LandfillRequest(BaseModel):
    aoi: dict
    reverse_river: bool = False
    reverse_residential: bool = False
    reverse_slope: bool = False
    reverse_road: bool = False
    reverse_lulc: bool = False
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
    custom_weights: Optional[dict] = None

class HabitatRequest(BaseModel):
    aoi: dict
    reverse_flags: dict = Field(default_factory=dict)
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
    classify_method: str = "natural_breaks"
    custom_weights: Optional[dict] = None
    start_year: int = Field(2010, ge=1980, le=2024)
    end_year: int = Field(2024, ge=1980, le=2024)
    landcover_scores: Optional[dict] = Field(None, description="Custom landcover scores mapping")

class HabitatAhpRequest(BaseModel):
    custom_weights: Optional[dict] = None


class AirPollutionRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Nyarugenge"])
    start_date: str = Field(..., examples=["2023-01-01"])
    end_date: str = Field(..., examples=["2023-12-31"])
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")


class LandslideRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Musanze"])
    start_year: int = Field(2015, ge=1981, le=2024)
    end_year: int = Field(2024, ge=1981, le=2024)
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
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
    amenities: list[str] = Field(..., description="List of Origin OSM amenity tags e.g. ['primary_school']")
    dest_amenities: list[str] = Field(default_factory=list, description="List of Destination OSM amenity tags e.g. ['hospital']")
    n_classes: int = Field(4, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
    service_threshold_mins: int = Field(30, ge=5, le=120)
    proposed_facilities: Optional[list[list[float]]] = Field(None, description="List of [lon, lat] points for proposed facilities")
    transport_mode: Optional[str] = Field("walking", description="Transport mode: walking, bicycle, or driving")


class UHIRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Kicukiro"])
    start_date: str = Field(..., examples=["2024-01-01"])
    end_date: str = Field(..., examples=["2024-06-30"])
    grid_size: int = Field(6, ge=3, le=12)
    n_classes: int = Field(5, ge=4, le=10)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")


class DroughtRequest(BaseModel):
    aoi: dict = Field(default_factory=dict, description="AOI Configuration object")
    district: Optional[str] = Field(None, examples=["Kayonza"])
    start_year: int = Field(2010, ge=1980, le=2024)
    end_year: int = Field(2024, ge=1980, le=2024)
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
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
    n_classes: int = Field(5, ge=1, le=15)
    method: Optional[str] = Field("natural_breaks", description="Classification method")
    custom_labels: Optional[list[str]] = Field(None, description="Custom class names/labels")
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
    maps: list[tuple] | list[list] | None = None
    agency_template: str = "STANDARD"
    include_action_matrix: bool = True
    proposed_facilities: Optional[list[list[float]]] = None
    delta_stats: Optional[dict] = None


class StaticMapRequest(BaseModel):
    district: str
    title: str
    url: str
    bbox: Optional[list] = None
    class_areas: Optional[dict] = None
    override_palette: Optional[list[str]] = None
    show_frame: bool = True
    show_grid: bool = False
    show_legend: bool = True
    show_scale: bool = True
    show_compass: bool = True
    show_title: bool = True
    size_multiplier: float = 1.0
    legend_pos: str = 'center left'
    scale_pos: str = 'lower left'
    north_arrow_pos: str = 'top right'
    output_format: str = 'PNG'
    proposed_facilities: Optional[list[list[float]]] = None


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
            agency_template=req.agency_template,
            include_action_matrix=req.include_action_matrix,
            proposed_facilities=req.proposed_facilities,
            delta_stats=req.delta_stats,
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

def _parse_bbox(bbox_val):
    if not bbox_val or not isinstance(bbox_val, list): return None
    if len(bbox_val) > 0 and isinstance(bbox_val[0], list):
        try:
            lons = [p[0] for p in bbox_val]
            lats = [p[1] for p in bbox_val]
            return [min(lons), max(lons), min(lats), max(lats)]
        except: return None
    return bbox_val

@app.post("/api/static-map", tags=["analysis"])
def static_map_endpoint(req: StaticMapRequest):
    _require_gee()
    try:
        raw_png = _download_png(req.url)
        parsed_bbox = _parse_bbox(req.bbox)
        carto_buf = enhance_map_cartography(
            raw_png, req.district, req.title, bbox=parsed_bbox, class_areas=req.class_areas, override_palette=req.override_palette,
            show_frame=req.show_frame, show_grid=req.show_grid, 
            show_legend=req.show_legend, show_scale=req.show_scale, show_compass=req.show_compass,
            show_title=req.show_title,
            size_multiplier=req.size_multiplier,
            legend_pos=req.legend_pos, scale_pos=req.scale_pos, north_arrow_pos=req.north_arrow_pos,
            output_format=req.output_format,
            proposed_facilities=req.proposed_facilities
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


class IrrigationRequest(BaseModel):
    aoi: dict
    start_date: str
    end_date: str
    planting_date: str
    crop_type: str
    n_classes: int = 5
    method: str = "continuous"
    custom_labels: Optional[list] = None

@app.post("/api/irrigation/map", tags=["analysis"])
def irrigation_map_endpoint(req: IrrigationRequest):
    _require_gee()
    try:
        res = compute_irrigation_map(
            req.aoi, 
            req.start_date, 
            req.end_date, 
            req.planting_date, 
            req.crop_type,
            req.n_classes,
            req.method,
            req.custom_labels
        )
        return res
    except Exception as exc:
        logger.exception("Irrigation map failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/irrigation/stats", tags=["analysis"])
def irrigation_stats_endpoint(req: IrrigationRequest):
    _require_gee()
    try:
        res = compute_irrigation_stats(req.aoi, req.start_date, req.end_date, req.planting_date, req.crop_type)
        return res
    except Exception as exc:
        logger.exception("Irrigation stats failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/irrigation/export", tags=["analysis"])
def irrigation_export_endpoint(req: IrrigationRequest):
    _require_gee()
    try:
        res = compute_irrigation_export(req.aoi, req.start_date, req.end_date, req.planting_date, req.crop_type)
        return res
    except Exception as exc:
        logger.exception("Irrigation export failed")
        raise HTTPException(status_code=500, detail=str(exc))


class WaterHarvestingRequest(BaseModel):
    aoi: dict
    start_year: int = Field(2010, ge=1980, le=2024)
    end_year: int = Field(2024, ge=1980, le=2024)
    runoff_coefficient: float = 0.8
    manual_area_m2: Optional[float] = None
    use_building_footprint: bool = False
    household_size: int = 5
    daily_water_use_liters: int = 50

@app.post("/api/water-harvesting/map", tags=["analysis"])
def water_harvesting_map_endpoint(req: WaterHarvestingRequest):
    _require_gee()
    try:
        return compute_water_harvesting_map(req.aoi, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Water harvesting map failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/water-harvesting/stats", tags=["analysis"])
def water_harvesting_stats_endpoint(req: WaterHarvestingRequest):
    _require_gee()
    try:
        return compute_water_harvesting_stats(req.aoi, req.start_year, req.end_year, req.runoff_coefficient, req.manual_area_m2, req.use_building_footprint, req.household_size, req.daily_water_use_liters)
    except Exception as exc:
        logger.exception("Water harvesting stats failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/water-harvesting/export", tags=["analysis"])
def water_harvesting_export_endpoint(req: WaterHarvestingRequest):
    _require_gee()
    try:
        return compute_water_harvesting_export(req.aoi, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Water harvesting export failed")
        raise HTTPException(status_code=500, detail=str(exc))

class WellScopeRequest(BaseModel):
    aoi: dict
    custom_weights: Optional[dict] = None
    n_classes: Optional[int] = 5
    method: Optional[str] = "natural_breaks"
    custom_labels: Optional[list] = None

@app.post("/api/wellscope/map", tags=["analysis"])
def wellscope_map_endpoint(req: WellScopeRequest):
    _require_gee()
    try:
        return compute_wellscope_map(req.aoi, req.custom_weights)
    except Exception as exc:
        logger.exception("WellScope map failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/wellscope/stats", tags=["analysis"])
def wellscope_stats_endpoint(req: WellScopeRequest):
    _require_gee()
    try:
        return compute_wellscope_stats(req.aoi, req.custom_weights)
    except Exception as exc:
        logger.exception("WellScope stats failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/wellscope/classify", tags=["analysis"])
def wellscope_classify_endpoint(req: WellScopeRequest):
    _require_gee()
    try:
        return compute_wellscope_classify(req.aoi, req.custom_weights, req.n_classes, req.method, req.custom_labels)
    except Exception as exc:
        logger.exception("WellScope classify failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/wellscope/export", tags=["analysis"])
def wellscope_export_endpoint(req: WellScopeRequest):
    _require_gee()
    try:
        return compute_wellscope_export(req.aoi, req.custom_weights)
    except Exception as exc:
        logger.exception("WellScope export failed")
        raise HTTPException(status_code=500, detail=str(exc))

class BiomassRequest(BaseModel):
    aoi: dict
    buffer_km: Optional[float] = 3.0
    start_year: int = Field(2019, ge=1980, le=2024)
    end_year: int = Field(2023, ge=1980, le=2024)
    n_classes: Optional[int] = 4
    method: Optional[str] = "natural_breaks"
    custom_labels: Optional[list] = None

@app.post("/api/biomass/map", tags=["analysis"])
def biomass_map_endpoint(req: BiomassRequest):
    _require_gee()
    try:
        return compute_biomass_map(req.aoi, req.buffer_km, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Biomass map failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/biomass/stats", tags=["analysis"])
def biomass_stats_endpoint(req: BiomassRequest):
    _require_gee()
    try:
        return compute_biomass_stats(req.aoi, req.buffer_km, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Biomass stats failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/biomass/classify", tags=["analysis"])
def biomass_classify_endpoint(req: BiomassRequest):
    _require_gee()
    try:
        return compute_biomass_classify(req.aoi, req.buffer_km, req.start_year, req.end_year, req.n_classes, req.method, req.custom_labels)
    except Exception as exc:
        logger.exception("Biomass classify failed")
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/biomass/export", tags=["analysis"])
def biomass_export_endpoint(req: BiomassRequest):
    _require_gee()
    try:
        return compute_biomass_export(req.aoi, req.buffer_km, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Biomass export failed")
        raise HTTPException(status_code=500, detail=str(exc))

class BiomassFactorExportRequest(BaseModel):
    aoi: dict
    factor_key: str
    palette: Optional[list] = None
    buffer_km: Optional[float] = 3.0
    start_year: int = Field(2019, ge=1980, le=2024)
    end_year: int = Field(2023, ge=1980, le=2024)

@app.post("/api/biomass/factor-export", tags=["analysis"])
def biomass_factor_export_endpoint(req: BiomassFactorExportRequest):
    _require_gee()
    try:
        from gee.biomass import export_factor_map
        return export_factor_map(req.aoi, req.factor_key, req.palette, req.buffer_km, req.start_year, req.end_year)
    except Exception as exc:
        logger.exception("Biomass factor export failed")
        raise HTTPException(status_code=500, detail=str(exc))



class WellScopeFactorExportRequest(BaseModel):
    aoi: dict
    factor_key: str
    palette: Optional[list] = None

@app.post("/api/wellscope/factor-export", tags=["analysis"])
def wellscope_factor_export_endpoint(req: WellScopeFactorExportRequest):
    _require_gee()
    try:
        from gee.wellscope import export_factor_map
        return export_factor_map(req.aoi, req.factor_key, req.palette)
    except Exception as exc:
        logger.exception("WellScope factor failed")
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
        parsed_bbox = _parse_bbox(bbox)
        carto_buf = enhance_map_cartography(
            raw_png, district, title, parsed_bbox, class_areas, override_palette,
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

def _get_flood_reverse_flags(req: FloodRequest):
    return {
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

@app.post("/api/flood/map", tags=["analysis"])
def flood_map_endpoint(req: FloodRequest):
    _require_gee()
    try:
        return compute_flood_map(
            aoi_config=req.aoi,
            start_year=req.start_year,
            end_year=req.end_year,
            weights=req.custom_weights,
            reverse_flags=_get_flood_reverse_flags(req),
        )
    except Exception as exc:
        logger.exception("Flood map failed")
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/flood/stats", tags=["analysis"])
def flood_stats_endpoint(req: FloodRequest):
    _require_gee()
    try:
        return compute_flood_stats(
            aoi_config=req.aoi,
            start_year=req.start_year,
            end_year=req.end_year,
            weights=req.custom_weights,
            reverse_flags=_get_flood_reverse_flags(req),
        )
    except Exception as exc:
        logger.exception("Flood stats failed")
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/flood/classify", tags=["analysis"])
def flood_classify_endpoint(req: FloodRequest):
    _require_gee()
    try:
        return compute_flood_classify(
            aoi_config=req.aoi,
            start_year=req.start_year,
            end_year=req.end_year,
            weights=req.custom_weights,
            reverse_flags=_get_flood_reverse_flags(req),
            n_classes=req.n_classes,
            custom_labels=req.custom_labels,
            method=req.method,
        )
    except Exception as exc:
        logger.exception("Flood classify failed")
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/flood/export", tags=["analysis"])
def flood_export_endpoint(req: FloodRequest):
    _require_gee()
    try:
        return compute_flood_export(
            aoi_config=req.aoi,
            start_year=req.start_year,
            end_year=req.end_year,
            weights=req.custom_weights,
            reverse_flags=_get_flood_reverse_flags(req),
        )
    except Exception as exc:
        logger.exception("Flood export failed")
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/ndvi", tags=["analysis"])
def ndvi_endpoint(req: NDVIRequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_ndvi(req.aoi, req.start_date, req.end_date, req.n_classes, method=req.method, custom_labels=req.custom_labels)
    except Exception as exc:
        logger.exception("NDVI failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/change-detection", tags=["analysis"])
def change_detection_endpoint(req: ChangeDetectionRequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_change_detection(
            req.aoi,
            req.before_start,
            req.before_end,
            req.after_start,
            req.after_end,
            index_type=req.index_type or "NDVI",
            mask_water=req.mask_water if req.mask_water is not None else True,
            threshold=req.threshold,
        )
    except Exception as exc:
        logger.exception("Change Detection failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/change-detection/point", tags=["analysis"])
def change_detection_point_endpoint(req: ChangeDetectionPointRequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return inspect_change_point(
            req.aoi,
            req.before_start,
            req.before_end,
            req.after_start,
            req.after_end,
            lat=req.lat,
            lng=req.lng,
            index_type=req.index_type or "NDVI",
        )
    except Exception as exc:
        logger.exception("Change Detection point inspection failed")
        raise HTTPException(500, str(exc)) from exc



@app.post("/api/lst", tags=["analysis"])
def lst_endpoint(req: LSTRequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_lst(req.aoi, req.start_date, req.end_date, req.n_classes, method=req.method, custom_labels=req.custom_labels)
    except Exception as exc:
        logger.exception("LST failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/lst/point", tags=["analysis"])
def lst_point_endpoint(req: LSTPointRequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        from gee.lst import lst_image_and_aoi
        import ee
        lst_median, _ = lst_image_and_aoi(req.aoi, req.start_date, req.end_date)
        point = ee.Geometry.Point([req.lng, req.lat])
        value = lst_median.select("LST").reduceRegion(
            reducer=ee.Reducer.first(),
            geometry=point,
            scale=30
        ).getInfo()
        return {"lst": value.get("LST")}
    except Exception as exc:
        logger.exception("LST point failed")
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/rusle/map", tags=["analysis"])
def rusle_map_endpoint(req: RUSLERequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_rusle_map(req.aoi, req.start_year, req.end_year, req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p)
    except Exception as exc:
        logger.exception("RUSLE map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/rusle/stats", tags=["analysis"])
def rusle_stats_endpoint(req: RUSLERequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_rusle_stats(req.aoi, req.start_year, req.end_year, req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p)
    except Exception as exc:
        logger.exception("RUSLE stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/rusle/classify", tags=["analysis"])
def rusle_classify_endpoint(req: RUSLERequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_rusle_classify(req.aoi, req.start_year, req.end_year, req.n_classes, req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p, method=req.method, custom_labels=req.custom_labels)
    except Exception as exc:
        logger.exception("RUSLE classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/rusle/export", tags=["analysis"])
def rusle_export_endpoint(req: RUSLERequest, user: dict = Depends(get_current_user)):
    _require_gee()
    try:
        return compute_rusle_export(req.aoi, req.start_year, req.end_year, req.reverse_r, req.reverse_k, req.reverse_ls, req.reverse_c, req.reverse_p)
    except Exception as exc:
        logger.exception("RUSLE export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/slope/map", tags=["analysis"])
def slope_map_endpoint(req: SlopeRequest):
    _require_gee()
    try:
        return compute_slope_map(req.aoi)
    except Exception as exc:
        logger.exception("Slope map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/slope/stats", tags=["analysis"])
def slope_stats_endpoint(req: SlopeRequest):
    _require_gee()
    try:
        return compute_slope_stats(req.aoi)
    except Exception as exc:
        logger.exception("Slope stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/slope/classify", tags=["analysis"])
def slope_classify_endpoint(req: SlopeRequest):
    _require_gee()
    try:
        return compute_slope_classify(req.aoi, req.n_classes, method=req.method, custom_labels=req.custom_labels, custom_breaks=req.custom_breaks)
    except Exception as exc:
        logger.exception("Slope classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/slope/export", tags=["analysis"])
def slope_export_endpoint(req: SlopeRequest):
    _require_gee()
    try:
        return compute_slope_export(req.aoi)
    except Exception as exc:
        logger.exception("Slope export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

from gee.slope import inspect_slope_point

@app.post("/api/slope/inspect", tags=["analysis"])
def slope_inspect_endpoint(req: SlopeInspectRequest):
    _require_gee()
    try:
        return inspect_slope_point(req.lat, req.lon, req.aoi)
    except Exception as exc:
        logger.exception("Slope inspect failed")
        raise HTTPException(500, str(exc)) from exc

from gee.slope import profile_slope_line

@app.post("/api/slope/profile", tags=["analysis"])
def slope_profile_endpoint(req: SlopeProfileRequest):
    _require_gee()
    try:
        return profile_slope_line(req.line, req.aoi)
    except Exception as exc:
        logger.exception("Slope profile failed")
        raise HTTPException(500, str(exc)) from exc

from gee.slope import delineate_watershed

@app.post("/api/slope/watershed", tags=["analysis"])
def slope_watershed_endpoint(req: SlopeWatershedRequest):
    _require_gee()
    try:
        return delineate_watershed(req.lat, req.lon, req.level)
    except Exception as exc:
        logger.exception("Watershed delineation failed")
        raise HTTPException(500, str(exc)) from exc

from gee.slope import compute_earthwork

@app.post("/api/slope/earthwork", tags=["analysis"])
def slope_earthwork_endpoint(req: SlopeEarthworkRequest):
    _require_gee()
    try:
        return compute_earthwork(req.polygon, req.target_elevation)
    except Exception as exc:
        logger.exception("Earthwork computation failed")
        raise HTTPException(500, str(exc)) from exc

from gee.earthwork import analyze_earthwork

@app.post("/api/earthwork/analyze", tags=["analysis"])
def api_earthwork_analyze(req: EarthworkAdvancedRequest):
    _require_gee()
    try:
        return analyze_earthwork(
            boreholes=req.boreholes,
            polygon_coords=req.polygon,
            zones=req.zones,
            target_elevation=req.target_elevation,
            auto_balance=req.auto_balance,
            swell_factor=req.swell_factor,
            shrink_factor=req.shrink_factor,
            slope_grade=req.slope_grade,
            slope_angle=req.slope_angle,
            topsoil_depth=req.topsoil_depth,
            batter_ratio=req.batter_ratio,
            water_table_depth=req.water_table_depth,
            strata_layers=req.strata_layers,
            custom_dem_id=req.custom_dem_id
        )
    except Exception as exc:
        logger.exception("Advanced earthwork computation failed")
        raise HTTPException(500, str(exc)) from exc

class EarthworkProfileRequest(BaseModel):
    polygon: list[list[float]]
    line: list[list[float]]
    target_elevation: float
    slope_grade: float = 0.0
    slope_angle: float = 0.0
    topsoil_depth: float = 0.0
    custom_dem_id: Optional[str] = None

from gee.earthwork import profile_earthwork_line

@app.post("/api/earthwork/profile", tags=["analysis"])
def api_earthwork_profile(req: EarthworkProfileRequest):
    _require_gee()
    try:
        return profile_earthwork_line(
            polygon_coords=req.polygon,
            line_coords=req.line,
            target_elevation=req.target_elevation,
            slope_grade=req.slope_grade,
            slope_angle=req.slope_angle,
            topsoil_depth=req.topsoil_depth,
            custom_dem_id=req.custom_dem_id
        )
    except Exception as exc:
        logger.exception("Earthwork profile computation failed")
        raise HTTPException(500, str(exc)) from exc
class Earthwork3DRequest(BaseModel):
    polygon: list[list[float]]
    target_elevation: Optional[float] = None
    slope_grade: float = 0.0
    slope_angle: float = 0.0
    topsoil_depth: float = 0.0
    batter_ratio: float = 3.0
    custom_dem_id: Optional[str] = None

from gee.earthwork import get_earthwork_3d_grid

@app.post("/api/earthwork/3d", tags=["analysis"])
def api_earthwork_3d(req: Earthwork3DRequest):
    _require_gee()
    try:
        return get_earthwork_3d_grid(
            polygon_coords=req.polygon,
            target_elevation=req.target_elevation,
            slope_grade=req.slope_grade,
            slope_angle=req.slope_angle,
            topsoil_depth=req.topsoil_depth,
            batter_ratio=req.batter_ratio,
            custom_dem_id=req.custom_dem_id
        )
    except Exception as exc:
        logger.exception("Earthwork 3D grid computation failed")
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/landfill/map", tags=["analysis"])
def landfill_map_endpoint(req: LandfillRequest):
    _require_gee()
    try:
        return compute_landfill_map(
            req.aoi, req.reverse_river, req.reverse_residential,
            req.reverse_slope, req.reverse_road, req.reverse_lulc, req.custom_weights
        )
    except Exception as exc:
        logger.exception("Landfill map failed for %s", req.aoi.get("name", "unknown"))
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/landfill/stats", tags=["analysis"])
def landfill_stats_endpoint(req: LandfillRequest):
    _require_gee()
    try:
        return compute_landfill_stats(
            req.aoi, req.reverse_river, req.reverse_residential,
            req.reverse_slope, req.reverse_road, req.reverse_lulc, req.custom_weights
        )
    except Exception as exc:
        logger.exception("Landfill stats failed for %s", req.aoi.get("name", "unknown"))
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/landfill/classify", tags=["analysis"])
def landfill_classify_endpoint(req: LandfillRequest):
    _require_gee()
    try:
        return compute_landfill_classify(
            aoi_config=req.aoi,
            reverse_river=req.reverse_river,
            reverse_residential=req.reverse_residential,
            reverse_slope=req.reverse_slope,
            reverse_road=req.reverse_road,
            reverse_lulc=req.reverse_lulc,
            n_classes=req.n_classes,
            method=req.method,
            custom_labels=req.custom_labels,
            custom_weights=req.custom_weights
        )
    except Exception as exc:
        logger.exception("Landfill classify failed for %s", req.aoi.get("name", "unknown"))
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/landfill/export", tags=["analysis"])
def landfill_export_endpoint(req: LandfillRequest):
    _require_gee()
    try:
        return compute_landfill_export(
            req.aoi, req.reverse_river, req.reverse_residential,
            req.reverse_slope, req.reverse_road, req.reverse_lulc, req.custom_weights
        )
    except Exception as exc:
        logger.exception("Landfill export failed for %s", req.aoi.get("name", "unknown"))
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/habitat", tags=["analysis"])
def habitat_endpoint(req: HabitatRequest):
    _require_gee()
    try:
        # FastAPI runs this synchronous endpoint in a threadpool automatically.
        return compute_habitat(
            aoi_config=req.aoi,
            reverse_flags=req.reverse_flags,
            n_classes=req.n_classes,
            custom_weights=req.custom_weights,
            method=req.method,
            custom_labels=req.custom_labels,
            start_year=req.start_year,
            end_year=req.end_year,
            landcover_scores=req.landcover_scores
        )
    except Exception as exc:
        logger.exception("Habitat analysis failed for %s", req.aoi.get("name", "unknown"))
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/habitat/config", tags=["analysis"])
def habitat_config_endpoint():
    from gee.habitat import get_habitat_config
    return get_habitat_config()

@app.post("/api/habitat/ahp", tags=["analysis"])
def habitat_ahp_endpoint(req: HabitatAhpRequest):
    # Does not require GEE map creation
    try:
        return compute_habitat_ahp(req.custom_weights or {})
    except Exception as exc:
        logger.exception("Habitat AHP computation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/air-pollution/map", tags=["analysis"])
def air_pollution_map_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_air_pollution_map(req.aoi, req.start_date, req.end_date)
    except Exception as exc:
        logger.exception("Air pollution map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/air-pollution/stats", tags=["analysis"])
def air_pollution_stats_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_air_pollution_stats(req.aoi, req.start_date, req.end_date)
    except Exception as exc:
        logger.exception("Air pollution stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/air-pollution/classify", tags=["analysis"])
def air_pollution_classify_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_air_pollution_classify(req.aoi, req.start_date, req.end_date, req.n_classes, method=req.method, custom_labels=req.custom_labels)
    except Exception as exc:
        logger.exception("Air pollution classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/air-pollution/export", tags=["analysis"])
def air_pollution_export_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_air_pollution_export(req.aoi, req.start_date, req.end_date)
    except Exception as exc:
        logger.exception("Air pollution export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/air-pollution/timeseries", tags=["analysis"])
def air_pollution_timeseries_endpoint(req: AirPollutionRequest):
    _require_gee()
    try:
        return compute_air_pollution_timeseries(req.aoi, req.start_date, req.end_date)
    except Exception as exc:
        logger.exception("Air pollution timeseries failed for %s", req.district)
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
        return compute_accessibility_map(req.aoi, req.amenities, req.dest_amenities, req.n_classes, req.service_threshold_mins, method=req.method, proposed_facilities=req.proposed_facilities, transport_mode=req.transport_mode)
    except Exception as exc:
        logger.exception("Accessibility map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/stats", tags=["analysis"])
def accessibility_stats_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_stats(req.aoi, req.amenities, req.dest_amenities, req.n_classes, req.service_threshold_mins, proposed_facilities=req.proposed_facilities, transport_mode=req.transport_mode)
    except Exception as exc:
        logger.exception("Accessibility stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/classify", tags=["analysis"])
def accessibility_classify_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_classify(req.aoi, req.amenities, req.dest_amenities, req.n_classes, req.service_threshold_mins, method=req.method, custom_labels=req.custom_labels, proposed_facilities=req.proposed_facilities, transport_mode=req.transport_mode)
    except Exception as exc:
        logger.exception("Accessibility classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/accessibility/export", tags=["analysis"])
def accessibility_export_endpoint(req: AccessibilityRequest):
    _require_gee()
    try:
        return compute_accessibility_export(req.aoi, req.amenities, req.dest_amenities, req.n_classes, req.service_threshold_mins, proposed_facilities=req.proposed_facilities, transport_mode=req.transport_mode)
    except Exception as exc:
        logger.exception("Accessibility export failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/uhi", tags=["analysis"])
def uhi_endpoint(req: UHIRequest):
    _require_gee()
    try:
        return compute_uhi(
            req.aoi,
            req.start_date,
            req.end_date,
            req.grid_size,
            req.n_classes,
            req.method,
            req.custom_labels
        )
    except Exception as exc:
        logger.exception("UHI analysis failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc


@app.post("/api/drought/map", tags=["analysis"])
def drought_map_endpoint(req: DroughtRequest):
    _require_gee()
    try:
        return compute_drought_map(
            req.aoi, req.start_year, req.end_year,
            reverse_sm=req.reverse_sm,
            reverse_rf=req.reverse_rf,
            reverse_ndvi=req.reverse_ndvi,
            reverse_vci=req.reverse_vci,
            reverse_lst=req.reverse_lst,
            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
        )
    except Exception as exc:
        logger.exception("Drought map failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/drought/stats", tags=["analysis"])
def drought_stats_endpoint(req: DroughtRequest):
    _require_gee()
    try:
        return compute_drought_stats(
            req.aoi, req.start_year, req.end_year,
            reverse_sm=req.reverse_sm,
            reverse_rf=req.reverse_rf,
            reverse_ndvi=req.reverse_ndvi,
            reverse_vci=req.reverse_vci,
            reverse_lst=req.reverse_lst,
            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
        )
    except Exception as exc:
        logger.exception("Drought stats failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/drought/classify", tags=["analysis"])
def drought_classify_endpoint(req: DroughtRequest):
    _require_gee()
    try:
        return compute_drought_classify(
            req.aoi, req.start_year, req.end_year, req.n_classes,
            reverse_sm=req.reverse_sm,
            reverse_rf=req.reverse_rf,
            reverse_ndvi=req.reverse_ndvi,
            reverse_vci=req.reverse_vci,
            reverse_lst=req.reverse_lst,
            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
            method=req.method, custom_labels=req.custom_labels
        )
    except Exception as exc:
        logger.exception("Drought classify failed for %s", req.district)
        raise HTTPException(500, str(exc)) from exc

@app.post("/api/drought/export", tags=["analysis"])
def drought_export_endpoint(req: DroughtRequest):
    _require_gee()
    try:
        return compute_drought_export(
            req.aoi, req.start_year, req.end_year,
            reverse_sm=req.reverse_sm,
            reverse_rf=req.reverse_rf,
            reverse_ndvi=req.reverse_ndvi,
            reverse_vci=req.reverse_vci,
            reverse_lst=req.reverse_lst,
            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
        )
    except Exception as exc:
        logger.exception("Drought export failed for %s", req.district)
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
@app.get("/api/datasets/{dataset_id}/raw", tags=["rare-data"])
def download_dataset(dataset_id: str, source: Optional[str] = Query(None)):
    record = None
    if source in ("admin", "community"):
        records = load_metadata(source=source)
        record = next((r for r in records if r["id"] == dataset_id), None)
    else:
        for s in ("community", "admin"):
            records = load_metadata(source=s)
            record = next((r for r in records if r["id"] == dataset_id), None)
            if record:
                break

    if record is None:
        raise HTTPException(404, "Dataset not found")
    try:
        file_bytes = download_dataset_bytes(record["storage_key"])
    except Exception as exc:
        raise HTTPException(500, f"Could not fetch file: {exc}") from exc

    content_type = "image/tiff" if record.get("file_type") == "raster" or record.get("original_filename", "").endswith((".tif", ".tiff")) else "application/octet-stream"

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{record["original_filename"]}"',
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.delete("/api/datasets/{dataset_id}", tags=["rare-data"])
def delete_dataset(dataset_id: str, source: str = Query("admin", pattern="^(admin|community|all)$")):
    if source == "all":
        ok_admin = delete_record(dataset_id, source="admin")
        ok_community = delete_record(dataset_id, source="community")
        if not (ok_admin or ok_community):
            raise HTTPException(404, "Dataset not found in any source")
    else:
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


@app.post("/api/admin/logo/upload", tags=["admin"])
async def upload_logo(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    react_dest = os.path.join(base_dir, "artifacts", "geoportal", "public", "logo.png")
    streamlit_dest = os.path.join(base_dir, "rwanda-geoportal", "assets", "logo.png")
    
    try:
        os.makedirs(os.path.dirname(react_dest), exist_ok=True)
        os.makedirs(os.path.dirname(streamlit_dest), exist_ok=True)
        
        file_bytes = await file.read()
        with open(react_dest, "wb") as f:
            f.write(file_bytes)
        with open(streamlit_dest, "wb") as f:
            f.write(file_bytes)
            
        return {"url": "/logo.png?t=" + str(os.path.getmtime(react_dest))}
    except Exception as e:
        logger.exception("Failed to save logo")
        raise HTTPException(status_code=500, detail=str(e))


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
    ml_model: str = "random_forest"
    train_split: int = 70
    use_indices: bool = True
    hyperparam_trees: int = 50


import threading
_cache_locks = {}
_cache_locks_lock = threading.Lock()

def _resolve_raster_local_or_cached(url: str) -> str:
    import os, tempfile
    from storage.link_resolver import _drive_file_id, resolve_link_to_file

    if url.startswith("hf://"):
        url = "https://huggingface.co/" + url[len("hf://"):]

    is_portal_storage = not (url.startswith("http://") or url.startswith("https://"))
    
    if is_portal_storage:
        from storage.dataset_storage import download_dataset_bytes, get_dataset_local_path
        lp = get_dataset_local_path(url)
        if lp and os.path.exists(lp):
            return lp
        cache_key = url.replace('/', '_').replace(':', '_')[:80]
        temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}.tif")
        
        with _cache_locks_lock:
            if cache_key not in _cache_locks:
                _cache_locks[cache_key] = threading.Lock()
            file_lock = _cache_locks[cache_key]
            
        with file_lock:
            needs_download = True
            if os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
                try:
                    import rasterio
                    with rasterio.open(temp_path) as src:
                        pass
                    needs_download = False
                except Exception:
                    needs_download = True
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass
                        
            if needs_download:
                file_bytes = download_dataset_bytes(url)
                with open(temp_path, "wb") as f:
                    f.write(file_bytes)
        return temp_path

    # For external public URLs ending in .tif, we can use GDAL's virtual streaming (vsicurl)
    # Rasterio natively treats http/https paths as /vsicurl/ if they don't require auth forms
    if url.lower().endswith((".tif", ".tiff")):
        if "huggingface.co" in url or "githubusercontent.com" in url or ("kaggle" not in url and "drive.google" not in url and "dropbox" not in url):
            return url

    # Fallback to direct-to-disk streaming cache for Drive, Kaggle, Dropbox, etc.
    fid = _drive_file_id(url)
    cache_key = f"drive_{fid}" if fid else url.replace('/', '_').replace(':', '_').replace('?', '_').replace('&', '_')[:80]
    temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}.tif")
    
    with _cache_locks_lock:
        if cache_key not in _cache_locks:
            _cache_locks[cache_key] = threading.Lock()
        file_lock = _cache_locks[cache_key]
        
    with file_lock:
        needs_download = True
        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
            try:
                import rasterio
                with rasterio.open(temp_path) as src:
                    pass
                needs_download = False
            except Exception:
                needs_download = True
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
                    
        if needs_download:
            resolve_link_to_file(url, temp_path, max_mb=50000)
        
    return temp_path


@app.get("/api/native/imagery/bounds", tags=["samples"])
def native_imagery_bounds(url: str, request: Request):
    from rio_tiler.io import Reader

    try:
        raster_path = _resolve_raster_local_or_cached(url)
        with Reader(raster_path) as src:
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
    import io
    from rio_tiler.io import Reader
    from fastapi.responses import Response
    from PIL import Image
    import numpy as np

    try:
        raster_path = _resolve_raster_local_or_cached(url)
        with Reader(raster_path) as src:
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
                
            # Heuristic: exclude implicit nodata (0, <=-999, NaN) from stretching and make them transparent later
            implicit_nodata = np.isnan(data[0])
            if bands == 1:
                implicit_nodata = implicit_nodata | (data[0] == 0) | (data[0] <= -999)
            else:
                implicit_nodata = implicit_nodata | ((data[0] == 0) & (data[1] == 0) & (data[2] == 0)) | (data[0] <= -999)
                
            if img.mask is None or img.mask.all():
                valid_mask = valid_mask & ~implicit_nodata
                
            is_uint8 = data.dtype == np.uint8
            
            for b in range(min(bands, 3)):
                if is_uint8:
                    rgb_arr[:, :, b] = data[b]
                else:
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
                                # Map single valid positive values (like a binary mask of 1s) to bright white, not dim grey
                                rgb_arr[valid_mask, b] = 255
            
            if bands == 1:
                rgb_arr[:, :, 1] = rgb_arr[:, :, 0]
                rgb_arr[:, :, 2] = rgb_arr[:, :, 0]
                
            # Alpha channel
            rgb_arr[:, :, 3] = 255
            if img.mask is not None:
                rgb_arr[img.mask == 0, 3] = 0
                
            if img.mask is None or img.mask.all():
                rgb_arr[implicit_nodata, 3] = 0
                
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
            custom_asset_id=req.custom_asset_id,
            ml_model=req.ml_model,
            train_split=req.train_split,
            use_indices=req.use_indices,
            hyperparam_trees=req.hyperparam_trees
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
        alt_source = "community" if source == "admin" else "admin"
        records = load_metadata(source=alt_source)
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
def ingest_url_endpoint(req: IngestUrlRequest, background_tasks: BackgroundTasks, request: Request):
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
        import uuid as _uuid
        import ee
        try:
            asset_name = "url_import_" + _uuid.uuid4().hex[:8]
            project = ee.data._cloud_api_user_project
            if not project:
                # fallback to service account project or default
                project = "ee-petersonyang87"
            
            asset_id = f"projects/{project}/assets/{asset_name}"
            
            # Start the background task (reusing the one we built for cloud ingestion)
            background_tasks.add_task(background_download_and_ingest, req.url, asset_id, project)
            
            # We don't save the dataset record yet because it's not finished, 
            # or we could save a placeholder. Let's just return background=True
            return {"imported_count": 0, "asset_id": asset_id, "kind": "raster", "info": info, "background": True}
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


# ── Community Forum Endpoints ────────────────────────────────────────────────
import community_db
import security_middleware
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, Field
from typing import Optional, List
from fastapi import UploadFile, File, WebSocket, WebSocketDisconnect
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass

manager = ConnectionManager()

class CommentCreateRequest(BaseModel):
    author: str = Field(..., min_length=2, max_length=50)
    content: str = Field(..., min_length=1, max_length=5000)
    tag: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[int] = None
    category: Optional[str] = "General"

@app.get("/api/community/comments", tags=["community"])
def api_get_comments(tag: Optional[str] = None, search: Optional[str] = None, limit: int = 100, offset: int = 0, category: Optional[str] = None):
    return {
        "comments": community_db.get_comments(tag_filter=tag, search=search, limit=limit, offset=offset, category=category),
        "is_frozen": community_db.is_forum_frozen(),
        "blocked_users": community_db.get_blocked_users()
    }

import time
from fastapi import Request

_COMMUNITY_RATE_LIMITS = {}

@app.post("/api/community/comments", tags=["community"])
def api_post_comment(req: CommentCreateRequest, request: Request):
    if community_db.is_forum_frozen():
        raise HTTPException(403, "The community forum is currently frozen. No new comments can be posted.")
        
    if community_db.is_user_blocked(req.author):
        raise HTTPException(403, "You have been blocked from posting in the community forum.")

    client_ip = request.client.host if request.client else "unknown_ip"
    current_time = time.time()
    
    # Check rate limit (2 minutes = 120 seconds)
    author_key = f"author_{req.author.lower()}"
    ip_key = f"ip_{client_ip}"
    
    for key in [author_key, ip_key]:
        last_time = _COMMUNITY_RATE_LIMITS.get(key, 0)
        if current_time - last_time < 10:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. You can only send 1 message every 10 seconds.")
            
    try:
        safe_content = security_middleware.validate_and_sanitize_text(req.content)
        safe_author = security_middleware.validate_and_sanitize_text(req.author)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Update rate limits
    _COMMUNITY_RATE_LIMITS[author_key] = current_time
    _COMMUNITY_RATE_LIMITS[ip_key] = current_time
        
    comment_id = community_db.add_comment(
        author=safe_author,
        content=safe_content,
        tag=req.tag,
        image_url=req.image_url,
        parent_id=req.parent_id,
        category=req.category
    )
    
    # Fire and forget async broadcast (we can just run it using asyncio or BackgroundTasks)
    import asyncio
    asyncio.create_task(manager.broadcast({"type": "new_comment", "id": comment_id, "category": req.category}))
    
    return {"status": "success", "id": comment_id}

class ToggleUpvoteRequest(BaseModel):
    author: str

@app.post("/api/community/comments/{comment_id}/toggle-upvote", tags=["community"])
def api_toggle_upvote(comment_id: int, req: ToggleUpvoteRequest):
    if community_db.is_forum_frozen():
        raise HTTPException(403, "The community forum is currently frozen.")
    if community_db.is_user_blocked(req.author):
        raise HTTPException(403, "You have been blocked from the community forum.")
        
    is_upvoted = community_db.toggle_upvote(comment_id, req.author)
    
    import asyncio
    asyncio.create_task(manager.broadcast({"type": "upvote", "id": comment_id}))
    
    return {"status": "success", "is_upvoted": is_upvoted}

class CommentUpdateRequest(BaseModel):
    author: str
    content: str

@app.put("/api/community/comments/{comment_id}", tags=["community"])
def api_update_comment(comment_id: int, req: CommentUpdateRequest):
    if community_db.is_forum_frozen():
        raise HTTPException(403, "The community forum is currently frozen. No comments can be edited.")
    
    if community_db.is_user_blocked(req.author):
        raise HTTPException(403, "You have been blocked from editing in the community forum.")
        
    comment = community_db.get_comment(comment_id)
    if not comment:
        raise HTTPException(404, "Comment not found")
        
    if comment["author"] != req.author:
        raise HTTPException(403, "You can only edit your own messages.")
        
    import datetime
    timestamp = datetime.datetime.fromisoformat(comment["timestamp"])
    if (datetime.datetime.utcnow() - timestamp).total_seconds() > 900:
        raise HTTPException(403, "You can only edit messages within 15 minutes of posting.")
        
    try:
        safe_content = security_middleware.validate_and_sanitize_text(req.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    community_db.update_comment(comment_id, safe_content)
    return {"status": "success"}

@app.delete("/api/community/comments/{comment_id}", tags=["community"])
def api_delete_comment(comment_id: int, request: Request, author: Optional[str] = None):
    # Try to get user from token
    user = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from auth_users import decode_token
        user = decode_token(auth_header[7:])
        
    comment = community_db.get_comment(comment_id)
    if not comment:
        raise HTTPException(404, "Comment not found")
        
    if user and user.get("role") == "admin":
        pass # Admins can delete any comment
    else:
        if not author or comment["author"] != author:
            raise HTTPException(403, "You can only delete your own messages.")
            
    community_db.delete_comment(comment_id)
    return {"ok": True}

class ForumFreezeRequest(BaseModel):
    frozen: bool

@app.post("/api/community/settings/freeze", tags=["community"])
def api_freeze_forum(req: ForumFreezeRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required.")
    community_db.set_forum_frozen(req.frozen)
    return {"ok": True}

class BlockUserRequest(BaseModel):
    author: str

@app.post("/api/community/users/block", tags=["community"])
def api_block_user(req: BlockUserRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required.")
    community_db.block_user(req.author)
    return {"ok": True}

@app.post("/api/community/users/unblock", tags=["community"])
def api_unblock_user(req: BlockUserRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required.")
    community_db.unblock_user(req.author)
    return {"ok": True}
    
@app.post("/api/community/upload", tags=["community"])
async def api_upload_community_image(file: UploadFile = File(...)):
    file_bytes = await file.read()
    
    try:
        safe_jpg_bytes = security_middleware.validate_and_reencode_image(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    import uuid
    filename = f"{uuid.uuid4().hex}.jpg"
    
    upload_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as f:
        f.write(safe_jpg_bytes)
        
    return {"url": f"/api/static/uploads/{filename}"}

# Mount static files for community images
static_upload_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
os.makedirs(static_upload_dir, exist_ok=True)
try:
    app.mount("/api/static/uploads", StaticFiles(directory=static_upload_dir), name="uploads")
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Failed to mount static uploads (aiofiles missing?): {e}")

# --- User Profiles ---
class ProfileUpdateRequest(BaseModel):
    bio: str
    avatar_url: Optional[str] = None

@app.get("/api/community/profile/{author}", tags=["community"])
def api_get_profile(author: str):
    return community_db.get_user_profile(author)

@app.put("/api/community/profile/{author}", tags=["community"])
def api_update_profile(author: str, req: ProfileUpdateRequest):
    community_db.update_user_profile(author, req.bio, req.avatar_url)
    return {"status": "success"}

# --- Notifications ---
@app.get("/api/community/notifications/{author}", tags=["community"])
def api_get_notifications(author: str):
    return {"notifications": community_db.get_notifications(author)}

@app.post("/api/community/notifications/{author}/read", tags=["community"])
def api_mark_notifications_read(author: str):
    community_db.mark_notifications_read(author)
    return {"status": "success"}

# --- WebSocket ---
@app.websocket("/api/community/ws")
async def websocket_community_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect messages from client, but keep connection open
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


class IngestRasterModel(BaseModel):
    source_url: str
    target_asset_id: Optional[str] = None

def background_download_and_ingest(url: str, asset_id: str, custom_project: Optional[str] = None):
    import requests
    import os
    import tempfile
    import subprocess
    import logging
    
    temp_filepath = None
    try:
        logging.info(f"Background Ingest: Downloading {url} to temp file...")
        resp = requests.get(url, stream=True)
        resp.raise_for_status()
        
        fd, temp_filepath = tempfile.mkstemp(suffix=".tif")
        with os.fdopen(fd, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    
        logging.info(f"Background Ingest: Download complete. Pushing to GEE...")
        
        cmd = ["earthengine"]
        sa_key_file = None
        key_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
        if key_json:
            sa_key_file = os.path.join(tempfile.gettempdir(), f"gee_sa_{uuid.uuid4().hex[:6]}.json")
            with open(sa_key_file, "w", encoding="utf-8") as f:
                f.write(key_json)
            cmd.extend(["--service_account_file", sa_key_file])
        else:
            local_key = os.path.abspath(os.path.join(os.path.dirname(__file__), "gee_key.json"))
            if os.path.exists(local_key):
                cmd.extend(["--service_account_file", local_key])

        cmd.extend(["upload", "image", "--asset_id", asset_id, temp_filepath])
            
        result = subprocess.run(cmd, capture_output=True, text=True)

        if sa_key_file and os.path.exists(sa_key_file):
            try:
                os.remove(sa_key_file)
            except Exception:
                pass
        
        if result.returncode != 0:
            logging.error(f"Error uploading to GEE: {result.stderr}")
        else:
            logging.info(f"Successfully started GEE upload task for {asset_id}")
            
    except Exception as e:
        logging.error(f"Background ingest failed for {url}: {e}")
    finally:
        if temp_filepath and os.path.exists(temp_filepath):
            os.remove(temp_filepath)
            logging.info(f"Background Ingest: Cleaned up temporary file {temp_filepath}")

@app.post("/api/gee/ingest-raster", tags=["gee"])
def api_ingest_raster(req: IngestRasterModel, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    try:
        import ee
        import uuid
        
        url = req.source_url
        asset_id = req.target_asset_id
        project = ee.data._cloud_api_user_project
        
        if not asset_id:
            if not project:
                raise ValueError("Could not determine GEE project. Please provide a full target_asset_id.")
            asset_id = f"projects/{project}/assets/ingest_{uuid.uuid4().hex[:8]}"

        if url.startswith("gs://"):
            # Direct server-side ingestion
            request_id = uuid.uuid4().hex
            manifest = {
                "name": asset_id,
                "tilesets": [{"id": "t1", "sources": [{"uris": [url]}]}]
            }
            ee.data.startIngestion(request_id, manifest)
            return {"ok": True, "message": f"Direct GCS Ingestion task started. Target: {asset_id}"}
        
        elif url.startswith("http://") or url.startswith("https://"):
            # Background pipeline
            background_tasks.add_task(background_download_and_ingest, url, asset_id, project)
            return {"ok": True, "message": f"HTTP Download started in background. Target: {asset_id}"}
        
        else:
            raise ValueError("URL must start with gs://, http://, or https://")
            
    except Exception as exc:
        raise HTTPException(400, str(exc))


# ── Blog / CMS Routes ────────────────────────────────────────────────────────

import uuid
import shutil
import blog_db

class BlogPostCreate(BaseModel):
    title: str
    excerpt: str = ""
    category: str = "News"
    content: str
    image_url: str = ""
    read_time: str = "2 min read"

class BlogPostUpdate(BaseModel):
    title: str
    excerpt: str = ""
    category: str = "News"
    content: str
    image_url: str = ""
    read_time: str = "2 min read"

@app.get("/api/blog/posts", tags=["blog"])
def get_blog_posts(limit: int = 100):
    posts = blog_db.get_posts(limit)
    return {"posts": posts}

@app.get("/api/blog/posts/{post_id}", tags=["blog"])
def get_blog_post(post_id: int):
    post = blog_db.get_post(post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    return {"post": post}

@app.post("/api/blog/posts", tags=["blog"])
def create_blog_post(post: BlogPostCreate, user: dict = Depends(get_current_user)):
    try:
        post_id = blog_db.create_post(
            title=post.title,
            excerpt=post.excerpt,
            category=post.category,
            content=post.content,
            image_url=post.image_url,
            read_time=post.read_time
        )
        return {"ok": True, "id": post_id}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.put("/api/blog/posts/{post_id}", tags=["blog"])
def update_blog_post(post_id: int, post: BlogPostUpdate, user: dict = Depends(get_current_user)):
    try:
        updated = blog_db.update_post(
            post_id=post_id,
            title=post.title,
            excerpt=post.excerpt,
            category=post.category,
            content=post.content,
            image_url=post.image_url,
            read_time=post.read_time
        )
        if not updated:
            raise HTTPException(404, "Post not found")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/blog/posts/{post_id}", tags=["blog"])
def delete_blog_post(post_id: int, user: dict = Depends(get_current_user)):
    try:
        deleted = blog_db.delete_post(post_id)
        if not deleted:
            raise HTTPException(404, "Post not found")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/blog/upload", tags=["blog"])
def upload_blog_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        upload_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        ext = os.path.splitext(file.filename)[1]
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"url": f"/api/static/uploads/{filename}"}
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")


# ── Universal Spatial Data Harvester Routes ──────────────────────────────────
from dataclasses import asdict
from harvester import (
    HarvesterScanner,
    HarvesterTransferManager,
    create_task,
    get_task,
    update_task,
)
from fastapi.responses import StreamingResponse


class HarvesterScanRequest(BaseModel):
    url: str


class HarvesterSaveToPortalRequest(BaseModel):
    url: str
    name: Optional[str] = None
    class_label: Optional[str] = None
    category: Optional[str] = "admin"
    internal_path: Optional[str] = None


class HarvesterPushToGeeRequest(BaseModel):
    url: str
    asset_id: Optional[str] = None
    target_project: Optional[str] = None


@app.post("/api/harvester/scan", tags=["harvester"])
def api_harvester_scan(req: HarvesterScanRequest):
    try:
        res = HarvesterScanner.scan_url(req.url)
        return res
    except Exception as exc:
        logger.error("Harvester scan error: %s", exc)
        raise HTTPException(400, str(exc))


@app.get("/api/harvester/download", tags=["harvester"])
def api_harvester_download(url: str, filename: Optional[str] = None):
    """
    Proxy-download any spatial dataset URL through the server.
    Supports Google Drive, Dropbox, and SSL fallback for legacy/government servers.
    """
    try:
        try:
            from storage.link_resolver import resolve_link_url
            url = resolve_link_url(url)
        except Exception:
            pass

        _headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
        }
        # Attempt verified first, fall back to unverified for govt/legacy servers
        try:
            req_stream = requests.get(url, headers=_headers, stream=True, timeout=180, verify=True)
        except requests.exceptions.SSLError:
            logger.warning("SSL verification failed for %s – retrying without verify", url)
            req_stream = requests.get(url, headers=_headers, stream=True, timeout=180, verify=False)

        req_stream.raise_for_status()

        # Build a safe filename
        _raw_name = filename
        if not _raw_name:
            from urllib.parse import urlparse, unquote
            _path = unquote(urlparse(url).path)
            _raw_name = _path.rstrip("/").split("/")[-1]
        target_filename = _raw_name or "spatial_dataset"
        # Strip query params that may have leaked into the name
        target_filename = target_filename.split("?")[0] or "spatial_dataset"

        content_type = req_stream.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
        content_length = req_stream.headers.get("Content-Length")

        resp_headers: dict = {
            "Content-Disposition": f'attachment; filename="{target_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
        }
        if content_length:
            resp_headers["Content-Length"] = content_length

        logger.info("Streaming download: %s → %s (%s)", url, target_filename, content_type)

        def _stream():
            try:
                for chunk in req_stream.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            finally:
                req_stream.close()

        return StreamingResponse(
            _stream(),
            media_type=content_type,
            headers=resp_headers,
        )
    except requests.exceptions.HTTPError as exc:
        logger.error("Download HTTP error %s for %s", exc.response.status_code, url)
        raise HTTPException(400, f"Remote server returned {exc.response.status_code}: {exc.response.reason}")
    except requests.exceptions.ConnectionError as exc:
        logger.error("Download connection error for %s: %s", url, exc)
        raise HTTPException(400, "Could not connect to the remote server. Check the URL and try again.")
    except requests.exceptions.Timeout:
        logger.error("Download timeout for %s", url)
        raise HTTPException(408, "Remote server timed out. Try again or download directly.")
    except Exception as exc:
        logger.error("Download unexpected error for %s: %s", url, exc, exc_info=True)
        raise HTTPException(500, f"Download failed: {str(exc)}")


@app.post("/api/harvester/save-to-portal", tags=["harvester"])
def api_harvester_save_to_portal(req: HarvesterSaveToPortalRequest, background_tasks: BackgroundTasks):
    try:
        from harvester import create_task
        task = create_task(action="save_to_portal", source_url=req.url, target_name=req.name or "portal_dataset")
        background_tasks.add_task(
            HarvesterTransferManager.save_to_portal_repository_async,
            task.task_id,
            req.url,
            req.name or "",
            req.class_label,
            req.category or "admin",  # Default to admin so it shows in Rare Data
            req.internal_path
        )
        return {"task_id": task.task_id, "message": "Download to portal started in background."}
    except Exception as exc:
        logger.error("Save to portal failed: %s", exc)
        raise HTTPException(400, str(exc))


@app.post("/api/harvester/push-to-gee", tags=["harvester"])
def api_harvester_push_to_gee(req: HarvesterPushToGeeRequest, background_tasks: BackgroundTasks, request: Request):
    user_project = req.target_project
    # If individual GEE token is provided, verify it and extract user project
    token = request.headers.get("X-GEE-Token") or request.query_params.get("gee_token")
    if token:
        try:
            session = verify_individual_session(token)
            if session and session.get("project_name"):
                user_project = session["project_name"]
        except Exception as err:
            logger.warning("Optional individual GEE token verification note: %s", err)

    try:
        task = create_task(action="push_to_gee", source_url=req.url, target_name=req.asset_id or "gee_asset")
        background_tasks.add_task(
            HarvesterTransferManager.push_to_gee_asset_async,
            task.task_id,
            req.url,
            req.asset_id,
            user_project
        )
        return {"task_id": task.task_id, "message": f"Ingestion started in background. Task ID: {task.task_id}"}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/harvester/tasks/{task_id}", tags=["harvester"])
def api_harvester_get_task(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return asdict(task)


@app.post("/api/harvester/tasks/{task_id}/cancel", tags=["harvester"])
def api_harvester_cancel_task(task_id: str):
    from harvester import cancel_task
    ok = cancel_task(task_id)
    if not ok:
        raise HTTPException(404, "Task not found")
    return {"ok": True, "message": "Task stopped."}


@app.delete("/api/harvester/tasks/{task_id}", tags=["harvester"])
def api_harvester_delete_task(task_id: str):
    from harvester import delete_task
    ok = delete_task(task_id)
    if not ok:
        raise HTTPException(404, "Task not found")
    return {"ok": True, "message": "Task removed."}

@app.get("/api/debug/datasets", tags=["debug"])
def debug_datasets():
    try:
        import sqlite3
        conn = sqlite3.connect("geoportal.db")
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, status, error_message, storage_key, original_filename, created_at FROM datasets ORDER BY created_at DESC LIMIT 20")
        rows = cursor.fetchall()
        columns = [description[0] for description in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        return {"datasets": result}
    except Exception as e:
        return {"error": str(e)}



from gee.earthwork import get_earthwork_3d_surface

@app.post("/api/earthwork/surface3d", tags=["analysis"])
def api_earthwork_surface3d(req: EarthworkAdvancedRequest):
    _require_gee()
    try:
        pts = get_earthwork_3d_surface(
            polygon_coords=req.polygon,
            target_elevation=req.target_elevation,
            slope_grade=req.slope_grade,
            slope_angle=req.slope_angle,
            topsoil_depth=req.topsoil_depth,
            batter_ratio=req.batter_ratio,
            custom_dem_id=req.custom_dem_id
        )
        return {"points": pts}
    except Exception as exc:
        logger.exception("3D surface computation failed")
        raise HTTPException(500, str(exc)) from exc
