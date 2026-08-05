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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
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

async def fetch_country_from_ip(ip: str) -> str:
    # Handle localhost
    if ip in ("127.0.0.1", "::1", "localhost"):
        return "Localhost"
    
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"http://ip-api.com/json/{ip}")
            data = response.json()
            if data.get("status") == "success":
                return data.get("country", "Unknown")
    except Exception as e:
        logger.warning(f"Failed to fetch GeoIP for {ip}: {e}")
    return "Unknown"

async def log_visit(ip: str, endpoint: str):
    try:
        country = await fetch_country_from_ip(ip)
        timestamp = datetime.datetime.utcnow().isoformat()
        
        # Write to db synchronously, it's fast enough
        def _write_db():
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute(
                "INSERT INTO visits (timestamp, ip, country, endpoint) VALUES (?, ?, ?, ?)",
                (timestamp, ip, country, endpoint)
            )
            conn.commit()
            conn.close()
            
        await asyncio.to_thread(_write_db)
    except Exception as e:
        logger.error(f"Error logging visit: {e}")

router = APIRouter(prefix="/api/admin", tags=["admin"])

def verify_admin_password(admin_password: str = Header(..., alias="X-Admin-Password")):
    expected_password = os.environ.get("ADMIN_PASSWORD", "default_secret")
    if admin_password != expected_password:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.get("/stats", dependencies=[Depends(verify_admin_password)])
def get_analytics_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Total visitors (unique IPs)
    c.execute("SELECT COUNT(DISTINCT ip) FROM visits")
    total_visitors = c.fetchone()[0]
    
    # Total visits
    c.execute("SELECT COUNT(*) FROM visits")
    total_visits = c.fetchone()[0]
    
    # Visits by country
    c.execute("SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 10")
    top_countries = [{"country": row[0], "count": row[1]} for row in c.fetchall()]
    
    # Recent visits
    c.execute("SELECT timestamp, ip, country, endpoint FROM visits ORDER BY id DESC LIMIT 50")
    recent_visits = [{"timestamp": row[0], "ip": row[1], "country": row[2], "endpoint": row[3]} for row in c.fetchall()]
    
    conn.close()
    
    return {
        "total_visitors": total_visitors,
        "total_visits": total_visits,
        "top_countries": top_countries,
        "recent_visits": recent_visits
    }
