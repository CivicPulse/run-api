"""Campaign-scoped SMS conversation aggregate."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SMSConversation(Base):
    """Aggregates inbox-friendly state for a voter/sender SMS thread."""

    __tablename__ = "sms_conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id", ondelete="CASCADE"),
        nullable=False,
    )
    org_phone_number_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("org_phone_numbers.id", ondelete="CASCADE"),
        nullable=False,
    )
    voter_phone_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voter_phones.id", ondelete="SET NULL"),
        nullable=True,
    )
    normalized_to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    last_message_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_message_direction: Mapped[str] = mapped_column(
        String(20), nullable=False, default="outbound"
    )
    last_message_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opt_out_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )
    opted_out_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    opt_out_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
