"""Pydantic schemas for Twilio webhook infrastructure."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class WebhookEventRead(BaseModel):
    """Read schema for webhook event records (debugging/admin)."""

    id: uuid.UUID
    provider_sid: str
    event_type: str
    org_id: uuid.UUID
    payload_summary: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
