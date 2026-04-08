"""Twilio webhook ingress routes for voice and SMS callbacks."""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_real_ip, limiter
from app.db.session import get_db
from app.models.organization import Organization
from app.services.sms import SMSService
from app.services.twilio_webhook import check_idempotency, verify_twilio_signature
from app.services.voice import VoiceService

router = APIRouter()

_voice_service = VoiceService()
_sms_service = SMSService()

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
    cached_form = getattr(request.state, "twilio_form", None)
    params = cached_form if isinstance(cached_form, dict) else dict(await request.form())

    call_sid = params.get("CallSid", "")
    call_status = params.get("CallStatus", "")
    call_duration_str = params.get("CallDuration")
    call_price_raw = params.get("CallPrice") or params.get("Price")

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

    price_cents: int | None = None
    if call_price_raw not in {None, ""}:
        with contextlib.suppress(ValueError, TypeError):
            price_cents = abs(int(round(float(call_price_raw) * 100)))

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
        price_cents=price_cents,
    )
    await _voice_service._budget_service.reconcile_event(
        db,
        provider_sid=call_sid,
        event_type="voice.call",
        provider_status=call_status,
        cost_cents=price_cents,
        metadata_json={"duration_seconds": duration_seconds},
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
    db: AsyncSession = Depends(get_db),
) -> str:
    """Receive inbound SMS messages from Twilio.

    Returns empty 200 to acknowledge receipt.
    """
    cached_form = getattr(request.state, "twilio_form", None)
    params = cached_form if isinstance(cached_form, dict) else dict(await request.form())

    message_sid = params.get("MessageSid", "")
    body = params.get("Body", "")
    from_number = params.get("From", "")
    to_number = params.get("To", "")

    if not message_sid or not from_number or not to_number:
        return ""

    is_duplicate = await check_idempotency(
        db,
        provider_sid=message_sid,
        event_type="sms.inbound",
        org_id=org.id,
        payload_summary={"from": from_number, "to": to_number},
    )
    if is_duplicate:
        return ""

    await _sms_service.process_inbound_message(
        db,
        org,
        from_number=from_number,
        to_number=to_number,
        body=body,
        message_sid=message_sid,
    )

    await db.commit()
    return ""


@router.post(
    "/sms/status",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def sms_status_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Receive outbound SMS delivery status from Twilio.

    Returns empty 200 to acknowledge receipt.
    """
    cached_form = getattr(request.state, "twilio_form", None)
    params = cached_form if isinstance(cached_form, dict) else dict(await request.form())

    message_sid = params.get("MessageSid", "")
    message_status = params.get("MessageStatus", "")
    if not message_sid or not message_status:
        return ""

    is_duplicate = await check_idempotency(
        db,
        provider_sid=message_sid,
        event_type=f"sms.status.{message_status}",
        org_id=org.id,
        payload_summary={"status": message_status},
    )
    if is_duplicate:
        return ""

    await _sms_service.update_delivery_status(
        db,
        twilio_message_sid=message_sid,
        provider_status=message_status,
        error_code=params.get("ErrorCode"),
        error_message=params.get("ErrorMessage"),
        delivered_at=datetime.now(UTC) if message_status == "delivered" else None,
    )
    price_raw = params.get("Price")
    price_cents: int | None = None
    if price_raw not in {None, ""}:
        with contextlib.suppress(ValueError, TypeError):
            price_cents = abs(int(round(float(price_raw) * 100)))
    await _sms_service._budget_service.reconcile_event(
        db,
        provider_sid=message_sid,
        event_type="sms.message",
        provider_status=message_status,
        cost_cents=price_cents,
    )
    await db.commit()
    return ""
