import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from poller import db
from poller.models import Base


@pytest.fixture()
def sqlite_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine)
    monkeypatch.setattr(db, "SessionLocal", test_session)
    yield
