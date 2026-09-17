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
    # Lazily add parent_id column if it doesn't exist
    try:
        cursor.execute("ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    # Lazily add category column if it doesn't exist
    try:
        cursor.execute("ALTER TABLE comments ADD COLUMN category TEXT DEFAULT 'General'")
    except sqlite3.OperationalError:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comment_upvotes (
            comment_id INTEGER,
            author TEXT,
            PRIMARY KEY (comment_id, author)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS community_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient TEXT NOT NULL,
            sender TEXT NOT NULL,
            type TEXT NOT NULL,
            comment_id INTEGER NOT NULL,
            read INTEGER DEFAULT 0,
            timestamp TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_profiles (
            author TEXT PRIMARY KEY,
            bio TEXT,
            avatar_url TEXT
        )
    ''')
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

def add_comment(author: str, content: str, tag: str = None, image_url: str = None, parent_id: int = None, category: str = 'General') -> int:
    """Inserts a new comment into the database securely via parameterized query."""
    timestamp = datetime.datetime.utcnow().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO comments (author, content, tag, image_url, timestamp, parent_id, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (author, content, tag, image_url, timestamp, parent_id, category)
        )
        conn.commit()
        comment_id = c.lastrowid
        
        # Create notification if it's a reply
        if parent_id:
            c.execute("SELECT author FROM comments WHERE id = ?", (parent_id,))
            parent_row = c.fetchone()
            if parent_row and parent_row[0] != author:
                c.execute(
                    "INSERT INTO community_notifications (recipient, sender, type, comment_id, timestamp) VALUES (?, ?, 'reply', ?, ?)",
                    (parent_row[0], author, comment_id, timestamp)
                )
                conn.commit()

        conn.close()
        return comment_id
    except Exception as e:
        logger.error(f"Error adding comment: {e}")
        raise

def get_comments(tag_filter: Optional[str] = None, search: Optional[str] = None, limit: int = 100, offset: int = 0, category: Optional[str] = None) -> List[Dict]:
    """Retrieves the latest comments, optionally filtered by a tag or search query, with pagination."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    query = "SELECT c.id, c.author, c.content, c.tag, c.image_url, c.timestamp, c.is_edited, c.parent_id, GROUP_CONCAT(u.author) as upvoters, c.category FROM comments c LEFT JOIN comment_upvotes u ON c.id = u.comment_id"
    params = []
    
    conditions = []
    if tag_filter:
        conditions.append("c.tag = ?")
        params.append(tag_filter)
    if category:
        conditions.append("c.category = ?")
        params.append(category)
    if search:
        conditions.append("(c.content LIKE ? OR c.author LIKE ?)")
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " GROUP BY c.id ORDER BY c.id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()
    
    comments = []
    for row in rows:
        upvoters = row[8].split(',') if row[8] else []
        comments.append({
            "id": row[0],
            "author": row[1],
            "content": row[2],
            "tag": row[3],
            "image_url": row[4],
            "timestamp": row[5],
            "is_edited": bool(row[6]),
            "parent_id": row[7],
            "upvotes": len(upvoters),
            "upvoted_by": upvoters,
            "category": row[9]
        })
    return comments

def get_comment(comment_id: int) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, author, content, tag, image_url, timestamp, is_edited, parent_id, category FROM comments WHERE id = ?", (comment_id,))
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
        "is_edited": bool(row[6]),
        "parent_id": row[7],
        "category": row[8]
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
    c.execute("DELETE FROM comments WHERE id = ? OR parent_id = ?", (comment_id, comment_id))
    c.execute("DELETE FROM comment_upvotes WHERE comment_id = ?", (comment_id,))
    conn.commit()
    conn.close()

def toggle_upvote(comment_id: int, author: str) -> bool:
    timestamp = datetime.datetime.utcnow().isoformat()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM comment_upvotes WHERE comment_id = ? AND author = ?", (comment_id, author))
    exists = c.fetchone()
    if exists:
        c.execute("DELETE FROM comment_upvotes WHERE comment_id = ? AND author = ?", (comment_id, author))
        is_upvoted = False
    else:
        c.execute("INSERT INTO comment_upvotes (comment_id, author) VALUES (?, ?)", (comment_id, author))
        is_upvoted = True
        
        # Notify the author of the post
        c.execute("SELECT author FROM comments WHERE id = ?", (comment_id,))
        post_author_row = c.fetchone()
        if post_author_row and post_author_row[0] != author:
            c.execute(
                "INSERT INTO community_notifications (recipient, sender, type, comment_id, timestamp) VALUES (?, ?, 'upvote', ?, ?)",
                (post_author_row[0], author, comment_id, timestamp)
            )

    conn.commit()
    conn.close()
    return is_upvoted

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

# --- User Profiles ---
def get_user_profile(author: str) -> Dict:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT bio, avatar_url FROM user_profiles WHERE author = ?", (author,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"author": author, "bio": row[0] or "", "avatar_url": row[1] or ""}
    return {"author": author, "bio": "", "avatar_url": ""}

def update_user_profile(author: str, bio: str, avatar_url: str = None) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO user_profiles (author, bio, avatar_url) VALUES (?, ?, ?)",
        (author, bio, avatar_url)
    )
    conn.commit()
    conn.close()

# --- Notifications ---
def get_notifications(author: str) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, sender, type, comment_id, read, timestamp FROM community_notifications WHERE recipient = ? ORDER BY id DESC LIMIT 50",
        (author,)
    )
    rows = c.fetchall()
    conn.close()
    return [{"id": r[0], "sender": r[1], "type": r[2], "comment_id": r[3], "read": bool(r[4]), "timestamp": r[5]} for r in rows]

def mark_notifications_read(author: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE community_notifications SET read = 1 WHERE recipient = ?", (author,))
    conn.commit()
    conn.close()

