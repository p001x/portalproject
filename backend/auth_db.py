import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any

_HERE = Path(__file__).resolve().parent
DB_PATH = _HERE / "users.db"

def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                reset_token TEXT,
                reset_token_expiry TEXT,
                role TEXT DEFAULT 'user',
                created_at TEXT NOT NULL
            )
        ''')
        # Try to add api_key column if it doesn't exist
        try:
            conn.execute('ALTER TABLE users ADD COLUMN api_key TEXT')
        except sqlite3.OperationalError:
            pass

        # Create gee_usage table for API rate limiting
        conn.execute('''
            CREATE TABLE IF NOT EXISTS gee_usage (
                email TEXT NOT NULL,
                date_str TEXT NOT NULL,
                request_count INTEGER DEFAULT 0,
                PRIMARY KEY (email, date_str)
            )
        ''')
        conn.commit()


# Ensure DB is initialized
init_db()

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with _get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None

def get_user_by_reset_token(token: str) -> Optional[Dict[str, Any]]:
    with _get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE reset_token = ?", (token,)).fetchone()
        return dict(row) if row else None

def get_all_users() -> list[Dict[str, Any]]:
    with _get_db() as conn:
        rows = conn.execute("SELECT email, name FROM users WHERE role = 'user'").fetchall()
        return [dict(row) for row in rows]

def create_user(name: str, email: str, password_hash: str, role: str = 'user') -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, email, password_hash, role, created_at)
        )
        conn.commit()

def update_user_password(email: str, password_hash: str) -> None:
    with _get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE email = ?",
            (password_hash, email)
        )
        conn.commit()

def set_reset_token(email: str, token: str, expiry_iso: str) -> None:
    with _get_db() as conn:
        conn.execute(
            "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?",
            (token, expiry_iso, email)
        )
        conn.commit()


def update_user_name(email: str, name: str) -> None:
    with _get_db() as conn:
        conn.execute(
            "UPDATE users SET name = ? WHERE email = ?",
            (name, email)
        )
        conn.commit()

def increment_and_check_gee_usage(email: str, max_requests: int = 50) -> dict:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO gee_usage (email, date_str, request_count) VALUES (?, ?, 0)",
            (email, date_str)
        )
        row = conn.execute(
            "SELECT request_count FROM gee_usage WHERE email = ? AND date_str = ?",
            (email, date_str)
        ).fetchone()
        
        current_count = row["request_count"] if row else 0
        
        if current_count >= max_requests:
            return {"allowed": False, "count": current_count}
            
        conn.execute(
            "UPDATE gee_usage SET request_count = request_count + 1 WHERE email = ? AND date_str = ?",
            (email, date_str)
        )
        conn.commit()
        return {"allowed": True, "count": current_count + 1}

def get_gee_usage(email: str) -> int:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _get_db() as conn:
        row = conn.execute(
            "SELECT request_count FROM gee_usage WHERE email = ? AND date_str = ?",
            (email, date_str)
        ).fetchone()
        return row["request_count"] if row else 0
