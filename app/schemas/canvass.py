"""Pydantic schemas for canvassing (door-knock) operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models.walk_list import DoorKnockResult
from app.schemas.common import BaseSchema


class DoorKnockCreate(BaseSchema):
    """Schema for recording a door knock attempt."""

    voter_id: uuid.UUID
    walk_list_entry_id: uuid.UUID
    result_code: DoorKnockResult
    notes: str | None = None


class DoorKnockResponse(BaseSchema):
    """Schema for door knock API responses."""

    interaction_id: uuid.UUID
    voter_id: uuid.UUID
    result_code: DoorKnockResult
    walk_list_id: uuid.UUID
    notes: str | None = None
    attempt_number: int
    created_at: datetime
