"""Org-scoped Twilio phone number inventory."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OrgPhoneNumber(Base):
    """Org-scoped Twilio phone number inventory entry."""

    __tablename__ = "org_phone_numbers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    friendly_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown"
    )
    voice_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sms_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mms_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    twilio_sid: Mapped[str] = mapped_column(String(40), nullable=False)
    capabilities_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
