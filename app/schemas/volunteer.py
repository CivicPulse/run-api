"""Pydantic schemas for volunteer CRUD, tags, and availability."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import field_validator

from app.schemas.common import BaseSchema


class VolunteerCreate(BaseSchema):
    """Request schema for creating a volunteer."""

    first_name: str
    last_name: str
    phone: str | None = None
    email: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    notes: str | None = None
    skills: list[str] = []


class VolunteerUpdate(BaseSchema):
    """Request schema for updating a volunteer (all fields optional)."""

    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    notes: str | None = None
    skills: list[str] | None = None
    status: str | None = None


class VolunteerResponse(BaseSchema):
    """Response schema for a volunteer."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    user_id: str | None
    first_name: str
    last_name: str
    phone: str | None
    email: str | None
    street: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    notes: str | None
    status: str
    skills: list[str]
    created_by: str
    created_at: datetime
    updated_at: datetime


class AvailabilityCreate(BaseSchema):
    """Request schema for creating a volunteer availability window."""

    start_at: datetime
    end_at: datetime

    @field_validator("start_at", "end_at", mode="after")
    @classmethod
    def normalize_datetime(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(UTC).replace(tzinfo=None)
        return v


class AvailabilityResponse(BaseSchema):
    """Response schema for a volunteer availability window."""

    id: uuid.UUID
    volunteer_id: uuid.UUID
    start_at: datetime
    end_at: datetime


class VolunteerDetailResponse(VolunteerResponse):
    """Detailed volunteer response including tags and availability."""

    tags: list[str] = []
    availability: list[AvailabilityResponse] = []


class VolunteerStatusUpdate(BaseSchema):
    """Request schema for updating a volunteer's status."""

    status: str


class VolunteerTagCreate(BaseSchema):
    """Request schema for creating a campaign-scoped volunteer tag."""

    name: str


class VolunteerTagUpdate(BaseSchema):
    """Request schema for updating a campaign-scoped volunteer tag."""

    name: str


class VolunteerTagResponse(BaseSchema):
    """Response schema for a volunteer tag."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    created_at: datetime
