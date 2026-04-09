"""Schemas for campaign signup-link management and public resolution."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class SignupLinkCreate(BaseSchema):
    """Request payload for creating a signup link."""

    label: str = Field(min_length=1, max_length=255)


class SignupLinkResponse(BaseSchema):
    """Admin-facing signup-link payload."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    label: str
    token: uuid.UUID
    status: str
    expires_at: datetime | None = None
    disabled_at: datetime | None = None
    regenerated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PublicSignupLinkResponse(BaseSchema):
    """Public-safe signup-link metadata used by the landing page."""

    token: uuid.UUID
    status: str
    campaign_id: uuid.UUID | None = None
    campaign_name: str | None = None
    organization_name: str | None = None
    candidate_name: str | None = None
    jurisdiction_name: str | None = None
    election_date: date | None = None
    link_label: str | None = None
