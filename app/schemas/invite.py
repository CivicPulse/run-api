"""Invite request/response Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.core.security import CampaignRole
from app.schemas.common import BaseSchema


class InviteCreate(BaseSchema):
    """Schema for creating a campaign invite."""

    email: EmailStr
    role: str = Field(description="Role to grant: viewer, volunteer, manager, admin")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Validate role is a valid CampaignRole name and not 'owner'."""
        v_upper = v.upper()
        if v_upper == "OWNER":
            msg = "Cannot invite with owner role"
            raise ValueError(msg)
        try:
            CampaignRole[v_upper]
        except KeyError:
            valid = "viewer, volunteer, manager, admin"
            msg = f"Invalid role: {v}. Must be one of: {valid}"
            raise ValueError(msg) from None
        return v.lower()


class InviteResponse(BaseSchema):
    """Schema for invite response."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    email: str
    role: str
    token: uuid.UUID | None = None
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class InviteAcceptResponse(BaseSchema):
    """Schema for invite acceptance response."""

    message: str
    campaign_id: uuid.UUID
    role: str
