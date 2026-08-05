import os
from fastapi.testclient import TestClient
from main import app
import sqlite3
import traceback
import time

try:
    client = TestClient(app)

    response = client.post("/api/analytics/event", json={
        "event_type": "page_view",
        "module": "rare_data",
        "path": "/rare-data",
        "session_id": "test-session-public-ip",
        "ip_address": "8.8.8.8"
    })

    # Wait for the background task to complete the geolocation lookup
    time.sleep(2)

    with open("test_out2.txt", "w") as f:
        f.write(f"STATUS: {response.status_code}\n")
        f.write(f"BODY: {response.json()}\n")
        f.write("DB ROWS:\n")
        
        conn = sqlite3.connect("analytics_events.db")
        c = conn.cursor()
        c.execute("SELECT * FROM analytics_events ORDER BY id DESC LIMIT 1")
        row = c.fetchone()
        f.write(f"{row}\n")
        conn.close()
except Exception as e:
    with open("test_out2.txt", "w") as f:
        f.write(f"ERROR: {traceback.format_exc()}\n")
finally:
    os._exit(0)
