import sqlite3
import sys

conn = sqlite3.connect('backend/users.db')
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT email, reset_token FROM users").fetchall()

with open('debug_users.txt', 'w') as f:
    if not rows:
        f.write("NO USERS FOUND IN DATABASE.\n")
    for row in rows:
        f.write(f"EMAIL: {row['email']} | TOKEN: {row['reset_token']}\n")
conn.close()
print("WROTE DB TO debug_users.txt")
