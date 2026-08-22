import os
import sqlite3
import datetime
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'blog.db')

def init_blog_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            excerpt TEXT,
            category TEXT,
            content TEXT NOT NULL,
            image_url TEXT,
            read_time TEXT,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_blog_db()

def create_post(title: str, excerpt: str, category: str, content: str, image_url: str, read_time: str) -> int:
    timestamp = datetime.datetime.utcnow().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO posts (title, excerpt, category, content, image_url, read_time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, excerpt, category, content, image_url, read_time, timestamp)
        )
        conn.commit()
        post_id = c.lastrowid
        conn.close()
        return post_id
    except Exception as e:
        logger.error(f"Error creating blog post: {e}")
        raise

def get_posts(limit: int = 100) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, title, excerpt, category, content, image_url, read_time, timestamp FROM posts ORDER BY id DESC LIMIT ?", 
        (limit,)
    )
        
    rows = c.fetchall()
    conn.close()
    
    posts = []
    for row in rows:
        posts.append({
            "id": row[0],
            "title": row[1],
            "excerpt": row[2],
            "category": row[3],
            "content": row[4],
            "image_url": row[5],
            "read_time": row[6],
            "timestamp": row[7]
        })
    return posts

def get_post(post_id: int) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, title, excerpt, category, content, image_url, read_time, timestamp FROM posts WHERE id = ?", 
        (post_id,)
    )
        
    row = c.fetchone()
    conn.close()
    
    if row:
        return {
            "id": row[0],
            "title": row[1],
            "excerpt": row[2],
            "category": row[3],
            "content": row[4],
            "image_url": row[5],
            "read_time": row[6],
            "timestamp": row[7]
        }
    return None

def update_post(post_id: int, title: str, excerpt: str, category: str, content: str, image_url: str, read_time: str) -> bool:
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "UPDATE posts SET title = ?, excerpt = ?, category = ?, content = ?, image_url = ?, read_time = ? WHERE id = ?",
            (title, excerpt, category, content, image_url, read_time, post_id)
        )
        conn.commit()
        updated = c.rowcount > 0
        conn.close()
        return updated
    except Exception as e:
        logger.error(f"Error updating blog post: {e}")
        raise

def delete_post(post_id: int) -> bool:
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        conn.commit()
        deleted = c.rowcount > 0
        conn.close()
        return deleted
    except Exception as e:
        logger.error(f"Error deleting blog post: {e}")
        raise
