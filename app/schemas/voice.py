"""Pydantic schemas for browser voice calling."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema
from app.schemas.org import TwilioBudgetSummary


class VoiceTokenResponse(BaseSchema):
    """Access token for Twilio Client SDK (browser dialer)."""

    token: str


class CallRecordRead(BaseSchema):
    """Read-only representation of a call record."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    twilio_sid: str | None = None
    voter_id: uuid.UUID | None = None
    caller_user_id: str
    phone_bank_session_id: uuid.UUID | None = None
    direction: str
    from_number: str
    to_number: str
    status: str
    duration_seconds: int | None = None
    price_cents: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    created_at: datetime


class CallingHoursCheck(BaseSchema):
    """Result of a calling-hours compliance check."""

    allowed: bool
    message: str | None = None
    window_start: str | None = None
    window_end: str | None = None
    current_time: str | None = None


class DNCCheckResult(BaseSchema):
    """Result of a DNC pre-call check."""

    blocked: bool
    message: str | None = None


class VoiceCapabilityResponse(BaseSchema):
    """Whether browser voice calling is available for this org."""

    browser_call_available: bool
    reason: str | None = None
    budget: TwilioBudgetSummary | None = None
