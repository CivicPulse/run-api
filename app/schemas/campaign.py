"""Campaign request/response Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field

from app.models.campaign import CampaignStatus, CampaignType
from app.schemas.common import BaseSchema


class CampaignCreate(BaseSchema):
    """Schema for creating a campaign."""

    name: str = Field(min_length=3, max_length=100)
    type: CampaignType
    organization_id: uuid.UUID
    jurisdiction_fips: str | None = None
    jurisdiction_name: str | None = None
    election_date: date | None = None
    candidate_name: str | None = None
    party_affiliation: str | None = None


class CampaignUpdate(BaseSchema):
    """Schema for updating a campaign (all fields optional)."""

    name: str | None = Field(None, min_length=3, max_length=100)
    type: CampaignType | None = None
    jurisdiction_fips: str | None = None
    jurisdiction_name: str | None = None
    election_date: date | None = None
    candidate_name: str | None = None
    party_affiliation: str | None = None
    status: CampaignStatus | None = None


class CampaignResponse(BaseSchema):
    """Schema for campaign response."""

    id: uuid.UUID
    zitadel_org_id: str
    name: str
    type: CampaignType
    jurisdiction_fips: str | None = None
    jurisdiction_name: str | None = None
    election_date: date | None = None
    status: CampaignStatus
    candidate_name: str | None = None
    party_affiliation: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
