"""Member management request/response Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.core.security import CampaignRole
from app.schemas.common import BaseSchema


class MemberResponse(BaseSchema):
    """Schema for member response."""

    user_id: str
    display_name: str
    email: str
    role: str
    synced_at: datetime


class RoleUpdate(BaseSchema):
    """Schema for updating a member's role."""

    role: str = Field(description="New role: viewer, volunteer, manager, admin")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Validate role is a valid CampaignRole name."""
        v_upper = v.upper()
        try:
            CampaignRole[v_upper]
        except KeyError:
            valid = "viewer, volunteer, manager, admin, owner"
            msg = f"Invalid role: {v}. Must be one of: {valid}"
            raise ValueError(msg) from None
        return v.lower()


class OwnershipTransfer(BaseSchema):
    """Schema for transferring campaign ownership."""

    new_owner_id: str
