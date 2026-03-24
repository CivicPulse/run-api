"""Pydantic schemas for turf CRUD operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.models.turf import TurfStatus
from app.schemas.common import BaseSchema, PaginatedResponse


class TurfCreate(BaseSchema):
    """Schema for creating a new turf."""

    name: str
    description: str | None = None
    boundary: dict[str, Any]
    """GeoJSON Polygon: {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}"""


class TurfUpdate(BaseSchema):
    """Schema for updating an existing turf."""

    name: str | None = None
    description: str | None = None
    status: TurfStatus | None = None
    boundary: dict[str, Any] | None = None


class TurfResponse(BaseSchema):
    """Schema for turf API responses."""

    id: uuid.UUID
    name: str
    description: str | None = None
    status: TurfStatus
    boundary: dict[str, Any]
    voter_count: int = 0
    created_by: str
    created_at: datetime
    updated_at: datetime


class VoterLocationResponse(BaseSchema):
    """Lightweight voter location for map markers."""

    id: uuid.UUID
    latitude: float | None
    longitude: float | None
    name: str


class OverlappingTurfResponse(BaseSchema):
    """Turf that overlaps a given boundary."""

    id: uuid.UUID
    name: str
    boundary: dict[str, Any]


class TurfListResponse(PaginatedResponse[TurfResponse]):
    """Paginated list of turfs."""

    pass
