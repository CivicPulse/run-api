"""Pydantic schemas for call list operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class CallListCreate(BaseSchema):
    """Schema for creating a new call list."""

    name: str
    voter_list_id: uuid.UUID | None = None
    script_id: uuid.UUID | None = None
    max_attempts: int = 3
    claim_timeout_minutes: int = 30
    cooldown_minutes: int = 60


class CallListResponse(BaseSchema):
    """Schema for call list API responses."""

    id: uuid.UUID
    name: str
    status: str
    total_entries: int
    completed_entries: int
    max_attempts: int
    claim_timeout_minutes: int
    cooldown_minutes: int
    voter_list_id: uuid.UUID | None = None
    script_id: uuid.UUID | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime


class CallListEntryResponse(BaseSchema):
    """Schema for individual call list entry responses."""

    id: uuid.UUID
    voter_id: uuid.UUID
    priority_score: int
    phone_numbers: list
    status: str
    attempt_count: int
    claimed_by: str | None = None
    claimed_at: datetime | None = None
    last_attempt_at: datetime | None = None
    phone_attempts: dict | None = None


class ClaimEntriesRequest(BaseSchema):
    """Schema for claiming a batch of entries for calling."""

    batch_size: int = 5


class CallListSummaryResponse(BaseSchema):
    """Compact call list summary for list views."""

    id: uuid.UUID
    name: str
    status: str
    total_entries: int
    completed_entries: int
