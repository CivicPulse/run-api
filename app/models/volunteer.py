"""Volunteer models -- profile, tags, availability, and skills tracking."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VolunteerStatus(enum.StrEnum):
    """Lifecycle status of a volunteer."""

    PENDING = "pending"
    ACTIVE = "active"
    INACTIVE = "inactive"


class VolunteerSkill(enum.StrEnum):
    """Predefined skill categories for volunteers."""

    CANVASSING = "canvassing"
    PHONE_BANKING = "phone_banking"
    DATA_ENTRY = "data_entry"
    EVENT_SETUP = "event_setup"
    SOCIAL_MEDIA = "social_media"
    TRANSLATION = "translation"
    DRIVING = "driving"
    VOTER_REGISTRATION = "voter_registration"
    FUNDRAISING = "fundraising"
    GRAPHIC_DESIGN = "graphic_design"


class Volunteer(Base):
    """A volunteer registered to a campaign with profile and contact info.

    Volunteers may or may not be linked to an authenticated user account.
    Walk-in volunteers have no user_id; self-registered volunteers are
    auto-linked to their user_id.
    """

    __tablename__ = "volunteers"
    __table_args__ = (
        Index("ix_volunteers_campaign_id", "campaign_id"),
        Index("ix_volunteers_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    emergency_contact_phone: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default=VolunteerStatus.PENDING, nullable=False
    )
    skills: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class VolunteerTag(Base):
    """Free-form campaign-scoped tag for categorizing volunteers."""

    __tablename__ = "volunteer_tags"
    __table_args__ = (
        Index("ix_volunteer_tags_campaign_id", "campaign_id"),
        UniqueConstraint("campaign_id", "name", name="uq_volunteer_tag_campaign_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class VolunteerTagMember(Base):
    """Join table associating volunteers with tags."""

    __tablename__ = "volunteer_tag_members"

    volunteer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("volunteers.id"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("volunteer_tags.id"), primary_key=True
    )


class VolunteerAvailability(Base):
    """Time window when a volunteer is available for shifts."""

    __tablename__ = "volunteer_availability"
    __table_args__ = (
        Index(
            "ix_volunteer_availability_vol_times",
            "volunteer_id",
            "start_at",
            "end_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    volunteer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("volunteers.id"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(nullable=False)
    end_at: Mapped[datetime] = mapped_column(nullable=False)
