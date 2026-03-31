"""Voter list request and response schemas."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BeforeValidator, field_serializer

from app.schemas.common import BaseSchema


def _coerce_json_string(v: Any) -> Any:
    """Accept either a dict or a JSON-encoded string for filter_query.

    The frontend serialises filter_query with JSON.stringify; accept both forms.
    """
    if isinstance(v, str):
        return json.loads(v)
    return v


JsonDict = Annotated[dict | None, BeforeValidator(_coerce_json_string)]


class VoterListCreate(BaseSchema):
    """Create a new voter list."""

    name: str
    description: str | None = None
    list_type: str  # "static" or "dynamic"
    filter_query: JsonDict = None


class VoterListUpdate(BaseSchema):
    """Update an existing voter list."""

    name: str | None = None
    description: str | None = None
    filter_query: JsonDict = None


class VoterListResponse(BaseSchema):
    """Voter list returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    description: str | None = None
    list_type: str
    # Stored as JSONB dict; serialised back to a JSON string so the frontend
    # (which uses JSON.parse / JSON.stringify throughout) sees a consistent type.
    filter_query: dict | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("filter_query")
    def serialize_filter_query(self, v: dict | None) -> str | None:
        """Return filter_query as a JSON string for frontend compatibility."""
        if v is None:
            return None
        return json.dumps(v)
