"""Voter tag request and response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.common import BaseSchema


class VoterTagCreate(BaseModel):
    """Create a new voter tag."""

    name: str


class VoterTagResponse(BaseSchema):
    """Voter tag returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str


class VoterTagAssign(BaseModel):
    """Assign a tag to a voter."""

    tag_id: uuid.UUID


class VoterListMemberUpdate(BaseModel):
    """Add or remove voters from a static list."""

    voter_ids: list[uuid.UUID]
