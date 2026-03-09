"""User request/response Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import BaseSchema


class UserResponse(BaseSchema):
    """Schema for user response."""

    id: str
    display_name: str
    email: str
    created_at: datetime


class UserCampaignResponse(BaseSchema):
    """Schema for a user's campaign membership."""

    campaign_id: str
    campaign_name: str
    role: str
