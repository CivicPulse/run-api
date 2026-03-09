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
