"""Pydantic schemas for shift CRUD, signup, check-in, and hours."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import field_validator

from app.models.shift import ShiftType
from app.schemas.common import BaseSchema


def _to_naive_utc(value: datetime) -> datetime:
    """Strip timezone info from a datetime, converting to UTC first if needed.

    The database uses TIMESTAMP WITHOUT TIME ZONE columns.  asyncpg requires
    naive datetimes for those columns.  The frontend sends ISO 8601 strings
    with a UTC 'Z' suffix which Pydantic parses as timezone-aware.  This
    validator strips the tzinfo after converting to UTC so the value stored
    is the UTC instant without tzinfo metadata.
    """
    if value.tzinfo is not None:
        # Convert to UTC then strip tzinfo
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


class ShiftCreate(BaseSchema):
    """Request schema for creating a shift."""

    name: str
    description: str | None = None
    type: ShiftType
    start_at: datetime
    end_at: datetime
    max_volunteers: int

    @field_validator("start_at", "end_at", mode="after")
    @classmethod
    def normalize_datetime(cls, v: datetime) -> datetime:
        return _to_naive_utc(v)

    location_name: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    turf_id: uuid.UUID | None = None
    phone_bank_session_id: uuid.UUID | None = None


class ShiftUpdate(BaseSchema):
    """Request schema for updating a shift (all fields optional)."""

    name: str | None = None
    description: str | None = None
    type: ShiftType | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    max_volunteers: int | None = None
    location_name: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    turf_id: uuid.UUID | None = None
    phone_bank_session_id: uuid.UUID | None = None
    status: str | None = None

    @field_validator("start_at", "end_at", mode="after")
    @classmethod
    def normalize_datetime(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return v
        return _to_naive_utc(v)


class ShiftResponse(BaseSchema):
    """Response schema for a shift."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    description: str | None
    type: str
    status: str
    start_at: datetime
    end_at: datetime
    max_volunteers: int
    location_name: str | None
    street: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    latitude: float | None
    longitude: float | None
    turf_id: uuid.UUID | None
    phone_bank_session_id: uuid.UUID | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    signed_up_count: int = 0
    waitlist_count: int = 0


class ShiftSignupResponse(BaseSchema):
    """Response schema for a shift signup."""

    id: uuid.UUID
    shift_id: uuid.UUID
    volunteer_id: uuid.UUID
    status: str
    waitlist_position: int | None
    check_in_at: datetime | None
    check_out_at: datetime | None
    signed_up_at: datetime


class CheckInResponse(BaseSchema):
    """Response schema for check-in/out with computed hours."""

    id: uuid.UUID
    shift_id: uuid.UUID
    volunteer_id: uuid.UUID
    status: str
    check_in_at: datetime | None
    check_out_at: datetime | None
    adjusted_hours: float | None
    adjusted_by: str | None
    adjusted_at: datetime | None
    signed_up_at: datetime
    hours: float | None = None


class HoursAdjustment(BaseSchema):
    """Request schema for adjusting a volunteer's hours on a shift."""

    adjusted_hours: float
    adjustment_reason: str


class ShiftStatusUpdate(BaseSchema):
    """Request schema for updating a shift's status."""

    status: str


class ShiftSummaryItem(BaseSchema):
    """Summary of a single shift for hours aggregation."""

    shift_id: uuid.UUID
    shift_name: str
    hours: float
    check_in_at: datetime | None
    check_out_at: datetime | None


class VolunteerHoursSummary(BaseSchema):
    """Aggregate hours summary for a volunteer across shifts."""

    volunteer_id: uuid.UUID
    total_hours: float
    shifts_worked: int
    shifts: list[ShiftSummaryItem] = []
