import sqlite3

try:
    conn = sqlite3.connect("analytics_events.db")
    c = conn.cursor()
    c.execute("SELECT * FROM analytics_events ORDER BY id DESC LIMIT 5")
    rows = c.fetchall()
    for row in rows:
        print(row)
    conn.close()
except Exception as e:
    print("Error:", e)
