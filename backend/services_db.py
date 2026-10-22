from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from database import SessionLocal, init_db as _init_main_db
from models import ServiceRequest

# Ensure unified DB is initialized
_init_main_db()

def create_request(user_email: str, service_type: str, message: str) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as db:
        req = ServiceRequest(
            user_email=user_email,
            service_type=service_type,
            message=message,
            status='pending',
            created_at=created_at
        )
        db.add(req)
        db.commit()

def get_all_requests() -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        rows = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).all()
        return [
            {
                "id": r.id,
                "user_email": r.user_email,
                "service_type": r.service_type,
                "message": r.message,
                "status": r.status,
                "created_at": r.created_at
            }
            for r in rows
        ]
