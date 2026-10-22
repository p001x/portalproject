from sqlalchemy import Column, Integer, String, Text, Boolean
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expiry = Column(String, nullable=True)
    role = Column(String, default='user')
    created_at = Column(String, nullable=False)
    api_key = Column(String, nullable=True)
    google_id = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    profile_picture = Column(String, nullable=True)
    preferences = Column(Text, nullable=True) # JSON string of user preferences
    is_blocked = Column(Boolean, default=False)
    blocked_reason = Column(String, nullable=True)
    blocked_at = Column(String, nullable=True)
    last_active = Column(String, nullable=True)

class UserActivity(Base):
    __tablename__ = 'user_activities'
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, nullable=False, index=True)
    user_name = Column(String, nullable=True)
    action = Column(String, nullable=False) # e.g. "view_page", "compute_ndvi", "download_dataset", "comment", "login"
    module = Column(String, nullable=True) # e.g. "NDVI", "Slope Analysis", "Rare Data", "Community", etc.
    details = Column(Text, nullable=True)
    timestamp = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)

class UserAppeal(Base):
    __tablename__ = 'user_appeals'
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, nullable=False, index=True)
    user_name = Column(String, nullable=True)
    blocked_reason = Column(String, nullable=True)
    appeal_message = Column(Text, nullable=False)
    status = Column(String, default="pending") # "pending", "approved", "rejected"
    admin_note = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    reviewed_at = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)

class OTP(Base):
    __tablename__ = 'otps'
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, nullable=False)
    code = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    used = Column(Boolean, default=False)

class GeeUsage(Base):
    __tablename__ = 'gee_usage'
    email = Column(String, primary_key=True)
    date_str = Column(String, primary_key=True)
    request_count = Column(Integer, default=0)

class Dataset(Base):
    __tablename__ = 'datasets'
    id = Column(String, primary_key=True)
    source = Column(String, nullable=False)
    metadata_json = Column(Text, nullable=False)

class Sample(Base):
    __tablename__ = 'samples'
    id = Column(String, primary_key=True)
    metadata_json = Column(Text, nullable=False)

class GeeSession(Base):
    __tablename__ = 'gee_sessions'
    token = Column(String, primary_key=True)
    email = Column(String, nullable=False)
    project_name = Column(String, nullable=True)
    authenticated_at = Column(String, nullable=False)

class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(String, primary_key=True) # UUID string
    email = Column(String, nullable=False) # The user who receives it
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, default="info") # "security", "analysis", "community", "system"
    read = Column(Boolean, default=False)
    timestamp = Column(String, nullable=False)

class Comment(Base):
    __tablename__ = 'comments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tag = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    timestamp = Column(String, nullable=False)
    is_edited = Column(Integer, default=0)
    parent_id = Column(Integer, nullable=True)
    category = Column(String, default='General')

class CommentUpvote(Base):
    __tablename__ = 'comment_upvotes'
    comment_id = Column(Integer, primary_key=True)
    author = Column(String, primary_key=True)

class CommunityNotification(Base):
    __tablename__ = 'community_notifications'
    id = Column(Integer, primary_key=True, autoincrement=True)
    recipient = Column(String, nullable=False)
    sender = Column(String, nullable=False)
    type = Column(String, nullable=False)
    comment_id = Column(Integer, nullable=False)
    read = Column(Integer, default=0)
    timestamp = Column(String, nullable=False)

class BlogPost(Base):
    __tablename__ = 'posts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    excerpt = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    read_time = Column(String, nullable=True)
    timestamp = Column(String, nullable=False)

class ServiceRequest(Base):
    __tablename__ = 'service_requests'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String, nullable=False)
    service_type = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    status = Column(String, default='pending')
    created_at = Column(String, nullable=False)

