"""Voter interaction request and response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class InteractionCreateRequest(BaseSchema):
    """Create a manual interaction event (note only via API)."""

    type: str = "note"
    payload: dict = Field(default_factory=dict)


class InteractionUpdateRequest(BaseSchema):
    """Update a note interaction's payload (notes only)."""

    payload: dict = Field(...)


class InteractionResponse(BaseSchema):
    """Interaction event returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    voter_id: uuid.UUID
    type: str
    payload: dict
    created_by: str
    created_by_name: str | None = None
    created_at: datetime
