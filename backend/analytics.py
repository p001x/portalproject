import os
import sqlite3
import datetime
import asyncio
import httpx
from fastapi import APIRouter, Header, HTTPException, Depends
from typing import Optional
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'analytics.db')

def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            ip TEXT,
            country TEXT,
            endpoint TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

_GEOIP_CACHE = {}
_MAX_GEOIP_CACHE = 5000

async def fetch_country_from_ip(ip: str) -> str:
    if not ip or ip in ("127.0.0.1", "::1", "localhost", "unknown"):
        return "Localhost"
    
    if ip in _GEOIP_CACHE:
        return _GEOIP_CACHE[ip]

    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(f"http://ip-api.com/json/{ip}")
            data = response.json()
            if data.get("status") == "success":
                country = data.get("country", "Unknown")
                if len(_GEOIP_CACHE) < _MAX_GEOIP_CACHE:
                    _GEOIP_CACHE[ip] = country
                return country
    except Exception:
        pass
    return "Unknown"

async def log_visit(ip: str, endpoint: str, country: Optional[str] = None):
    try:
        # 1. Prefer Cloudflare's high-accuracy edge country header if provided
        if country and country != "XX" and country != "T1":
            resolved_country = country
        elif ip in _GEOIP_CACHE:
            resolved_country = _GEOIP_CACHE[ip]
        elif ip in ("127.0.0.1", "::1", "localhost", "unknown"):
            resolved_country = "Localhost"
        else:
            resolved_country = "Unknown"
            if len(_GEOIP_CACHE) < _MAX_GEOIP_CACHE:
                asyncio.create_task(fetch_country_from_ip(ip))

        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        def _write_db():
            with sqlite3.connect(DB_PATH, timeout=15.0) as conn:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
                c = conn.cursor()
                c.execute(
                    "INSERT INTO visits (timestamp, ip, country, endpoint) VALUES (?, ?, ?, ?)",
                    (timestamp, ip, resolved_country, endpoint)
                )
                conn.commit()
            
        await asyncio.to_thread(_write_db)
    except Exception as e:
        logger.debug(f"Analytics visit log notice: {e}")

router = APIRouter(prefix="/api/admin", tags=["admin"])

def verify_admin_password(admin_password: str = Header(..., alias="X-Admin-Password")):
    expected_password = os.environ.get("ADMIN_PASSWORD", "default_secret")
    if admin_password != expected_password:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.get("/stats", dependencies=[Depends(verify_admin_password)])
def get_analytics_stats():
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    c = conn.cursor()
    
    # Total visitors (unique IPs)
    c.execute("SELECT COUNT(DISTINCT ip) FROM visits")
    total_visitors = c.fetchone()[0]
    
    # Total visits
    c.execute("SELECT COUNT(*) FROM visits")
    total_visits = c.fetchone()[0]
    
    # Visits by country
    c.execute("SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 10")
    by_country = [{"country": r[0], "count": r[1]} for r in c.fetchall()]
    
    # Top 5 most visited endpoints
    c.execute("SELECT endpoint, COUNT(*) as count FROM visits GROUP BY endpoint ORDER BY count DESC LIMIT 5")
    top_endpoints = [{"endpoint": r[0], "count": r[1]} for r in c.fetchall()]
    
    conn.close()
    
    return {
        "total_visitors": total_visitors,
        "total_visits": total_visits,
        "by_country": by_country,
        "top_endpoints": top_endpoints
    }
