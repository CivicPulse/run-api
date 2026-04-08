"""Voter contact request and response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema

# --- Phone ---


class PhoneCreateRequest(BaseSchema):
    """Create a phone contact for a voter."""

    value: str
    type: str = "home"
    is_primary: bool = False
    source: str = "manual"


class PhoneResponse(BaseSchema):
    """Phone contact returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    voter_id: uuid.UUID
    value: str
    type: str
    is_primary: bool
    source: str
    created_at: datetime
    updated_at: datetime
    validation: "PhoneValidationSummary | None" = None


class PhoneValidationSummary(BaseSchema):
    """Compact cached lookup summary reused by contacts and SMS surfaces."""

    normalized_phone_number: str
    status: str
    is_valid: bool | None = None
    carrier_name: str | None = None
    line_type: str | None = None
    sms_capable: bool | None = None
    validated_at: datetime | None = None
    is_stale: bool = False
    reason_code: str | None = None
    reason_detail: str | None = None


# --- Email ---


class EmailCreateRequest(BaseSchema):
    """Create an email contact for a voter."""

    value: str
    type: str = "home"
    is_primary: bool = False
    source: str = "manual"


class EmailResponse(BaseSchema):
    """Email contact returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    voter_id: uuid.UUID
    value: str
    type: str
    is_primary: bool
    source: str
    created_at: datetime
    updated_at: datetime


# --- Address ---


class AddressCreateRequest(BaseSchema):
    """Create an address contact for a voter."""

    address_line1: str
    address_line2: str | None = None
    city: str
    state: str
    zip_code: str
    type: str = "home"
    is_primary: bool = False
    source: str = "manual"


class AddressResponse(BaseSchema):
    """Address contact returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    voter_id: uuid.UUID
    address_line1: str
    address_line2: str | None = None
    city: str
    state: str
    zip_code: str
    type: str
    is_primary: bool
    source: str
    created_at: datetime
    updated_at: datetime
