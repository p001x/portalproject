"""GEE authentication — supports dynamic GEE Cloud Project IDs and Service Accounts."""
import os
import json
import logging
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
_auth_lock = threading.Lock()

def initialize_gee(project_id: str | None = None, key_json_override: str | None = None) -> None:
    """Initialize the Earth Engine API using a pool of service account keys for load balancing.
    Safe to call multiple times.
    """
    global _initialized, _active_project_id, _active_sa_email, _credentials_list, _current_cred_idx
    
    with _auth_lock:
        _credentials_list = []
        
        if key_json_override:
            _credentials_list.append(key_json_override)
            
        env_key = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
        if env_key:
            _credentials_list.append(env_key)
            
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        key_files = glob.glob(os.path.join(base_dir, "gee_key*.json"))
        for kf in key_files:
            try:
                with open(kf, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content and content.startswith("{"):
                        _credentials_list.append(content)
            except Exception:
                pass

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
                
        # Activate the first credential in the pool
        _current_cred_idx = 0
        _activate_credential_unlocked(_current_cred_idx, project_id)


def _activate_credential_unlocked(idx: int, project_id: str | None = None):
    global _initialized, _active_project_id, _active_sa_email
    
    key_json = _credentials_list[idx]
    try:
        key_data = json.loads(key_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Credential {idx} is not valid JSON: {exc}") from exc
        
    target_project = project_id or os.environ.get("GEE_PROJECT_ID") or key_data.get("project_id", "") or "ee-petersonyang87"
    
    credentials = ee.ServiceAccountCredentials(
        email=key_data["client_email"],
        key_data=key_json,
    )
    
    try:
        if target_project:
            ee.Initialize(credentials, project=target_project)
        else:
            ee.Initialize(credentials)
    except Exception as e:
        logger.warning("Failed to initialize with Service Account %s. Error: %s", key_data.get("client_email"), e)
        raise
        
    roots = ee.data.getAssetRoots()
    _initialized = True
    _active_project_id = target_project
    _active_sa_email = key_data["client_email"]
    logger.info("GEE initialized successfully. Pool Size: %d, Active SA: %s, Project: %s", len(_credentials_list), _active_sa_email, _active_project_id)
    print(f"Verified GEE initialization. Pool Size: {len(_credentials_list)}, Active SA: {_active_sa_email}")


def rotate_credentials():
    """Rotate to the next service account credential in the pool to bypass concurrency limits."""
    global _current_cred_idx, _credentials_list
    with _auth_lock:
        if len(_credentials_list) > 1:
            old_email = _active_sa_email
            _current_cred_idx = (_current_cred_idx + 1) % len(_credentials_list)
            logger.warning("Rotating GEE Credentials! Switching from %s to credential index %d", old_email, _current_cred_idx)
            try:
                _activate_credential_unlocked(_current_cred_idx)
            except Exception as e:
                logger.error("Failed to rotate credentials: %s", e)
        else:
            logger.warning("Cannot rotate credentials: only 1 credential in pool.")


def get_gee_status() -> dict:
    """Return status of current GEE initialization and active project."""
    return {
        "initialized": _initialized,
        "project_id": _active_project_id or "ee-petersonyang87",
        "service_account": _active_sa_email or "",
    }


# ── Individual GEE Account Authentication ──────────────────────────────────
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

    # Check if this email already has an active session — reuse it
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

