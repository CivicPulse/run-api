"""Invite SQLAlchemy model for campaign invitation flow."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Invite(Base):
    """Campaign invite with token-based acceptance flow.

    Invites are scoped to a campaign and grant a specific role
    upon acceptance. Each invite has a unique token for URL construction.
    """

    __tablename__ = "invites"
    __table_args__ = (
        UniqueConstraint(
            "email", "campaign_id", name="uq_pending_invite_email_campaign"
        ),
    )

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
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
