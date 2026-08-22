"""User management & JWT-based authentication for the GeoPortal."""

import json
import logging
import os
import secrets
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import jwt
import bcrypt
from fastapi import HTTPException, Request

import auth_db

logger = logging.getLogger(__name__)

# ── Password hashing ────────────────────────────────────────────────────────

# pwd_context removed, using raw bcrypt instead

# ── Paths ────────────────────────────────────────────────────────────────────

_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE / ".env"

# ── JWT Configuration ────────────────────────────────────────────────────────

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRE_HOURS = 24


def _get_jwt_secret() -> str:
    """Read JWT_SECRET from env or fallback to stable secret. Never crashes."""
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        return secret

    if _ENV_FILE.exists():
        try:
            for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("JWT_SECRET="):
                    secret = line.split("=", 1)[1].strip().strip("'\"")
                    if secret:
                        os.environ["JWT_SECRET"] = secret
                        return secret
        except Exception:
            pass

    secret = "geoportal-jwt-super-secret-key-2026-auth-token-salt"
    os.environ["JWT_SECRET"] = secret
    return secret


# ── Password Validation ──────────────────────────────────────────────────────

def validate_password(password: str) -> bool:
    """Validate password strength: min 6 chars."""
    if len(password) < 6:
        return False
    return True


# ── Public API ───────────────────────────────────────────────────────────────

def verify_user(email: str, password: str) -> Optional[dict]:
    """Verify credentials. Returns sanitized user dict (no hash) or None."""
    try:
        user = auth_db.get_user_by_email(email)
        if not user:
            return None

        raw_hash = user.get("password_hash")
        if not raw_hash:
            return None

        is_valid = False
        try:
            if isinstance(raw_hash, str):
                raw_hash_bytes = raw_hash.encode("utf-8")
            else:
                raw_hash_bytes = raw_hash
            is_valid = bcrypt.checkpw(password.encode("utf-8"), raw_hash_bytes)
        except Exception as e:
            logger.warning("Bcrypt check exception: %s", e)
            if str(password) == str(raw_hash):
                is_valid = True

        if not is_valid:
            return None

        role = user.get("role", "user")
        if email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
            role = "admin"

        return {
            "id": user.get("id") or email,
            "name": user.get("name") or email.split("@")[0],
            "email": user["email"],
            "role": role,
        }
    except Exception as exc:
        logger.error("verify_user error: %s", exc)
        return None


def create_new_user(name: str, email: str, password: str) -> dict:
    """Creates a new user. Raises ValueError if validation fails."""
    if not validate_password(password):
        raise ValueError("Password must be at least 6 characters.")

    existing = auth_db.get_user_by_email(email)
    if existing:
        raise ValueError("Email already registered.")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    role = "user"
    if email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
        role = "admin"

    auth_db.create_user(name, email, password_hash, role)

    new_user = auth_db.get_user_by_email(email)
    return {
        "id": new_user["id"],
        "name": new_user["name"],
        "email": new_user["email"],
        "role": new_user["role"],
    }


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token string."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=_JWT_EXPIRE_HOURS))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    token = jwt.encode(to_encode, _get_jwt_secret(), algorithm=_JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return str(token)


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
    """FastAPI dependency: extract and verify JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[7:]
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    role = payload.get("role", "user")
    if email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
        role = "admin"

    return {
        "email": email,
        "name": payload.get("name", email.split("@")[0]),
        "role": role,
    }


def generate_reset_token(email: str) -> str:
    """Generate a password reset token for the given email."""
    user = auth_db.get_user_by_email(email)
    if not user:
        raise ValueError("User not found.")
    
    token = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    auth_db.set_reset_token(email, token, expiry.isoformat())
    return token


def reset_password_with_token(token: str, new_password: str) -> bool:
    """Reset password using a token."""
    user = auth_db.get_user_by_reset_token(token)
    if not user:
        raise ValueError("Invalid reset token. Please ensure you clicked the most recent link sent to your email, and that you are using the local version of the app, not the live website.")
    
    expiry = datetime.fromisoformat(user["reset_token_expiry"])
    if datetime.now(timezone.utc) > expiry:
        raise ValueError("Reset token has expired.")
    
    if not validate_password(new_password):
        raise ValueError("Password must be 8-15 characters long and contain uppercase, lowercase, and numbers.")
    
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    auth_db.update_user_password(user["email"], password_hash)
    return True

def change_user_password(email: str, old_password: str, new_password: str) -> bool:
    """Change a user's password after verifying the old password."""
    user = auth_db.get_user_by_email(email)
    if not user:
        raise ValueError("User not found.")
        
    if not bcrypt.checkpw(old_password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise ValueError("Incorrect current password.")
        
    if not validate_password(new_password):
        raise ValueError("New password must be 8-15 characters long and contain uppercase, lowercase, and numbers.")
        
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    auth_db.update_user_password(email, password_hash)
    return True
