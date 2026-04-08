"""Mailgun webhook ingress routes for transactional email reconciliation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_real_ip, limiter
from app.db.session import get_db
from app.models.email_delivery_attempt import EmailDeliveryAttempt
from app.models.invite import Invite
from app.services.email_delivery import apply_attempt_projection
from app.services.mailgun_webhook import parse_mailgun_event
from app.services.twilio_webhook import check_idempotency

router = APIRouter()


@router.post("/events", response_class=PlainTextResponse)
@limiter.limit("120/minute", key_func=get_real_ip)
async def mailgun_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> str:
    """Receive authenticated Mailgun delivery events for invite email."""
    event = await parse_mailgun_event(request)

    attempt = await db.scalar(
        select(EmailDeliveryAttempt).where(
            EmailDeliveryAttempt.provider_message_id == event.provider_message_id
        )
    )
    if attempt is None or attempt.organization_id is None:
        return ""

    is_duplicate = await check_idempotency(
        db,
        provider_sid=event.provider_event_id,
        event_type=f"mailgun.status.{event.event_type}",
        org_id=attempt.organization_id,
        payload_summary={"message_id": event.provider_message_id},
    )
    if is_duplicate:
        return ""

    invite = await db.get(Invite, attempt.invite_id)
    if invite is None:
        return ""

    apply_attempt_projection(
        invite=invite,
        attempt=attempt,
        status=event.status,
        event_at=event.timestamp,
        failure_reason=event.reason,
        provider_message_id=event.provider_message_id,
        provider_event_key=event.provider_event_id,
    )
    await db.commit()
    return ""
