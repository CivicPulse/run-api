"""Volunteer application model for approval-gated signup-link intake."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VolunteerApplication(Base):
    """Pending or resolved volunteer application submitted from a signup link."""

    __tablename__ = "volunteer_applications"
    __table_args__ = (
        Index("ix_volunteer_applications_campaign_status", "campaign_id", "status"),
        Index(
            "ix_volunteer_applications_signup_link_id",
            "signup_link_id",
        ),
        Index(
            "ix_volunteer_applications_applicant_user_id",
            "applicant_user_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    signup_link_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("signup_links.id", ondelete="RESTRICT"),
        nullable=False,
    )
    signup_link_label: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    reviewed_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        default=None,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )
