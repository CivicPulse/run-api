"""Call record SQLAlchemy model for browser voice calling."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CallRecord(Base):
    """Tracks individual voice calls made through the browser dialer."""

    __tablename__ = "call_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    twilio_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    voter_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voters.id", ondelete="SET NULL"),
        nullable=True,
    )
    caller_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    phone_bank_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("phone_bank_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False, default="outbound"
    )
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="initiated")
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
