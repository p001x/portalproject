import sqlite3
import os
from pathlib import Path

db_path = Path(__file__).parent / "data" / "storage.db"

def migrate():
    if not db_path.exists():
        print(f"Database {db_path} does not exist yet. Assuming first run.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
        print("Added google_id to users.")
    except sqlite3.OperationalError as e:
        print(f"Column google_id might already exist: {e}")

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0")
        print("Added is_verified to users.")
    except sqlite3.OperationalError as e:
        print(f"Column is_verified might already exist: {e}")

    # Create OTP table if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used BOOLEAN DEFAULT 0
    )
    """)
    print("Ensured otps table exists.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
