from datetime import datetime, timezone
from typing import Optional, Dict, Any

from database import SessionLocal
from models import User, GeeUsage

def init_db():
    from database import init_db as _init
    _init()

# Ensure DB is initialized
init_db()

def _user_to_dict(user: User) -> Dict[str, Any]:
    if not user:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "password_hash": user.password_hash,
        "reset_token": user.reset_token,
        "reset_token_expiry": user.reset_token_expiry,
        "role": user.role,
        "created_at": user.created_at,
        "api_key": user.api_key
    }

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        return _user_to_dict(user) if user else None

def get_user_by_reset_token(token: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(User).filter(User.reset_token == token).first()
        return _user_to_dict(user) if user else None

def get_all_users() -> list[Dict[str, Any]]:
    with SessionLocal() as db:
        users = db.query(User).filter(User.role == 'user').all()
        return [{"email": u.email, "name": u.name} for u in users]

def create_user(name: str, email: str, password_hash: str, role: str = 'user') -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as db:
        new_user = User(
            name=name,
            email=email,
            password_hash=password_hash,
            role=role,
            created_at=created_at
        )
        db.add(new_user)
        db.commit()

def update_user_password(email: str, password_hash: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.password_hash = password_hash
            user.reset_token = None
            user.reset_token_expiry = None
            db.commit()

def set_reset_token(email: str, token: str, expiry_iso: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.reset_token = token
            user.reset_token_expiry = expiry_iso
            db.commit()

def update_user_name(email: str, name: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.name = name
            db.commit()

def increment_and_check_gee_usage(email: str, max_requests: int = 50) -> dict:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with SessionLocal() as db:
        usage = db.query(GeeUsage).filter(GeeUsage.email == email, GeeUsage.date_str == date_str).first()
        if not usage:
            usage = GeeUsage(email=email, date_str=date_str, request_count=0)
            db.add(usage)
            db.commit()
            db.refresh(usage)
            
        if usage.request_count >= max_requests:
            return {"allowed": False, "count": usage.request_count}
            
        usage.request_count += 1
        db.commit()
        return {"allowed": True, "count": usage.request_count}

def get_gee_usage(email: str) -> int:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with SessionLocal() as db:
        usage = db.query(GeeUsage).filter(GeeUsage.email == email, GeeUsage.date_str == date_str).first()
        return usage.request_count if usage else 0
