"""Pydantic schemas for phone bank session operations."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import field_validator

from app.schemas.common import BaseSchema


def _to_naive_utc(value: datetime | None) -> datetime | None:
    """Strip timezone from a datetime, converting to UTC first if needed."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


class PhoneBankSessionCreate(BaseSchema):
    """Schema for creating a new phone bank session."""

    name: str
    call_list_id: uuid.UUID
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None

    @field_validator("scheduled_start", "scheduled_end", mode="after")
    @classmethod
    def normalize_datetime(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class PhoneBankSessionUpdate(BaseSchema):
    """Schema for updating a phone bank session."""

    name: str | None = None
    status: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None

    @field_validator("scheduled_start", "scheduled_end", mode="after")
    @classmethod
    def normalize_datetime(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class PhoneBankSessionResponse(BaseSchema):
    """Schema for phone bank session API responses."""

    id: uuid.UUID
    name: str
    status: str
    call_list_id: uuid.UUID
    call_list_name: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    caller_count: int = 0


class SessionCallerResponse(BaseSchema):
    """Schema for session caller assignment responses."""

    id: uuid.UUID
    session_id: uuid.UUID
    user_id: str
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    created_at: datetime


class CallRecordCreate(BaseSchema):
    """Schema for recording a call outcome."""

    call_list_entry_id: uuid.UUID
    result_code: str
    phone_number_used: str
    call_started_at: datetime
    call_ended_at: datetime
    notes: str | None = None
    survey_responses: list | None = None
    survey_complete: bool = True


class CallRecordResponse(BaseSchema):
    """Schema for call record API responses."""

    id: uuid.UUID
    result_code: str
    phone_number_used: str
    call_started_at: datetime
    call_ended_at: datetime
    notes: str | None = None
    interaction_id: uuid.UUID


class CallerProgressItem(BaseSchema):
    """Per-caller progress stats within a session."""

    user_id: str
    calls_made: int
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None


class SessionProgressResponse(BaseSchema):
    """Supervisor view of session progress."""

    session_id: uuid.UUID
    total_entries: int
    completed: int
    in_progress: int
    available: int
    callers: list[CallerProgressItem] = []


class AssignCallerRequest(BaseSchema):
    """Schema for assigning a caller to a phone bank session."""

    user_id: str


class ReassignRequest(BaseSchema):
    """Schema for reassigning an entry to a different caller."""

    new_caller_id: str
