"""Pydantic schemas for canvassing (door-knock) operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models.walk_list import DoorKnockResult, WalkListEntryStatus
from app.schemas.common import BaseSchema
from app.schemas.survey import ResponseCreate


class VoterDetail(BaseSchema):
    """Voter demographic and address details for enriched walk list entries."""

    first_name: str | None = None
    last_name: str | None = None
    party: str | None = None
    age: int | None = None
    propensity_combined: int | None = None
    registration_line1: str | None = None
    registration_line2: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None


class PriorInteractions(BaseSchema):
    """Summary of prior door-knock interactions for a voter."""

    attempt_count: int = 0
    last_result: str | None = None
    last_date: str | None = None  # ISO date string


class EnrichedEntryResponse(BaseSchema):
    """Walk list entry enriched with voter details and interaction history."""

    id: uuid.UUID
    voter_id: uuid.UUID
    household_key: str | None = None
    sequence: int
    status: WalkListEntryStatus
    latitude: float | None = None
    longitude: float | None = None
    voter: VoterDetail
    prior_interactions: PriorInteractions


class DoorKnockCreate(BaseSchema):
    """Schema for recording a door knock attempt."""

    voter_id: uuid.UUID
    walk_list_entry_id: uuid.UUID
    result_code: DoorKnockResult
    notes: str | None = None
    survey_responses: list[ResponseCreate] | None = None
    survey_complete: bool = True


class DoorKnockResponse(BaseSchema):
    """Schema for door knock API responses."""

    interaction_id: uuid.UUID
    voter_id: uuid.UUID
    result_code: DoorKnockResult
    walk_list_id: uuid.UUID
    notes: str | None = None
    attempt_number: int
    created_at: datetime


DoorKnockCreate.model_rebuild()
