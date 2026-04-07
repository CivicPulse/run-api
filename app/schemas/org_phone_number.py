"""Request/response schemas for org phone number inventory."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class OrgPhoneNumberResponse(BaseSchema):
    """Response schema for a registered phone number."""

    id: uuid.UUID
    phone_number: str
    friendly_name: str | None = None
    phone_type: str
    voice_capable: bool
    sms_capable: bool
    mms_capable: bool
    twilio_sid: str
    capabilities_synced_at: datetime | None = None
    created_at: datetime
    is_default_voice: bool = False
    is_default_sms: bool = False


class RegisterPhoneNumberRequest(BaseSchema):
    """Request to register a BYO Twilio phone number."""

    phone_number: str = Field(
        ..., pattern=r"^\+[1-9]\d{1,14}$", description="E.164 format"
    )


class SetDefaultRequest(BaseSchema):
    """Request to set a phone number as default for a capability."""

    capability: str = Field(..., pattern="^(voice|sms)$")
