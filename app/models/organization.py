"""Organization SQLAlchemy model."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Organization(Base):
    """Organization model representing a persistent legal entity.

    Organizations persist across election cycles. Each campaign belongs to
    exactly one organization. ZITADEL orgs map 1:1 to organizations (not
    campaigns).
    """

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    zitadel_org_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    zitadel_project_grant_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255))
    twilio_account_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    twilio_auth_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    twilio_auth_token_key_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    twilio_auth_token_last4: Mapped[str | None] = mapped_column(
        String(4), nullable=True
    )
    twilio_account_sid_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    twilio_auth_token_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    twilio_api_key_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    twilio_api_key_secret_encrypted: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    twilio_api_key_secret_key_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    twilio_twiml_app_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_voice_number_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_phone_numbers.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
    default_sms_number_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_phone_numbers.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
