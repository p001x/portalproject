"""User management & JWT-based authentication for the GeoPortal."""

import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# ── Password hashing ────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Paths ────────────────────────────────────────────────────────────────────

_HERE = Path(__file__).resolve().parent
_USERS_FILE = _HERE / "users.json"
_ENV_FILE = _HERE / ".env"

# ── JWT Configuration ────────────────────────────────────────────────────────

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRE_HOURS = 24


def _get_jwt_secret() -> str:
    """Read JWT_SECRET from env or .env file. Auto-generate if missing."""
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        return secret

    # Try to read from .env
    if _ENV_FILE.exists():
        for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("JWT_SECRET="):
                secret = line.split("=", 1)[1].strip().strip("'\"")
                if secret:
                    os.environ["JWT_SECRET"] = secret
                    return secret

    # Generate a new secret and append to .env
    secret = secrets.token_urlsafe(48)
    os.environ["JWT_SECRET"] = secret
    with open(_ENV_FILE, "a", encoding="utf-8") as f:
        f.write(f"\nJWT_SECRET={secret}\n")
    logger.info("Generated new JWT_SECRET and saved to .env")
    return secret


# ── User Store ───────────────────────────────────────────────────────────────

_DEFAULT_USERS = {
    "admin": {
        "username": "admin",
        "password_hash": pwd_context.hash("geoportal2024"),
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
}


def _load_users() -> dict:
    """Load users from users.json, creating it with defaults if missing."""
    if not _USERS_FILE.exists():
        _save_users(_DEFAULT_USERS)
        logger.info("Created default users.json with admin account.")
        return _DEFAULT_USERS.copy()

    try:
        data = json.loads(_USERS_FILE.read_text(encoding="utf-8"))
        return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Failed to load users.json: %s — using defaults", exc)
        return _DEFAULT_USERS.copy()


def _save_users(users: dict) -> None:
    """Persist the user dict to users.json."""
    _USERS_FILE.write_text(
        json.dumps(users, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ── Public API ───────────────────────────────────────────────────────────────

def verify_user(username: str, password: str) -> Optional[dict]:
    """Verify credentials. Returns sanitized user dict (no hash) or None."""
    users = _load_users()
    user = users.get(username)
    if not user:
        return None
    if not pwd_context.verify(password, user["password_hash"]):
        return None
    # Return a safe copy without the hash
    return {
        "username": user["username"],
        "role": user.get("role", "user"),
        "created_at": user.get("created_at", ""),
    }


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=_JWT_EXPIRE_HOURS))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, _get_jwt_secret(), algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(token, _get_jwt_secret(), algorithms=[_JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("JWT token expired")
        return None
    except jwt.InvalidTokenError as exc:
        logger.debug("JWT invalid: %s", exc)
        return None


def get_current_user(request: Request) -> dict:
    """FastAPI dependency: extract and verify JWT from Authorization header.

    Raises HTTP 401 if missing or invalid.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[7:]  # strip "Bearer "
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "username": username,
        "role": payload.get("role", "user"),
    }


def change_password(username: str, old_password: str, new_password: str) -> bool:
    """Change a user's password. Returns True on success."""
    users = _load_users()
    user = users.get(username)
    if not user:
        return False
    if not pwd_context.verify(old_password, user["password_hash"]):
        return False

    if len(new_password) < 6:
        raise ValueError("New password must be at least 6 characters.")

    user["password_hash"] = pwd_context.hash(new_password)
    _save_users(users)
    logger.info("Password changed for user: %s", username)
    return True
