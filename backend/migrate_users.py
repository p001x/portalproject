import sqlite3
import os
import logging
from datetime import datetime, timezone
from database import SessionLocal
from models import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_users():
    old_db = "users.db"
    if not os.path.exists(old_db):
        logger.warning(f"{old_db} not found!")
        return

    logger.info("Migrating users from users.db to SQLAlchemy storage.db...")
    try:
        conn = sqlite3.connect(old_db)
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            logger.warning("No 'users' table found in users.db")
            return
            
        cursor.execute("SELECT * FROM users")
        rows = cursor.fetchall()
        
        # Get column names
        cursor.execute("PRAGMA table_info(users)")
        columns = [info[1] for info in cursor.fetchall()]
        
        logger.info(f"Found {len(rows)} users in users.db. Columns: {columns}")
        
        with SessionLocal() as db:
            migrated = 0
            for row in rows:
                user_dict = dict(zip(columns, row))
                
                # Check if user already exists
                existing = db.query(User).filter(User.email == user_dict.get('email')).first()
                if existing:
                    logger.info(f"User {user_dict.get('email')} already exists, skipping.")
                    continue
                
                # Map old row to new User model
                new_user = User(
                    name=user_dict.get('name', 'Unknown'),
                    email=user_dict.get('email'),
                    password_hash=user_dict.get('password_hash'),
                    reset_token=user_dict.get('reset_token'),
                    reset_token_expiry=user_dict.get('reset_token_expiry'),
                    role=user_dict.get('role', 'user'),
                    created_at=user_dict.get('created_at', datetime.now(timezone.utc).isoformat()),
                    api_key=user_dict.get('api_key')
                )
                db.add(new_user)
                migrated += 1
                
            db.commit()
            logger.info(f"Successfully migrated {migrated} users.")
            
    except Exception as e:
        logger.error(f"Migration failed: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    from database import init_db
    init_db()
    migrate_users()
