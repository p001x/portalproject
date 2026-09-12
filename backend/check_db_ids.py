import sqlite3
import json

conn = sqlite3.connect('c:\\Users\\user\\Documents\\blacportal\\backend\\data\\storage.db')
cursor = conn.cursor()
cursor.execute("SELECT id, name FROM datasets LIMIT 10")
rows = cursor.fetchall()
print(json.dumps(rows, indent=2))
conn.close()
