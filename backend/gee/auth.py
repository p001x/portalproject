"""GEE authentication — supports dynamic GEE Cloud Project IDs and Service Accounts."""
import os
import json
import logging
import ee

logger = logging.getLogger(__name__)
_initialized = False
_active_project_id: str | None = None
_active_sa_email: str | None = None


def initialize_gee(project_id: str | None = None, key_json_override: str | None = None) -> None:
    """Initialize the Earth Engine API using the service account key from env or custom key.

    Safe to call multiple times — subsequent calls with new parameters will re-initialize GEE.
    Raises RuntimeError on any configuration problem.
    """
    global _initialized, _active_project_id, _active_sa_email

    key_json = (key_json_override or os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "")).strip()
    if not key_json:
        key_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "gee_key.json"))
        if os.path.exists(key_file_path):
            with open(key_file_path, "r", encoding="utf-8") as f:
                key_json = f.read().strip()

    if not key_json:
        target_project = project_id or os.environ.get("GEE_PROJECT_ID") or "ee-petersonyang87"
        try:
            logger.info("No service account key provided. Forcing explicit authentication.")
            ee.Authenticate(force=True)
            if target_project:
                ee.Initialize(project=target_project)
            else:
                ee.Initialize()
                
            roots = ee.data.getAssetRoots()
            
            _initialized = True
            _active_project_id = target_project
            _active_sa_email = "explicit_user_auth"
            logger.info("GEE initialized successfully with explicit auth. Project: %s, Roots: %s", _active_project_id, roots)
            print(f"Verified GEE initialization. Account: explicit_user_auth, Project: {target_project}, Roots: {roots}")
            return
        except Exception as e:
            raise RuntimeError(
                f"GEE_SERVICE_ACCOUNT_KEY is not set, gee_key.json was not found, and explicit auth failed: {e}"
            )

    if not key_json.startswith("{"):
        raise RuntimeError(
            f"GEE_SERVICE_ACCOUNT_KEY does not look like JSON "
            f"(starts with: {key_json[:40]!r}). "
            "Paste the entire contents of the downloaded .json key file."
        )

    try:
        key_data = json.loads(key_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GEE_SERVICE_ACCOUNT_KEY is not valid JSON: {exc}") from exc

    target_project = project_id or os.environ.get("GEE_PROJECT_ID") or key_data.get("project_id", "") or "ee-petersonyang87"

    credentials = ee.ServiceAccountCredentials(
        email=key_data["client_email"],
        key_data=key_json,
    )

    if target_project:
        ee.Initialize(credentials, project=target_project)
    else:
        ee.Initialize(credentials)

    roots = ee.data.getAssetRoots()

    _initialized = True
    _active_project_id = target_project or key_data.get("project_id", "default")
    _active_sa_email = key_data.get("client_email", "")
    logger.info("GEE initialized successfully. SA: %s, Project: %s, Roots: %s", _active_sa_email, _active_project_id, roots)
    print(f"Verified GEE initialization. Account: {_active_sa_email}, Project: {_active_project_id}, Roots: {roots}")


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

_individual_sessions: dict[str, dict] = {}
# Mapping: token → { "email": str, "authenticated_at": str }

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
    for token, session in _individual_sessions.items():
        if session["email"] == email and session.get("project_name") == project_name:
            logger.info("Reusing existing GEE individual session for %s", email)
            return {"ok": True, "token": token, "email": email, "project_name": project_name}

    # Create a new session
    session_token = secrets.token_urlsafe(32)
    _individual_sessions[session_token] = {
        "email": email,
        "project_name": project_name,
        "authenticated_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info("Created new GEE individual session for %s (token=%s...)", email, session_token[:8])
    return {"ok": True, "token": session_token, "email": email, "project_name": project_name}


def verify_individual_session(token: str | None) -> dict | None:
    """Return the session dict if the token is valid, else None."""
    if not token:
        return None
    return _individual_sessions.get(token)


def logout_individual(token: str) -> bool:
    """Remove an individual session.  Returns True if it existed."""
    removed = _individual_sessions.pop(token, None)
    if removed:
        logger.info("Logged out GEE individual session for %s", removed["email"])
    return removed is not None


def get_all_sessions() -> list[dict]:
    """Return a summary of all active individual sessions (admin use)."""
    return [
        {"email": s["email"], "project_name": s.get("project_name"), "authenticated_at": s["authenticated_at"]}
        for s in _individual_sessions.values()
    ]

