from fastapi.testclient import TestClient
from main import app
import sqlite3

client = TestClient(app)

response = client.post("/api/analytics/event", json={
    "event_type": "page_view",
    "module": "home",
    "path": "/",
    "session_id": "test-session-123"
})

with open("test_out.txt", "w") as f:
    f.write(f"STATUS: {response.status_code}\n")
    f.write(f"BODY: {response.json()}\n")
    f.write("DB ROWS:\n")
    
    conn = sqlite3.connect("analytics_events.db")
    c = conn.cursor()
    c.execute("SELECT * FROM analytics_events")
    for row in c.fetchall():
        f.write(f"{row}\n")
    conn.close()
