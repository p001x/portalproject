import os
import sqlite3
import urllib.request
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Tuple
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'analytics_events.db')

# In-memory IP Geolocation Cache to prevent hitting rate limits
GEO_CACHE: Dict[str, Tuple[Optional[str], Optional[str]]] = {}

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn

def init_db():
    conn = get_db()
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
            created_at TEXT,
            user_email TEXT
        )
    ''')
    conn.commit()
    # Check if user_email column exists in existing database
    try:
        cursor.execute("ALTER TABLE analytics_events ADD COLUMN user_email TEXT")
        conn.commit()
    except Exception:
        pass
    conn.close()

init_db()

class AnalyticsEvent(BaseModel):
    event_type: str
    module: str
    path: str
    session_id: str
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    user_email: Optional[str] = None

def is_private_ip(ip: str) -> bool:
    if not ip or ip in ("127.0.0.1", "::1", "localhost", "unknown"):
        return True
    if ip.startswith("192.168.") or ip.startswith("10."):
        return True
    if ip.startswith("172."):
        parts = ip.split(".")
        if len(parts) >= 2 and parts[1].isdigit():
            second_octet = int(parts[1])
            if 16 <= second_octet <= 31:
                return True
    return False

def get_client_ip(request: Request) -> str:
    # 1. Check standard proxy headers (Render, Cloudflare, Nginx)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first_ip = forwarded.split(",")[0].strip()
        if first_ip and not is_private_ip(first_ip):
            return first_ip
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip() and not is_private_ip(real_ip.strip()):
        return real_ip.strip()
    return request.client.host if request.client else "unknown"

def fetch_and_update_geolocation(event_id: int, ip: str):
    if is_private_ip(ip):
        country, city = "Local/Unknown", "Local/Unknown"
    elif ip in GEO_CACHE:
        country, city = GEO_CACHE[ip]
    else:
        country, city = None, None
        try:
            req = urllib.request.Request(f"http://ip-api.com/json/{ip}", headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5.0) as response:
                data = json.loads(response.read().decode('utf-8'))
                if data.get("status") == "success":
                    country = data.get("country")
                    city = data.get("city")
                    GEO_CACHE[ip] = (country, city)
        except Exception:
            pass  # Best effort, never break on error
            
    if country or city:
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute("UPDATE analytics_events SET country = ?, city = ? WHERE id = ?", (country, city, event_id))
            conn.commit()
            conn.close()
        except Exception:
            pass

@router.post("/event")
async def log_event(event: AnalyticsEvent, request: Request, background_tasks: BackgroundTasks):
    ip_address = event.ip_address or get_client_ip(request)
    user_agent = event.user_agent or request.headers.get("user-agent", "unknown")
    created_at = datetime.now(timezone.utc).isoformat()
    
    def _write_db():
        conn = get_db()
        c = conn.cursor()
        c.execute(
            """INSERT INTO analytics_events 
               (event_type, module, path, session_id, ip_address, country, city, user_agent, created_at, user_email) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event.event_type, event.module, event.path, event.session_id, ip_address, None, None, user_agent, created_at, event.user_email)
        )
        event_id = c.lastrowid
        conn.commit()
        conn.close()
        return event_id
        
    event_id = _write_db()
    
    background_tasks.add_task(fetch_and_update_geolocation, event_id, ip_address)
    
    return {"status": "success"}

def is_bot_user_agent(ua: Optional[str]) -> bool:
    if not ua:
        return False
    ua_lower = ua.lower()
    bot_keywords = [
        "bot", "crawler", "spider", "slurp", "curl", "wget", "python-requests",
        "httpx", "postman", "headless", "facebookexternalhit", "whatsapp",
        "slackbot", "preview", "scraper", "feedfetcher", "ahrefs", "semrush"
    ]
    return any(k in ua_lower for k in bot_keywords)

def parse_user_agent(ua: Optional[str]) -> Dict[str, str]:
    if not ua:
        return {"device": "Unknown", "browser": "Unknown", "os": "Unknown"}
    
    if is_bot_user_agent(ua):
        return {"device": "Bot", "browser": "Bot/Crawler", "os": "Automated"}

    ua_lower = ua.lower()

    # Device
    if "tablet" in ua_lower or "ipad" in ua_lower:
        device = "Tablet"
    elif "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        device = "Mobile"
    else:
        device = "Desktop"

    # Browser
    if "edg" in ua_lower:
        browser = "Edge"
    elif "opr" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    elif "chrome" in ua_lower and "chromium" not in ua_lower and "edg" not in ua_lower:
        browser = "Chrome"
    elif "firefox" in ua_lower:
        browser = "Firefox"
    elif "safari" in ua_lower and "chrome" not in ua_lower:
        browser = "Safari"
    else:
        browser = "Other"

    # OS
    if "windows" in ua_lower:
        os_name = "Windows"
    elif "macintosh" in ua_lower or "mac os" in ua_lower:
        os_name = "macOS"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower:
        os_name = "iOS"
    elif "linux" in ua_lower:
        os_name = "Linux"
    else:
        os_name = "Other"

    return {"device": device, "browser": browser, "os": os_name}

@router.get("/summary")
async def get_summary(days: Optional[int] = None, exclude_bots: bool = False):
    try:
        conn = get_db()
        c = conn.cursor()
        
        conditions = []
        if days:
            conditions.append(f"datetime(created_at) >= datetime('now', '-{days} days')")
        if exclude_bots:
            conditions.append("(user_agent NOT LIKE '%bot%' AND user_agent NOT LIKE '%crawler%' AND user_agent NOT LIKE '%spider%' AND user_agent NOT LIKE '%curl%')")
            
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        where_country = f"WHERE country IS NOT NULL AND country != 'Local/Unknown' {' AND ' + ' AND '.join(conditions) if conditions else ''}"
        
        c.execute(f"SELECT COUNT(*) FROM analytics_events {where_clause}")
        total_events = c.fetchone()[0] or 0
        
        c.execute(f"SELECT COUNT(DISTINCT session_id) FROM analytics_events {where_clause}")
        unique_sessions = c.fetchone()[0] or 0
        
        c.execute(f"SELECT COUNT(DISTINCT country) FROM analytics_events {where_country}")
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
async def get_timeseries(days: Optional[int] = None, exclude_bots: bool = False):
    try:
        conn = get_db()
        c = conn.cursor()
        conditions = []
        if days:
            conditions.append(f"datetime(created_at) >= datetime('now', '-{days} days')")
        if exclude_bots:
            conditions.append("(user_agent NOT LIKE '%bot%' AND user_agent NOT LIKE '%crawler%' AND user_agent NOT LIKE '%spider%' AND user_agent NOT LIKE '%curl%')")
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        c.execute(f"""
            SELECT SUBSTR(created_at, 1, 10) as date, COUNT(*) as count 
            FROM analytics_events 
            {where_clause}
            GROUP BY date 
            ORDER BY date ASC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"date": row[0], "count": row[1]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/locations")
async def get_locations(days: Optional[int] = None, exclude_bots: bool = False):
    try:
        conn = get_db()
        c = conn.cursor()
        conditions = ["country IS NOT NULL", "country != 'Local/Unknown'"]
        if days:
            conditions.append(f"datetime(created_at) >= datetime('now', '-{days} days')")
        if exclude_bots:
            conditions.append("(user_agent NOT LIKE '%bot%' AND user_agent NOT LIKE '%crawler%' AND user_agent NOT LIKE '%spider%' AND user_agent NOT LIKE '%curl%')")
        where_clause = f"WHERE {' AND '.join(conditions)}"

        c.execute(f"""
            SELECT country, city, COUNT(*) as count 
            FROM analytics_events 
            {where_clause}
            GROUP BY country, city 
            ORDER BY count DESC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"country": row[0], "city": row[1], "count": row[2]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/modules")
async def get_modules(days: Optional[int] = None, exclude_bots: bool = False):
    try:
        conn = get_db()
        c = conn.cursor()
        conditions = []
        if days:
            conditions.append(f"datetime(created_at) >= datetime('now', '-{days} days')")
        if exclude_bots:
            conditions.append("(user_agent NOT LIKE '%bot%' AND user_agent NOT LIKE '%crawler%' AND user_agent NOT LIKE '%spider%' AND user_agent NOT LIKE '%curl%')")
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        c.execute(f"""
            SELECT module, COUNT(*) as count 
            FROM analytics_events 
            {where_clause}
            GROUP BY module 
            ORDER BY count DESC
        """)
        rows = c.fetchall()
        conn.close()
        return [{"module": row[0], "count": row[1]} for row in rows]
    except Exception as e:
        return {"error": str(e)}

@router.get("/devices")
async def get_devices(days: Optional[int] = None, exclude_bots: bool = False):
    try:
        conn = get_db()
        c = conn.cursor()
        conditions = []
        if days:
            conditions.append(f"datetime(created_at) >= datetime('now', '-{days} days')")
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        c.execute(f"SELECT user_agent FROM analytics_events {where_clause}")
        rows = c.fetchall()
        conn.close()
        
        devices_count: Dict[str, int] = {}
        browsers_count: Dict[str, int] = {}
        os_count: Dict[str, int] = {}
        
        for (ua,) in rows:
            parsed = parse_user_agent(ua)
            if exclude_bots and parsed["device"] == "Bot":
                continue
            devices_count[parsed["device"]] = devices_count.get(parsed["device"], 0) + 1
            browsers_count[parsed["browser"]] = browsers_count.get(parsed["browser"], 0) + 1
            os_count[parsed["os"]] = os_count.get(parsed["os"], 0) + 1
            
        return {
            "devices": [{"name": k, "count": v} for k, v in sorted(devices_count.items(), key=lambda x: x[1], reverse=True)],
            "browsers": [{"name": k, "count": v} for k, v in sorted(browsers_count.items(), key=lambda x: x[1], reverse=True)],
            "os": [{"name": k, "count": v} for k, v in sorted(os_count.items(), key=lambda x: x[1], reverse=True)],
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/realtime")
async def get_realtime():
    try:
        conn = get_db()
        c = conn.cursor()
        
        # Active visitors in the last 15 minutes
        c.execute("""
            SELECT COUNT(DISTINCT session_id), COUNT(*) 
            FROM analytics_events 
            WHERE datetime(created_at) >= datetime('now', '-15 minutes')
        """)
        row = c.fetchone()
        active_visitors = row[0] or 0
        recent_events = row[1] or 0
        
        # Recent live active modules in the last 15 minutes
        c.execute("""
            SELECT module, COUNT(*) as count 
            FROM analytics_events 
            WHERE datetime(created_at) >= datetime('now', '-15 minutes')
            GROUP BY module ORDER BY count DESC LIMIT 5
        """)
        top_now = [{"module": r[0], "count": r[1]} for r in c.fetchall()]
        
        conn.close()
        return {
            "active_visitors": active_visitors,
            "recent_events": recent_events,
            "top_modules": top_now
        }
    except Exception as e:
        return {"error": str(e), "active_visitors": 0, "recent_events": 0, "top_modules": []}

@router.get("/raw")
async def get_raw(limit: int = 50, exclude_bots: bool = False):
    try:
        conn = get_db()
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        where = "WHERE (user_agent NOT LIKE '%bot%' AND user_agent NOT LIKE '%crawler%' AND user_agent NOT LIKE '%spider%' AND user_agent NOT LIKE '%curl%')" if exclude_bots else ""
        
        c.execute(f"""
            SELECT id, event_type, module, path, ip_address, country, city, created_at, user_email, user_agent 
            FROM analytics_events 
            {where}
            ORDER BY created_at DESC LIMIT {limit}
        """)
        rows = c.fetchall()
        conn.close()
        
        results = []
        for r in rows:
            d = dict(r)
            ua_parsed = parse_user_agent(d.get("user_agent"))
            d["device"] = ua_parsed["device"]
            d["browser"] = ua_parsed["browser"]
            d["is_bot"] = ua_parsed["device"] == "Bot"
            results.append(d)
        return results
    except Exception as e:
        return {"error": str(e)}

