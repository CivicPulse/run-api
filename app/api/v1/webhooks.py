"""Twilio webhook ingress routes.

Voice status callback updates call_records via VoiceService.
SMS endpoints are placeholders for Phase 92.
"""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_real_ip, limiter
from app.db.session import get_db
from app.models.organization import Organization
from app.services.twilio_webhook import check_idempotency, verify_twilio_signature
from app.services.voice import VoiceService

router = APIRouter()

_voice_service = VoiceService()

# Terminal Twilio call statuses that indicate the call has ended.
_TERMINAL_STATUSES = frozenset({"completed", "busy", "no-answer", "failed", "canceled"})


@router.post(
    "/voice/status",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def voice_status_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Receive voice call status updates from Twilio.

    Parses CallSid, CallStatus, CallDuration from form data and
    updates the corresponding call_record. Uses check_idempotency
    to skip duplicate webhook deliveries.

    Returns empty 200 to acknowledge receipt.
    """
    form_data = await request.form()
    params = dict(form_data)

    call_sid = params.get("CallSid", "")
    call_status = params.get("CallStatus", "")
    call_duration_str = params.get("CallDuration")

    if not call_sid or not call_status:
        return ""

    # Idempotency check via webhook_events table
    is_duplicate = await check_idempotency(
        db,
        provider_sid=call_sid,
        event_type=f"voice.status.{call_status}",
        org_id=org.id,
        payload_summary={"status": call_status},
    )
    if is_duplicate:
        return ""

    # Parse optional duration
    duration_seconds: int | None = None
    if call_duration_str:
        with contextlib.suppress(ValueError, TypeError):
            duration_seconds = int(call_duration_str)

    # Set ended_at for terminal statuses
    ended_at: datetime | None = None
    if call_status in _TERMINAL_STATUSES:
        ended_at = datetime.now(UTC)

    await _voice_service.update_call_record_from_webhook(
        db,
        twilio_sid=call_sid,
        status=call_status,
        duration_seconds=duration_seconds,
        ended_at=ended_at,
    )
    await db.commit()

    return ""


@router.post(
    "/sms/inbound",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def sms_inbound_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
) -> str:
    """Receive inbound SMS messages from Twilio.

    Phase 92 implements actual message processing.
    Returns empty 200 to acknowledge receipt.
    """
    return ""


@router.post(
    "/sms/status",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def sms_status_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
) -> str:
    """Receive outbound SMS delivery status from Twilio.

    Phase 92 implements actual delivery status processing.
    Returns empty 200 to acknowledge receipt.
    """
    return ""
