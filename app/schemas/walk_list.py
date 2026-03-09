"""Pydantic schemas for walk list operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models.walk_list import WalkListEntryStatus
from app.schemas.common import BaseSchema, PaginatedResponse


class WalkListCreate(BaseSchema):
    """Schema for creating a new walk list."""

    turf_id: uuid.UUID
    voter_list_id: uuid.UUID | None = None
    script_id: uuid.UUID | None = None
    name: str


class WalkListResponse(BaseSchema):
    """Schema for walk list API responses."""

    id: uuid.UUID
    name: str
    turf_id: uuid.UUID
    voter_list_id: uuid.UUID | None = None
    script_id: uuid.UUID | None = None
    total_entries: int
    visited_entries: int
    created_by: str
    created_at: datetime


class WalkListEntryResponse(BaseSchema):
    """Schema for individual walk list entry responses."""

    id: uuid.UUID
    voter_id: uuid.UUID
    household_key: str | None = None
    sequence: int
    status: WalkListEntryStatus


class CanvasserAssignment(BaseSchema):
    """Schema for assigning a canvasser to a walk list."""

    user_id: str


class WalkListDetailResponse(WalkListResponse):
    """Walk list with entries included."""

    entries: list[WalkListEntryResponse] = []


class WalkListListResponse(PaginatedResponse[WalkListResponse]):
    """Paginated list of walk lists."""

    pass
