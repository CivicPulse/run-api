"""Pydantic schemas for SMS inbox and send flows."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import BaseSchema
from app.schemas.org import TwilioBudgetSummary
from app.schemas.voter_contact import PhoneValidationSummary


class SMSEligibilityResponse(BaseSchema):
    """Normalized send-eligibility result for a voter phone."""

    allowed: bool
    reason_code: str | None = None
    reason_detail: str | None = None
    voter_phone_id: uuid.UUID | None = None
    normalized_phone_number: str | None = None
    opt_out_status: str = "active"
    validation: PhoneValidationSummary | None = None


class SMSMessageRead(BaseSchema):
    """Message row rendered in a thread view."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    direction: str
    body: str
    message_type: str
    provider_status: str
    twilio_message_sid: str | None = None
    from_number: str
    to_number: str
    error_code: str | None = None
    error_message: str | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    created_at: datetime


class SMSConversationRead(BaseSchema):
    """Summary row rendered in the inbox list."""

    id: uuid.UUID
    voter_id: uuid.UUID
    voter_phone_id: uuid.UUID | None = None
    org_phone_number_id: uuid.UUID
    normalized_to_number: str
    last_message_preview: str | None = None
    last_message_direction: str
    last_message_status: str
    last_message_at: datetime | None = None
    unread_count: int
    opt_out_status: str
    opted_out_at: datetime | None = None


class SMSConversationDetail(BaseSchema):
    """Detailed thread payload returned to the UI."""

    conversation: SMSConversationRead
    messages: list[SMSMessageRead]
    eligibility: SMSEligibilityResponse
    budget: TwilioBudgetSummary | None = None


class SMSComposeRequest(BaseSchema):
    """Single-recipient SMS compose request."""

    voter_id: uuid.UUID
    voter_phone_id: uuid.UUID
    body: str


class SMSBulkSendRequest(BaseSchema):
    """Bulk-send request payload."""

    voter_phone_ids: list[uuid.UUID]
    body: str


class SMSBulkSendResponse(BaseSchema):
    """Queued bulk-send response."""

    job_id: str
    queued_count: int
    blocked_count: int = 0
    budget: TwilioBudgetSummary | None = None


class SMSSendResponse(BaseSchema):
    """Single-send response payload."""

    conversation: SMSConversationRead
    message: SMSMessageRead
    eligibility: SMSEligibilityResponse
    budget: TwilioBudgetSummary | None = None


class SMSStatusUpdate(BaseSchema):
    """Delivery status update payload normalized for service usage."""

    twilio_message_sid: str
    provider_status: str
    error_code: str | None = None
    error_message: str | None = None
