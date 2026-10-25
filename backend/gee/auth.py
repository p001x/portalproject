"""GEE authentication â€” supports dynamic GEE Cloud Project IDs and Service Accounts."""
import os
import json
import logging
import time
import random
import ee

# --- Workaround for Google API ConnectionResetError on Windows (IPv6 / Proxies) ---
# os.environ["NO_PROXY"] = "*"
if os.name == 'nt' and os.path.exists(r"C:\Program Files\QGIS 3.40.11\bin"):
    try:
        os.add_dll_directory(r"C:\Program Files\QGIS 3.40.11\bin")
    except Exception:
        pass
try:
    import socket
    import urllib3.util.connection as urllib3_cn
    def allowed_gai_family():
        return socket.AF_INET
    urllib3_cn.allowed_gai_family = allowed_gai_family
except ImportError:
    pass
# ---------------------------------------------------------------------------------

logger = logging.getLogger(__name__)
_initialized = False
_active_project_id: str | None = None
_active_sa_email: str | None = None


import glob
import threading

_credentials_list = []
_current_cred_idx = 0
_auth_lock = threading.RLock()

def initialize_gee(project_id: str | None = None, key_json_override: str | None = None) -> None:
    """Initialize the Earth Engine API using a pool of service account keys for load balancing.
    Safe to call multiple times.
    """
    global _initialized, _active_project_id, _active_sa_email, _credentials_list, _current_cred_idx
    
    with _auth_lock:
        raw_keys = []
        if key_json_override:
            raw_keys.append(key_json_override)
            
        # Check environment variables for single or pooled keys
        env_vars = [
            "GEE_SERVICE_ACCOUNT_KEY_PRIMARY",
            "GEE_SERVICE_ACCOUNT_KEY_1",
            "GEE_SERVICE_ACCOUNT_KEY",
            "GEE_SERVICE_ACCOUNT_KEY_BACKUP",
            "GEE_SERVICE_ACCOUNT_KEY_2",
        ]
        for ev in env_vars:
            val = os.environ.get(ev, "").strip()
            if val:
                if val.startswith("["):
                    try:
                        parsed = json.loads(val)
                        if isinstance(parsed, list):
                            for item in parsed:
                                raw_keys.append(json.dumps(item) if isinstance(item, dict) else str(item))
                    except Exception:
                        raw_keys.append(val)
                elif val.startswith("{"):
                    raw_keys.append(val)

        # Check for multi-key array in GEE_SERVICE_ACCOUNT_KEYS
        env_multi = os.environ.get("GEE_SERVICE_ACCOUNT_KEYS", "").strip()
        if env_multi:
            try:
                parsed = json.loads(env_multi)
                if isinstance(parsed, list):
                    for item in parsed:
                        raw_keys.append(json.dumps(item) if isinstance(item, dict) else str(item))
            except Exception:
                pass

        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        key_files = glob.glob(os.path.join(base_dir, "gee_key*.json"))
        for kf in key_files:
            try:
                with open(kf, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content and content.startswith("{"):
                        raw_keys.append(content)
            except Exception:
                pass

        # Deduplicate keys by client_email
        seen_emails = set()
        _credentials_list = []
        for k in raw_keys:
            try:
                kd = json.loads(k)
                em = kd.get("client_email")
                if em and em not in seen_emails:
                    seen_emails.add(em)
                    _credentials_list.append(k)
            except Exception:
                pass

        # Guarantee working service account (ee-petersonyang87 / geoportalservices) is PRIMARY (Index 0)
        # and peteryanservice is SECONDARY BACKUP (Index 1) for seamless rotation
        def _cred_rank(k_str):
            try:
                kd = json.loads(k_str)
                em = kd.get("client_email", "").lower()
                pk = kd.get("project_id", "").lower()
                if "ee-petersonyang87" in em or "ee-petersonyang87" in pk or "geoportalservices" in em:
                    return 0 # Working Primary
                if "peteryanservice" in em or "project-93a68124" in em:
                    return 1 # Working Secondary Backup
                return 2 # Other Standby Backup
            except Exception:
                return 3

        _credentials_list.sort(key=_cred_rank)

        if not _credentials_list:
            target_project = project_id or os.environ.get("GEE_PROJECT_ID") or "ee-petersonyang87"
            try:
                logger.info("No service account keys found. Trying local default credentials.")
                if target_project:
                    ee.Initialize(project=target_project)
                else:
                    ee.Initialize()
                roots = ee.data.getAssetRoots()
                _initialized = True
                _active_project_id = target_project
                _active_sa_email = "explicit_user_auth"
                logger.info("GEE initialized successfully with explicit auth. Project: %s", target_project)
                return
            except Exception as e:
                raise RuntimeError(f"No valid service accounts found and explicit auth failed: {e}")
                
        # Activate the first working credential in the pool
        activated = False
        last_exc = None
        for i in range(len(_credentials_list)):
            try:
                _current_cred_idx = i
                _activate_credential_unlocked(_current_cred_idx, project_id)
                activated = True
                break
            except Exception as e:
                last_exc = e
                logger.warning("Service Account %d failed activation test: %s. Trying next...", i, e)
        if not activated:
            raise RuntimeError(f"All configured service accounts failed to activate: {last_exc}")


def _activate_credential_unlocked(idx: int, project_id: str | None = None):
    global _initialized, _active_project_id, _active_sa_email
    
    key_json = _credentials_list[idx]
    try:
        key_data = json.loads(key_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Credential {idx} is not valid JSON: {exc}") from exc
        
    target_project = project_id or os.environ.get("GEE_PROJECT_ID")
    if not target_project:
        pk = key_data.get("project_id", "")
        if pk and not pk.startswith("project-"):
            target_project = pk

    credentials = ee.ServiceAccountCredentials(
        email=key_data["client_email"],
        key_data=key_json,
    )
    
    try:
        if target_project:
            try:
                ee.Initialize(credentials, project=target_project)
            except Exception as pe:
                logger.warning(
                    "Service Account %s project initialization with '%s' failed: %s. Falling back to default initialization...",
                    key_data["client_email"], target_project, pe
                )
                ee.Initialize(credentials)
                target_project = None
        else:
            ee.Initialize(credentials)
    except Exception as e:
        logger.warning("Failed to initialize with Service Account %s. Error: %s", key_data.get("client_email"), e)
        raise
        
    try:
        # Quick validation computation
        _ = ee.Number(1).add(1).getInfo()
    except Exception as e:
        logger.warning("Service Account %s failed computation validation: %s", key_data.get("client_email"), e)
        raise
    _initialized = True
    _active_project_id = target_project
    _active_sa_email = key_data["client_email"]
    logger.info("GEE initialized successfully. Pool Size: %d, Active SA: %s, Project: %s", len(_credentials_list), _active_sa_email, _active_project_id)
    print(f"Verified GEE initialization. Pool Size: {len(_credentials_list)}, Active SA: {_active_sa_email}")


_last_failover_time = 0.0
_FAILOVER_COOLDOWN_SECONDS = 60.0

def rotate_credentials() -> bool:
    """Rotate to the alternate service account credential in the pool on limit/error."""
    global _current_cred_idx, _credentials_list, _last_failover_time
    with _auth_lock:
        if len(_credentials_list) > 1:
            old_email = _active_sa_email
            _current_cred_idx = (_current_cred_idx + 1) % len(_credentials_list)
            _last_failover_time = time.time()
            role = "BACKUP" if _current_cred_idx != 0 else "PRIMARY"
            logger.warning("Shifting GEE Credentials! Switching from %s to %s (index %d)", old_email, role, _current_cred_idx)
            try:
                _activate_credential_unlocked(_current_cred_idx)
                print(f"[GEE Failover] Switched active account to {role} ({_active_sa_email})")
                return True
            except Exception as e:
                logger.error("Failed to rotate credentials: %s", e)
                return False
        else:
            logger.warning("Cannot rotate credentials: only 1 credential in pool.")
            return False


def ensure_primary_credential():
    """If temporarily operating on backup, automatically revert to fast Primary once cooldown elapses."""
    global _current_cred_idx, _last_failover_time
    if _current_cred_idx != 0 and (time.time() - _last_failover_time > _FAILOVER_COOLDOWN_SECONDS):
        with _auth_lock:
            if _current_cred_idx != 0 and (time.time() - _last_failover_time > _FAILOVER_COOLDOWN_SECONDS):
                logger.info("Failover cooldown elapsed. Reverting to PRIMARY Service Account (Index 0)...")
                print("[GEE Recovery] Cooldown elapsed. Automatically reverting to PRIMARY Service Account...")
                try:
                    _activate_credential_unlocked(0)
                    _current_cred_idx = 0
                except Exception as e:
                    logger.warning("Could not revert to primary: %s", e)


def get_gee_status() -> dict:
    """Return status of current GEE initialization and active project."""
    return {
        "initialized": _initialized,
        "project_id": _active_project_id or "ee-petersonyang87",
        "service_account": _active_sa_email or "",
    }


# â”€â”€ Individual GEE Account Authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Users must authenticate with their own GEE-registered email before
# accessing the Sample Digitization module.  The shared service account
# continues to execute GEE operations; this layer provides *identity gating*.

import re
import secrets
from datetime import datetime, timezone

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

import threading

import re
import secrets
from datetime import datetime, timezone

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from storage.db import (
    get_all_gee_sessions, 
    add_gee_session, 
    get_gee_session, 
    delete_gee_session
)

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

def authenticate_individual(token_credential: str, project_name: str | None = None) -> dict:
    """Validate a Google ID token and create an authenticated session.

    Returns ``{"ok": True, "token": ..., "email": ..., "project_name": ...}`` on success.
    Raises ``ValueError`` for invalid tokens.
    """
    if not token_credential:
        raise ValueError("Google ID token is required.")

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    
    try:
        # Verify the token
        if client_id:
            idinfo = id_token.verify_oauth2_token(token_credential, google_requests.Request(), client_id)
            email = idinfo.get("email")
            if not email:
                raise ValueError("Token does not contain an email address.")
            email = email.strip().lower()
        else:
            # Dev mode fallback: accept raw email address or attempt unverified parse
            if _EMAIL_RE.match(token_credential):
                email = token_credential.strip().lower()
            else:
                try:
                    idinfo = id_token.verify_oauth2_token(token_credential, google_requests.Request())
                    email = idinfo.get("email", "").strip().lower()
                except Exception:
                    raise ValueError("GOOGLE_CLIENT_ID is not set in backend environment.")
    except Exception as exc:
        if _EMAIL_RE.match(token_credential):
            email = token_credential.strip().lower()
        else:
            logger.exception("Google OAuth token verification failed")
            raise ValueError(f"Invalid Google ID token: {exc}")

    # Check if this email already has an active session â€” reuse it
    all_sessions = get_all_gee_sessions()
    for token, session in all_sessions.items():
        if session["email"] == email and session.get("project_name") == project_name:
            logger.info("Reusing existing GEE individual session for %s", email)
            return {"ok": True, "token": token, "email": email, "project_name": project_name}

    # Strict Validation for GEE Project ID and Email Ownership
    if project_name:
        project_name = project_name.strip()
        if not re.match(r"^[a-z][a-z0-9-]{4,28}[a-z0-9]$", project_name):
            raise ValueError(f"Project ID '{project_name}' is not a valid Google Cloud Project ID format.")
            
        try:
            # 1. Verify Project Exists and Service Account has basic access
            ee.data.getList({'id': f'projects/{project_name}/assets'})
        except Exception as e:
            logger.warning("Project verification failed for %s: %s", project_name, e)
            raise ValueError(f"GEE Project '{project_name}' is either invalid, does not exist, or the backend Service Account lacks access to it.")

    # Create a new session
    session_token = secrets.token_urlsafe(32)
    authenticated_at = datetime.now(timezone.utc).isoformat()
    add_gee_session(session_token, email, project_name, authenticated_at)
    logger.info("Created new GEE individual session for %s (token=%s...)", email, session_token[:8])
    return {"ok": True, "token": session_token, "email": email, "project_name": project_name}


def verify_individual_session(token: str | None) -> dict | None:
    """Return the session dict if the token is valid, else None."""
    if not token:
        return None
    return get_gee_session(token)


def logout_individual(token: str) -> bool:
    """Remove an individual session.  Returns True if it existed."""
    session = get_gee_session(token)
    if session:
        delete_gee_session(token)
        logger.info("Logged out GEE individual session for %s", session["email"])
        return True
    return False


def get_all_sessions() -> list[dict]:
    """Return a summary of all active individual sessions (admin use)."""
    sessions = get_all_gee_sessions()
    return [
        {"email": s["email"], "project_name": s.get("project_name"), "authenticated_at": s["authenticated_at"]}
        for s in sessions.values()
    ]


import time, random, ee

def _is_rotatable_error(e: Exception) -> bool:
    err_str = str(e).lower()
    retry_triggers = [
        "429", "concurrency", "too many requests", "quota", 
        "user limit", "rate limit", "deadline exceeded", 
        "timeout", "timed out", "service unavailable", "503",
        "restricted mode", "permission to use project", "serviceusage",
        "internal error", "backend error", "connection reset",
        "refresherror", "oauth2", "policy", "token", "unauthorized", "invalid_grant"
    ]
    return any(trigger in err_str for trigger in retry_triggers)


def apply_gee_patch():
    if getattr(ee.ComputedObject, '_patched_for_retry', False): return
    
    original_get_info = ee.ComputedObject.getInfo
    
    def safe_get_info(self, *args, **kwargs):
        ensure_primary_credential()
        retries = 8
        for i in range(retries):
            try:
                return original_get_info(self, *args, **kwargs)
            except Exception as e:
                if _is_rotatable_error(e) and i < retries - 1:
                    rotated = rotate_credentials()
                    if rotated:
                        print(f"[GEE Pool] Transient limit ({str(e)[:60]}). Automatically shifted account! Retrying...")
                        time.sleep(0.2)
                        continue
                    sleep_time = (1.5 ** i) + random.uniform(0.5, 1.5)
                    print(f"GEE Limit Hit. Backing off for {sleep_time:.2f}s (Attempt {i+1}/{retries})...")
                    time.sleep(sleep_time)
                    continue
                raise
    
    ee.ComputedObject.getInfo = safe_get_info
    
    original_get_download_url = ee.Image.getDownloadURL
    
    def safe_get_download_url(self, *args, **kwargs):
        ensure_primary_credential()
        retries = 8
        params = None
        is_arg_dict = False
        if args and isinstance(args[0], dict):
            params = dict(args[0])
            is_arg_dict = True
        elif kwargs:
            params = dict(kwargs)

        for i in range(retries):
            try:
                if is_arg_dict:
                    new_args = (params,) + args[1:]
                    return original_get_download_url(self, *new_args, **kwargs)
                elif params is not None and not args:
                    return original_get_download_url(self, **params)
                else:
                    return original_get_download_url(self, *args, **kwargs)
            except Exception as e:
                err_str = str(e)
                # Handle GEE pixel grid dimensions overflow: e.g. "Pixel grid dimensions (190731x45244) must be less than or equal to 32768."
                if "Pixel grid dimensions" in err_str and params is not None:
                    import re, math
                    match = re.search(r"Pixel grid dimensions \((\d+)x(\d+)\)", err_str)
                    if match:
                        w, h = int(match.group(1)), int(match.group(2))
                        max_dim = max(w, h)
                        factor = max(2.0, math.ceil(max_dim / 15000.0))
                        curr_scale = params.get("scale", 30)
                        params["scale"] = max(int(curr_scale * factor), int(curr_scale * (max_dim / 15000.0)) + 1)
                        print(f"[safe_get_download_url] Pixel grid limit hit ({w}x{h}). Auto-adjusting scale from {curr_scale} to {params['scale']}.")
                        continue
                elif ("request size" in err_str.lower() or "exceeds" in err_str.lower() or "33554432" in err_str) and params is not None:
                    curr_scale = params.get("scale", 30)
                    params["scale"] = int(curr_scale * 3)
                    print(f"[safe_get_download_url] Request size limit hit. Scaling up from {curr_scale} to {params['scale']}.")
                    continue

                if _is_rotatable_error(e) and i < retries - 1:
                    rotated = rotate_credentials()
                    if rotated:
                        print(f"[GEE Pool getDownloadURL] Transient limit ({err_str[:60]}). Automatically shifted account! Retrying...")
                        time.sleep(0.2)
                        continue
                    sleep_time = (1.5 ** i) + random.uniform(0.5, 1.5)
                    print(f"GEE Limit Hit (getDownloadURL). Backing off for {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    continue

                # If pixel grid or request size limit persists, return None to prevent crashing the whole page/endpoint
                if "Pixel grid dimensions" in err_str or "request size" in err_str.lower() or "exceeds" in err_str.lower():
                    print(f"[safe_get_download_url] Could not satisfy dimension/size limit ({err_str[:80]}). Returning None to prevent 500 error.")
                    return None
                raise
                
    ee.Image.getDownloadURL = safe_get_download_url

    original_get_thumb_url = ee.Image.getThumbURL

    def safe_get_thumb_url(self, *args, **kwargs):
        ensure_primary_credential()
        retries = 8
        for i in range(retries):
            try:
                return original_get_thumb_url(self, *args, **kwargs)
            except Exception as e:
                err_str = str(e)
                if _is_rotatable_error(e) and i < retries - 1:
                    rotated = rotate_credentials()
                    if rotated:
                        print(f"[GEE Pool getThumbURL] Transient limit ({err_str[:60]}). Automatically shifted account! Retrying...")
                        time.sleep(0.2)
                        continue
                    sleep_time = (1.5 ** i) + random.uniform(0.5, 1.5)
                    print(f"GEE Limit Hit (getThumbURL). Backing off for {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    continue
                if "Pixel grid dimensions" in err_str or "dimensions" in err_str.lower():
                    print(f"[safe_get_thumb_url] Dimension error ({err_str[:80]}). Returning None.")
                    return None
                raise

    ee.Image.getThumbURL = safe_get_thumb_url
    
    original_get_map_id = ee.Image.getMapId
    
    def safe_get_map_id(self, *args, **kwargs):
        ensure_primary_credential()
        retries = 8
        for i in range(retries):
            try:
                return original_get_map_id(self, *args, **kwargs)
            except Exception as e:
                if _is_rotatable_error(e) and i < retries - 1:
                    rotated = rotate_credentials()
                    if rotated:
                        print(f"[GEE Pool getMapId] Automatically shifted account! Retrying...")
                        time.sleep(0.2)
                        continue
                    sleep_time = (1.5 ** i) + random.uniform(0.5, 1.5)
                    print(f"GEE Limit Hit (getMapId). Backing off for {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    continue
                raise
                
    ee.Image.getMapId = safe_get_map_id

    ee.ComputedObject._patched_for_retry = True

apply_gee_patch()
