from datetime import datetime, timezone
import logging
from typing import List, Dict, Optional

from database import SessionLocal, init_db as _init_main_db
from models import BlogPost

logger = logging.getLogger(__name__)

# Ensure unified DB is initialized
_init_main_db()

def _post_to_dict(post: BlogPost) -> Dict:
    return {
        "id": post.id,
        "title": post.title,
        "excerpt": post.excerpt,
        "category": post.category,
        "content": post.content,
        "image_url": post.image_url,
        "read_time": post.read_time,
        "timestamp": post.timestamp,
    }

def create_post(title: str, excerpt: str, category: str, content: str, image_url: str, read_time: str) -> int:
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        with SessionLocal() as db:
            post = BlogPost(
                title=title,
                excerpt=excerpt,
                category=category,
                content=content,
                image_url=image_url,
                read_time=read_time,
                timestamp=timestamp
            )
            db.add(post)
            db.commit()
            db.refresh(post)
            return post.id
    except Exception as e:
        logger.error(f"Error creating blog post: {e}")
        raise

def get_posts(limit: int = 100) -> List[Dict]:
    with SessionLocal() as db:
        posts = db.query(BlogPost).order_by(BlogPost.id.desc()).limit(limit).all()
        return [_post_to_dict(p) for p in posts]

def get_post(post_id: int) -> Optional[Dict]:
    with SessionLocal() as db:
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        return _post_to_dict(post) if post else None

def update_post(post_id: int, title: str, excerpt: str, category: str, content: str, image_url: str, read_time: str) -> bool:
    try:
        with SessionLocal() as db:
            post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
            if not post:
                return False
            post.title = title
            post.excerpt = excerpt
            post.category = category
            post.content = content
            post.image_url = image_url
            post.read_time = read_time
            db.commit()
            return True
    except Exception as e:
        logger.error(f"Error updating blog post: {e}")
        raise

def delete_post(post_id: int) -> bool:
    try:
        with SessionLocal() as db:
            post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
            if not post:
                return False
            db.delete(post)
            db.commit()
            return True
    except Exception as e:
        logger.error(f"Error deleting blog post: {e}")
        raise
