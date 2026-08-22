import os

code = """
# ── Blog / CMS Routes ────────────────────────────────────────────────────────

import uuid
import shutil
from fastapi import File, UploadFile
from pydantic import BaseModel
from typing import Optional
import blog_db

class BlogPostCreate(BaseModel):
    title: str
    excerpt: str = ""
    category: str = "News"
    content: str
    image_url: str = ""
    read_time: str = "2 min read"

class BlogPostUpdate(BaseModel):
    title: str
    excerpt: str = ""
    category: str = "News"
    content: str
    image_url: str = ""
    read_time: str = "2 min read"

@app.get("/api/blog/posts", tags=["blog"])
def get_blog_posts(limit: int = 100):
    posts = blog_db.get_posts(limit)
    return {"posts": posts}

@app.get("/api/blog/posts/{post_id}", tags=["blog"])
def get_blog_post(post_id: int):
    post = blog_db.get_post(post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    return {"post": post}

@app.post("/api/blog/posts", tags=["blog"])
def create_blog_post(post: BlogPostCreate, user: dict = Depends(get_current_user)):
    try:
        post_id = blog_db.create_post(
            title=post.title,
            excerpt=post.excerpt,
            category=post.category,
            content=post.content,
            image_url=post.image_url,
            read_time=post.read_time
        )
        return {"ok": True, "id": post_id}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.put("/api/blog/posts/{post_id}", tags=["blog"])
def update_blog_post(post_id: int, post: BlogPostUpdate, user: dict = Depends(get_current_user)):
    try:
        updated = blog_db.update_post(
            post_id=post_id,
            title=post.title,
            excerpt=post.excerpt,
            category=post.category,
            content=post.content,
            image_url=post.image_url,
            read_time=post.read_time
        )
        if not updated:
            raise HTTPException(404, "Post not found")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/blog/posts/{post_id}", tags=["blog"])
def delete_blog_post(post_id: int, user: dict = Depends(get_current_user)):
    try:
        deleted = blog_db.delete_post(post_id)
        if not deleted:
            raise HTTPException(404, "Post not found")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/blog/upload", tags=["blog"])
def upload_blog_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        upload_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        ext = os.path.splitext(file.filename)[1]
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"url": f"/api/static/uploads/{filename}"}
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")

"""

with open(r"c:\Users\user\Documents\blacportal\backend\main.py", "a", encoding="utf-8") as f:
    f.write(code)
