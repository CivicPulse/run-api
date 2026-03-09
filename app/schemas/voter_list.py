"""Voter list request and response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class VoterListCreate(BaseSchema):
    """Create a new voter list."""

    name: str
    description: str | None = None
    list_type: str  # "static" or "dynamic"
    filter_query: dict | None = None


class VoterListUpdate(BaseSchema):
    """Update an existing voter list."""

    name: str | None = None
    description: str | None = None
    filter_query: dict | None = None


class VoterListResponse(BaseSchema):
    """Voter list returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    description: str | None = None
    list_type: str
    filter_query: dict | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
