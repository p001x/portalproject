import os
import sqlite3
import urllib.request
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'analytics_events.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            module TEXT,
            path TEXT,
            session_id TEXT,
            ip_address TEXT,
            country TEXT,
            city TEXT,
            user_agent TEXT,
            created_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

class AnalyticsEvent(BaseModel):
    event_type: str
    module: str
    path: str
    session_id: str
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

def is_private_ip(ip: str) -> bool:
    if ip in ("127.0.0.1", "::1", "localhost", "unknown"):
        return True
    if ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172."):
        return True
    return False

def fetch_and_update_geolocation(event_id: int, ip: str):
    if is_private_ip(ip):
        country, city = "Local/Unknown", "Local/Unknown"
    else:
        country, city = None, None
        try:
            req = urllib.request.Request(f"http://ip-api.com/json/{ip}", headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5.0) as response:
                data = json.loads(response.read().decode('utf-8'))
                if data.get("status") == "success":
                    country = data.get("country")
                    city = data.get("city")
        except Exception:
            pass  # Best effort, never break on error
            
    if country or city:
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("UPDATE analytics_events SET country = ?, city = ? WHERE id = ?", (country, city, event_id))
            conn.commit()
            conn.close()
        except Exception:
            pass

@router.post("/event")
async def log_event(event: AnalyticsEvent, request: Request, background_tasks: BackgroundTasks):
    ip_address = event.ip_address or (request.client.host if request.client else "unknown")
    user_agent = event.user_agent or request.headers.get("user-agent", "unknown")
    created_at = datetime.now(timezone.utc).isoformat()
    
    def _write_db():
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            """INSERT INTO analytics_events 
               (event_type, module, path, session_id, ip_address, country, city, user_agent, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event.event_type, event.module, event.path, event.session_id, ip_address, None, None, user_agent, created_at)
        )
        event_id = c.lastrowid
        conn.commit()
        conn.close()
        return event_id
        
    event_id = _write_db()
    
    background_tasks.add_task(fetch_and_update_geolocation, event_id, ip_address)
    
    return {"status": "success"}

@router.get("/summary")
async def get_summary(days: Optional[int] = None):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        date_cond = f"WHERE datetime(created_at) >= datetime('now', '-{days} days')" if days else ""
        date_cond_and = f"AND datetime(created_at) >= datetime('now', '-{days} days')" if days else ""
        
        c.execute(f"SELECT COUNT(*) FROM analytics_events {date_cond}")
        total_events = c.fetchone()[0] or 0
        
        c.execute(f"SELECT COUNT(DISTINCT session_id) FROM analytics_events {date_cond}")
        unique_sessions = c.fetchone()[0] or 0
        
        c.execute(f"SELECT COUNT(DISTINCT country) FROM analytics_events WHERE country IS NOT NULL AND country != 'Local/Unknown' {date_cond_and}")
        unique_countries = c.fetchone()[0] or 0
        
        conn.close()
        return {
            "total_events": total_events,
            "unique_sessions": unique_sessions,
            "unique_countries": unique_countries
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/timeseries")
async def get_timeseries(days: Optional[int] = 30):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        date_cond = f"WHERE datetime(created_at) >= datetime('now', '-{days} days')" if days else ""
        c.execute(f"""
            SELECT SUBSTR(created_at, 1, 10) as date, COUNT(*) as count 
            FROM analytics_events 
            {date_cond}
            GROUP BY date 
            ORDER BY date ASC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"date": row[0], "count": row[1]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/locations")
async def get_locations(days: Optional[int] = None):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        date_cond_and = f"AND datetime(created_at) >= datetime('now', '-{days} days')" if days else ""
        c.execute(f"""
            SELECT country, city, COUNT(*) as count 
            FROM analytics_events 
            WHERE country IS NOT NULL AND country != 'Local/Unknown' {date_cond_and}
            GROUP BY country, city 
            ORDER BY count DESC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"country": row[0], "city": row[1], "count": row[2]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/modules")
async def get_modules(days: Optional[int] = None):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        date_cond = f"WHERE datetime(created_at) >= datetime('now', '-{days} days')" if days else ""
        c.execute(f"""
            SELECT module, COUNT(*) as count 
            FROM analytics_events 
            {date_cond}
            GROUP BY module 
            ORDER BY count DESC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"module": row[0], "count": row[1]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/raw")
async def get_raw(limit: int = 50):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(f"""
            SELECT id, event_type, module, path, ip_address, country, city, created_at 
            FROM analytics_events 
            ORDER BY created_at DESC LIMIT {limit}
        """)
        rows = c.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        return {"error": str(e)}
