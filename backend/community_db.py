import os
import sqlite3
import datetime
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'community.db')

def init_community_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            tag TEXT,
            image_url TEXT,
            timestamp TEXT NOT NULL,
            is_edited INTEGER DEFAULT 0
        )
    ''')
    
    # Lazily add is_edited column if it doesn't exist
    try:
        cursor.execute("ALTER TABLE comments ADD COLUMN is_edited INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass # Column already exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS forum_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blocked_users (
            author TEXT PRIMARY KEY
        )
    ''')
    conn.commit()
    conn.close()

init_community_db()

def add_comment(author: str, content: str, tag: str = None, image_url: str = None) -> int:
    """Inserts a new comment into the database securely via parameterized query."""
    timestamp = datetime.datetime.utcnow().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO comments (author, content, tag, image_url, timestamp) VALUES (?, ?, ?, ?, ?)",
            (author, content, tag, image_url, timestamp)
        )
        conn.commit()
        comment_id = c.lastrowid
        conn.close()
        return comment_id
    except Exception as e:
        logger.error(f"Error adding comment: {e}")
        raise

def get_comments(tag_filter: Optional[str] = None, limit: int = 100) -> List[Dict]:
    """Retrieves the latest comments, optionally filtered by a tag."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    if tag_filter:
        c.execute(
            "SELECT id, author, content, tag, image_url, timestamp, is_edited FROM comments WHERE tag = ? ORDER BY id DESC LIMIT ?", 
            (tag_filter, limit)
        )
    else:
        c.execute(
            "SELECT id, author, content, tag, image_url, timestamp, is_edited FROM comments ORDER BY id DESC LIMIT ?", 
            (limit,)
        )
        
    rows = c.fetchall()
    conn.close()
    
    comments = []
    for row in rows:
        comments.append({
            "id": row[0],
            "author": row[1],
            "content": row[2],
            "tag": row[3],
            "image_url": row[4],
            "timestamp": row[5],
            "is_edited": bool(row[6])
        })
    return comments

def get_comment(comment_id: int) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, author, content, tag, image_url, timestamp, is_edited FROM comments WHERE id = ?", (comment_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "author": row[1],
        "content": row[2],
        "tag": row[3],
        "image_url": row[4],
        "timestamp": row[5],
        "is_edited": bool(row[6])
    }

def update_comment(comment_id: int, new_content: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE comments SET content = ?, is_edited = 1 WHERE id = ?", (new_content, comment_id))
    rows_affected = c.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

def delete_comment(comment_id: int) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()

def set_forum_frozen(frozen: bool) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO forum_settings (key, value) VALUES ('is_frozen', ?)",
        ("1" if frozen else "0",)
    )
    conn.commit()
    conn.close()

def is_forum_frozen() -> bool:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT value FROM forum_settings WHERE key = 'is_frozen'")
    row = c.fetchone()
    conn.close()
    return row is not None and row[0] == "1"

def block_user(author: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO blocked_users (author) VALUES (?)", (author.lower(),))
    conn.commit()
    conn.close()

def unblock_user(author: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM blocked_users WHERE author = ?", (author.lower(),))
    conn.commit()
    conn.close()

def is_user_blocked(author: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM blocked_users WHERE author = ?", (author.lower(),))
    row = c.fetchone()
    conn.close()
    return row is not None

def get_blocked_users() -> List[str]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT author FROM blocked_users ORDER BY author ASC")
    rows = c.fetchall()
    conn.close()
    return [row[0] for row in rows]
