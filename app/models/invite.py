"""Invite SQLAlchemy model for campaign invitation flow."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Invite(Base):
    """Campaign invite with token-based acceptance flow.

    Invites are scoped to a campaign and grant a specific role
    upon acceptance. Each invite has a unique token for URL construction.
    """

    __tablename__ = "invites"
    # Uniqueness for pending invites is enforced at the DB level via a
    # partial unique index created in migration 027_data_integrity.py
    # (CREATE UNIQUE INDEX ... WHERE accepted_at IS NULL AND revoked_at IS NULL).
    # SQLAlchemy cannot declaratively express partial unique constraints, so no
    # __table_args__ entry is needed here.

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    token: Mapped[uuid.UUID] = mapped_column(
        unique=True, index=True, default=uuid.uuid4
    )
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    email_delivery_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    email_delivery_queued_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
        default=None,
    )
    email_delivery_sent_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
        default=None,
    )
    email_delivery_provider_message_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
    )
    email_delivery_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    email_delivery_last_event_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
        default=None,
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
