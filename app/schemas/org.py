"""Organization management request/response Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class OrgResponse(BaseSchema):
    """Schema for organization details response."""

    id: uuid.UUID
    name: str
    zitadel_org_id: str
    created_at: datetime


class OrgMemberResponse(BaseSchema):
    """Schema for org-level member response."""

    user_id: str
    display_name: str | None = None
    email: str | None = None
    role: str
    joined_at: datetime | None = None
    created_at: datetime


class OrgCampaignResponse(BaseSchema):
    """Schema for campaign in org listing."""

    id: uuid.UUID
    name: str
    slug: str | None = None
    campaign_type: str | None = None
    election_date: datetime | None = None
    created_at: datetime
    member_count: int = 0
