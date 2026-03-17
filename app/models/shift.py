"""Shift models -- scheduling, signup, check-in/out, and hours tracking."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ShiftType(enum.StrEnum):
    """Type of volunteer shift."""

    CANVASSING = "canvassing"
    PHONE_BANKING = "phone_banking"
    GENERAL = "general"


class ShiftStatus(enum.StrEnum):
    """Lifecycle status of a shift."""

    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SignupStatus(enum.StrEnum):
    """Status of a volunteer's signup for a shift."""

    SIGNED_UP = "signed_up"
    WAITLISTED = "waitlisted"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class Shift(Base):
    """A scheduled volunteer shift with location and capacity.

    Shifts may optionally link to a turf (for canvassing) or a phone
    bank session (for phone banking). General shifts have no operational link.
    """

    __tablename__ = "shifts"
    __table_args__ = (
        Index("ix_shifts_campaign_id", "campaign_id"),
        Index("ix_shifts_campaign_start", "campaign_id", "start_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=ShiftStatus.SCHEDULED, nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(nullable=False)
    end_at: Mapped[datetime] = mapped_column(nullable=False)
    max_volunteers: Mapped[int] = mapped_column(Integer, nullable=False)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    turf_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("turfs.id"), nullable=True
    )
    phone_bank_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("phone_bank_sessions.id"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class ShiftVolunteer(Base):
    """A volunteer's signup for a shift with check-in/out and hours tracking."""

    __tablename__ = "shift_volunteers"
    __table_args__ = (
        Index("ix_shift_volunteers_shift_id", "shift_id"),
        UniqueConstraint("shift_id", "volunteer_id", name="uq_shift_volunteer"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    shift_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shifts.id"), nullable=False)
    volunteer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("volunteers.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default=SignupStatus.SIGNED_UP, nullable=False
    )
    waitlist_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    check_in_at: Mapped[datetime | None] = mapped_column(nullable=True)
    check_out_at: Mapped[datetime | None] = mapped_column(nullable=True)
    adjusted_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    adjustment_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adjusted_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    adjusted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    signed_up_at: Mapped[datetime] = mapped_column(server_default=func.now())
