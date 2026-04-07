"""Organization management request/response Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, SecretStr

from app.schemas.common import BaseSchema


class TwilioOrgStatus(BaseSchema):
    """Redacted org-level Twilio configuration status."""

    account_sid: str | None = None
    account_sid_configured: bool = False
    account_sid_updated_at: datetime | None = None
    auth_token_configured: bool = False
    auth_token_hint: str | None = None
    auth_token_updated_at: datetime | None = None
    ready: bool = False


class OrgResponse(BaseSchema):
    """Schema for organization details response."""

    id: uuid.UUID
    name: str
    zitadel_org_id: str
    created_at: datetime
    twilio: TwilioOrgStatus | None = None


class TwilioOrgUpdate(BaseSchema):
    """Write-only partial Twilio configuration update."""

    account_sid: str | None = Field(None, min_length=1, max_length=64)
    auth_token: SecretStr | None = Field(None, repr=False)


class OrgUpdate(BaseSchema):
    """Schema for updating organization details."""

    name: str | None = Field(None, min_length=1, max_length=200)
    twilio: TwilioOrgUpdate | None = None


class CampaignRoleEntry(BaseSchema):
    """Per-campaign role for a member."""

    campaign_id: uuid.UUID
    campaign_name: str
    role: str


class OrgMemberResponse(BaseSchema):
    """Schema for org-level member response."""

    user_id: str
    display_name: str | None = None
    email: str | None = None
    role: str
    joined_at: datetime | None = None
    created_at: datetime
    campaign_roles: list[CampaignRoleEntry] = []


class OrgCampaignResponse(BaseSchema):
    """Schema for campaign in org listing."""

    id: uuid.UUID
    name: str
    slug: str | None = None
    campaign_type: str | None = None
    election_date: datetime | None = None
    created_at: datetime
    member_count: int = 0
    status: str | None = None


class UserOrgResponse(BaseSchema):
    """Schema for user's org listing (org switcher)."""

    id: uuid.UUID
    name: str
    zitadel_org_id: str
    role: str


class AddMemberToCampaignRequest(BaseSchema):
    """Schema for adding an org member to a campaign."""

    user_id: str
    role: str = "viewer"
