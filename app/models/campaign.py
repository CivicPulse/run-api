"""Campaign SQLAlchemy model."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignType(enum.StrEnum):
    """Types of political campaigns."""

    FEDERAL = "federal"
    STATE = "state"
    LOCAL = "local"
    BALLOT = "ballot"


class CampaignStatus(enum.StrEnum):
    """Campaign lifecycle status."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Campaign(Base):
    """Campaign model representing a political campaign."""

    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    zitadel_org_id: Mapped[str] = mapped_column(String(255), index=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[CampaignType] = mapped_column(
        Enum(CampaignType, name="campaign_type", native_enum=False)
    )
    jurisdiction_fips: Mapped[str | None] = mapped_column(String(15), nullable=True)
    jurisdiction_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    election_date: Mapped[date | None] = mapped_column(nullable=True)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status", native_enum=False),
        default=CampaignStatus.ACTIVE,
    )
    candidate_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    party_affiliation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )
