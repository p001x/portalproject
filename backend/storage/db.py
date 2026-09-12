import json
from typing import Dict, Any, List

from database import SessionLocal
from models import Dataset, Sample, GeeSession

def init_db():
    from database import init_db as _init
    _init()

init_db()

# --- Datasets (Metadata) Operations ---
def get_datasets(source: str) -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        datasets = db.query(Dataset).filter(Dataset.source == source).all()
        return [json.loads(d.metadata_json) for d in datasets]

def save_datasets(source: str, records: List[Dict[str, Any]]) -> None:
    with SessionLocal() as db:
        db.query(Dataset).filter(Dataset.source == source).delete()
        for record in records:
            record_id = record.get("id", str(hash(json.dumps(record))))
            new_dataset = Dataset(id=record_id, source=source, metadata_json=json.dumps(record))
            db.add(new_dataset)
        db.commit()

# --- Samples Operations ---
def get_samples() -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        samples = db.query(Sample).all()
        return [json.loads(s.metadata_json) for s in samples]

def save_samples(records: List[Dict[str, Any]]) -> None:
    with SessionLocal() as db:
        db.query(Sample).delete()
        for record in records:
            record_id = record.get("id", str(hash(json.dumps(record))))
            new_sample = Sample(id=record_id, metadata_json=json.dumps(record))
            db.add(new_sample)
        db.commit()

# --- GEE Sessions Operations ---
def get_all_gee_sessions() -> Dict[str, Dict[str, Any]]:
    sessions = {}
    with SessionLocal() as db:
        gee_sessions = db.query(GeeSession).all()
        for s in gee_sessions:
            sessions[s.token] = {
                "email": s.email,
                "project_name": s.project_name,
                "authenticated_at": s.authenticated_at
            }
    return sessions

def save_all_gee_sessions(sessions: Dict[str, Dict[str, Any]]) -> None:
    with SessionLocal() as db:
        db.query(GeeSession).delete()
        for token, data in sessions.items():
            s = GeeSession(
                token=token,
                email=data["email"],
                project_name=data.get("project_name"),
                authenticated_at=data["authenticated_at"]
            )
            db.add(s)
        db.commit()

def add_gee_session(token: str, email: str, project_name: str, authenticated_at: str) -> None:
    with SessionLocal() as db:
        s = GeeSession(
            token=token,
            email=email,
            project_name=project_name,
            authenticated_at=authenticated_at
        )
        db.add(s)
        db.commit()

def get_gee_session(token: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        s = db.query(GeeSession).filter(GeeSession.token == token).first()
        if s:
            return {
                "email": s.email,
                "project_name": s.project_name,
                "authenticated_at": s.authenticated_at
            }
        return None

def delete_gee_session(token: str) -> bool:
    with SessionLocal() as db:
        rows_deleted = db.query(GeeSession).filter(GeeSession.token == token).delete()
        db.commit()
        return rows_deleted > 0
