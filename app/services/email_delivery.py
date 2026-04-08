"""Transactional email attempt audit and summary projection helpers."""

from __future__ import annotations

from datetime import datetime

from app.core.time import utcnow
from app.models.email_delivery_attempt import EmailDeliveryAttempt
from app.models.invite import Invite

STATUS_RANK = {
    "queued": 10,
    "submitted": 20,
    "delivered": 30,
    "failed": 40,
    "bounced": 50,
    "complained": 60,
    "suppressed": 70,
    "skipped": 80,
}


def _normalize_timestamp(value: datetime | None) -> datetime:
    return value or utcnow()


def should_promote_status(current: str | None, incoming: str) -> bool:
    """Return True when the new status is at least as authoritative."""
    current_rank = STATUS_RANK.get(current or "", -1)
    incoming_rank = STATUS_RANK.get(incoming, current_rank)
    return incoming_rank >= current_rank


def create_attempt(
    *,
    invite: Invite,
    organization_id,
    template_key: str,
    provider: str = "mailgun",
) -> EmailDeliveryAttempt:
    """Create a new durable audit row for one invite send attempt."""
    return EmailDeliveryAttempt(
        invite_id=invite.id,
        organization_id=organization_id,
        campaign_id=invite.campaign_id,
        template_key=template_key,
        provider=provider,
        recipient_email=invite.email,
        status=invite.email_delivery_status,
        submitted_at=invite.email_delivery_sent_at,
        last_event_at=invite.email_delivery_last_event_at,
    )


def apply_attempt_projection(
    *,
    invite: Invite,
    attempt: EmailDeliveryAttempt,
    status: str,
    event_at: datetime | None = None,
    failure_reason: str | None = None,
    provider_message_id: str | None = None,
    provider_event_key: str | None = None,
) -> None:
    """Project attempt status onto both the audit row and invite summary."""
    effective_at = _normalize_timestamp(event_at)

    attempt.status = status
    attempt.last_event_at = effective_at
    attempt.failure_reason = failure_reason
    if provider_message_id:
        attempt.provider_message_id = provider_message_id
    if provider_event_key:
        attempt.provider_event_key = provider_event_key
    if status == "submitted" and attempt.submitted_at is None:
        attempt.submitted_at = effective_at

    if should_promote_status(invite.email_delivery_status, status):
        invite.email_delivery_status = status
        invite.email_delivery_last_event_at = effective_at
        invite.email_delivery_error = failure_reason
        if status == "submitted":
            invite.email_delivery_sent_at = effective_at
        if provider_message_id:
            invite.email_delivery_provider_message_id = provider_message_id
