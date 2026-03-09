"""Pydantic schemas for Do Not Call list operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class DNCEntryCreate(BaseSchema):
    """Schema for adding a phone number to the Do Not Call list."""

    phone_number: str
    reason: str = "manual"


class DNCEntryResponse(BaseSchema):
    """Schema for DNC entry API responses."""

    id: uuid.UUID
    phone_number: str
    reason: str
    added_by: str
    added_at: datetime


class DNCCheckRequest(BaseSchema):
    """Schema for checking if a phone number is on the DNC list."""

    phone_number: str


class DNCCheckResponse(BaseSchema):
    """Schema for DNC check result."""

    is_dnc: bool
    entry: DNCEntryResponse | None = None


class DNCImportResponse(BaseSchema):
    """Schema for bulk DNC import results."""

    added: int
    skipped: int
    invalid: int
