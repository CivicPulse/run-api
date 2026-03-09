"""Voter interaction request and response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class InteractionCreateRequest(BaseSchema):
    """Create a manual interaction event (note only via API)."""

    type: str = "note"
    payload: dict = {}


class InteractionResponse(BaseSchema):
    """Interaction event returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    voter_id: uuid.UUID
    type: str
    payload: dict
    created_by: str
    created_at: datetime
