import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from pathlib import Path
from models import Base

_HERE = Path(__file__).resolve().parent
# Default to SQLite for local development if DATABASE_URL is not provided
DEFAULT_DATABASE_URL = f"sqlite:///{_HERE}/data/storage.db"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)

# SQLite specific config
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Automatically reconnect to DB if connection drops
)

# For SQLite, we should enable WAL mode for better concurrency
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))

def init_db():
    if DATABASE_URL.startswith("sqlite"):
        # Ensure directory exists for SQLite
        Path(DATABASE_URL.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
