import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

_HERE = Path(__file__).resolve().parent
DB_PATH = _HERE / "services.db"

def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS service_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                service_type TEXT NOT NULL,
                message TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()

# Ensure DB is initialized
init_db()

def create_request(user_email: str, service_type: str, message: str) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO service_requests (user_email, service_type, message, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_email, service_type, message, 'pending', created_at)
        )
        conn.commit()

def get_all_requests() -> List[Dict[str, Any]]:
    with _get_db() as conn:
        rows = conn.execute("SELECT * FROM service_requests ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]
