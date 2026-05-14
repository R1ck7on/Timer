from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {}
pool_kw = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
if ":memory:" in settings.database_url:
    pool_kw["poolclass"] = StaticPool

engine = create_engine(settings.database_url, connect_args=connect_args, **pool_kw)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
