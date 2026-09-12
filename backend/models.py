from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    reset_token = Column(String, nullable=True)
    reset_token_expiry = Column(String, nullable=True)
    role = Column(String, default='user')
    created_at = Column(String, nullable=False)
    api_key = Column(String, nullable=True)

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
