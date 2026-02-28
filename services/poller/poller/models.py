from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Launch(Base):
    __tablename__ = "launches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    net: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str | None] = mapped_column(String(100))
    pad: Mapped[str | None] = mapped_column(String(255))
    location_id: Mapped[int | None] = mapped_column(Integer)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notified_24h: Mapped[bool] = mapped_column(Boolean, default=False)
    notified_1h: Mapped[bool] = mapped_column(Boolean, default=False)
    notified_15m: Mapped[bool] = mapped_column(Boolean, default=False)
