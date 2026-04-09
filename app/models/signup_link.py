"""Volunteer signup-link model for public campaign-scoped entry."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SignupLink(Base):
    """Campaign-scoped public signup link managed by campaign admins."""

    __tablename__ = "signup_links"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'disabled', 'regenerated')",
            name="ck_signup_links_status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[uuid.UUID] = mapped_column(
        unique=True,
        index=True,
        nullable=False,
        default=uuid.uuid4,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="active",
        server_default="active",
    )
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    disabled_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    regenerated_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )
