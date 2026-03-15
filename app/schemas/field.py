"""Pydantic schemas for the field/me volunteer endpoint."""

from __future__ import annotations

import uuid

from app.schemas.common import BaseSchema


class CanvassingAssignment(BaseSchema):
    """Active canvassing assignment for a volunteer."""

    walk_list_id: uuid.UUID
    name: str
    total: int
    completed: int


class PhoneBankingAssignment(BaseSchema):
    """Active phone banking assignment for a volunteer."""

    session_id: uuid.UUID
    name: str
    total: int
    completed: int


class FieldMeResponse(BaseSchema):
    """Aggregated response for the volunteer landing page."""

    volunteer_name: str
    campaign_name: str
    canvassing: CanvassingAssignment | None = None
    phone_banking: PhoneBankingAssignment | None = None
