"""User management & JWT-based authentication for the GeoPortal."""

import json
import logging
import os
import secrets
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import Request, HTTPException
import jwt
import bcrypt


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

    # In development/fallback, generate a cryptographically strong random secret if missing
    secret = secrets.token_hex(32)
    os.environ["JWT_SECRET"] = secret
    logger.warning("JWT_SECRET was not set in environment. Generated an ephemeral secure key.")
    return secret


# ── Password Validation ──────────────────────────────────────────────────────

def validate_password(password: str) -> bool:
    """Validate password strength: min 8 chars."""
    if not password or len(password.strip()) < 8:
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
            is_valid = False

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
            "is_blocked": bool(user.get("is_blocked", False)),
            "blocked_reason": user.get("blocked_reason"),
        }
    except Exception as exc:
        logger.error("verify_user error: %s", exc)
        return None


def create_new_user(name: str, email: str, password: str) -> dict:
    """Creates a new user. Raises ValueError if validation fails."""
    if not validate_password(password):
        raise ValueError("Password must be at least 8 characters long.")

    email_clean = email.strip().lower()
    existing = auth_db.get_user_by_email(email_clean)
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    role = "user"
    if email_clean in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
        role = "admin"

    if existing:
        if not existing.get("password_hash"):
            # Account was created via Google or OTP, allow setting a password
            auth_db.update_user_password(email_clean, password_hash)
            # Update name if provided
            auth_db.update_user_name(email_clean, name)
        else:
            raise ValueError("Email already registered. Please log in or reset your password.")
    else:
        auth_db.create_user(name, email_clean, password_hash, role)

    new_user = auth_db.get_user_by_email(email_clean)
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
    """FastAPI dependency: extract and verify JWT from Authorization header.
    Falls back to a guest user so live map analysis functions for website visitors.
    """
    auth_header = request.headers.get("Authorization", "")
    api_key = request.headers.get("X-API-Key")
    
    # Check API key if provided
    if api_key or auth_header.startswith("Bearer sk_"):
        key = api_key if api_key else auth_header[7:]
        user_rec = auth_db.get_user_by_api_key(key)
        if user_rec:
            return {
                "id": user_rec.get("id"),
                "email": user_rec["email"],
                "name": user_rec.get("name", user_rec["email"].split("@")[0]),
                "role": user_rec.get("role", "user"),
                "is_guest": False,
            }

    if not auth_header.startswith("Bearer "):
        return {
            "id": "guest",
            "email": "guest@spetro.org",
            "name": "Guest Explorer",
            "role": "guest",
            "is_guest": True,
        }

    token = auth_header[7:]
    payload = decode_token(token)
    if payload is None or not payload.get("sub"):
        return {
            "id": "guest",
            "email": "guest@spetro.org",
            "name": "Guest Explorer",
            "role": "guest",
            "is_guest": True,
        }

    email = payload.get("sub")

    # Check database status for suspension/blocked state
    db_user = auth_db.get_user_by_email(email)
    if db_user and db_user.get("is_blocked"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "account_blocked",
                "is_blocked": True,
                "message": "Your account has been suspended.",
                "reason": db_user.get("blocked_reason") or "Suspended by administration.",
                "email": email
            }
        )

    role = payload.get("role", "user")
    if email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
        role = "admin"

    return {
        "id": db_user.get("id") if db_user else email,
        "email": email,
        "name": payload.get("name", (db_user["name"] if db_user else email.split("@")[0])),
        "role": role,
        "profile_picture": db_user.get("profile_picture") if db_user else None,
        "is_guest": False,
    }


def generate_reset_token(email: str) -> str:
    """Generate a password reset token for the given email (valid for 30 minutes)."""
    email_clean = email.strip().lower()
    user = auth_db.get_user_by_email(email_clean)
    if not user:
        raise ValueError("User not found.")
    
    token = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    auth_db.set_reset_token(email_clean, token, expiry.isoformat())
    return token


def reset_password_with_token(token: str, new_password: str) -> bool:
    """Reset password using a token."""
    if not token or not token.strip():
        raise ValueError("Invalid reset token.")

    user = auth_db.get_user_by_reset_token(token.strip())
    if not user:
        raise ValueError("Invalid or expired reset token. Please request a new password reset link.")
    
    if not user.get("reset_token_expiry"):
        raise ValueError("This reset link has already been used or is no longer valid.")

    try:
        expiry = datetime.fromisoformat(user["reset_token_expiry"])
        if datetime.now(timezone.utc) > expiry:
            raise ValueError("Reset token has expired (valid for 30 minutes). Please request a new password reset link.")
    except Exception:
        raise ValueError("Invalid token expiration. Please request a new password reset link.")
    
    if not validate_password(new_password):
        raise ValueError("Password must be at least 8 characters long.")
    
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    auth_db.update_user_password(user["email"], password_hash)
    logger.info(f"Password successfully reset for user: {user['email']}")
    return True

def change_user_password(email: str, old_password: str, new_password: str) -> bool:
    """Change a user's password after verifying the old password."""
    email_clean = email.strip().lower()
    user = auth_db.get_user_by_email(email_clean)
    if not user:
        raise ValueError("User not found.")
        
    raw_hash = user.get("password_hash")
    if not raw_hash:
        raise ValueError("No password set on this account. Please use password reset.")

    raw_hash_bytes = raw_hash.encode('utf-8') if isinstance(raw_hash, str) else raw_hash
    if not bcrypt.checkpw(old_password.encode('utf-8'), raw_hash_bytes):
        raise ValueError("Incorrect current password.")
        
    if not validate_password(new_password):
        raise ValueError("New password must be at least 8 characters long.")
        
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    auth_db.update_user_password(email_clean, password_hash)
    return True
