"""Campaign-scoped cached phone validation intelligence."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PhoneValidation(Base):
    """Cached Twilio Lookup result reused by contact and SMS flows."""

    __tablename__ = "phone_validations"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "normalized_phone_number",
            name="uq_phone_validation_campaign_phone",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    normalized_phone_number: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    is_valid: Mapped[bool | None] = mapped_column(nullable=True)
    carrier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sms_capable: Mapped[bool | None] = mapped_column(nullable=True)
    lookup_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_lookup_attempt_at: Mapped[datetime | None] = mapped_column(nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )
