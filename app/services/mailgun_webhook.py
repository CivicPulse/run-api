"""Mailgun webhook verification and status mapping."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, Request, status

from app.core.config import settings

MAILGUN_EVENT_STATUS = {
    "accepted": "submitted",
    "delivered": "delivered",
    "failed": "failed",
    "rejected": "suppressed",
    "complained": "complained",
    "unsubscribed": "suppressed",
    "permanent_fail": "bounced",
    "temporary_fail": "failed",
}


@dataclass(slots=True)
class MailgunWebhookEvent:
    """Normalized Mailgun event payload."""

    provider_message_id: str
    provider_event_id: str
    event_type: str
    status: str
    timestamp: datetime
    reason: str | None = None


def verify_mailgun_signature(
    *,
    signing_key: str,
    timestamp: str,
    token: str,
    signature: str,
) -> None:
    """Validate the Mailgun HMAC signature."""
    expected = hmac.new(
        signing_key.encode("utf-8"),
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Mailgun signature",
        )


async def parse_mailgun_event(request: Request) -> MailgunWebhookEvent:
    """Parse and verify one Mailgun webhook payload.

    Modern (post-2018) Mailgun webhooks send a JSON body that nests
    `timestamp`, `token`, and `signature` under a `signature` object alongside
    a parsed `event-data` object. Legacy webhooks send those fields top-level
    in form-encoded form. Both formats are accepted.
    """
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        body = await request.json()
        sig_obj = body.get("signature") or {}
        timestamp = str(sig_obj.get("timestamp") or "")
        token = str(sig_obj.get("token") or "")
        signature = str(sig_obj.get("signature") or "")
        event_data = body.get("event-data")
    else:
        form = await request.form()
        timestamp = str(form.get("timestamp") or "")
        token = str(form.get("token") or "")
        signature = str(form.get("signature") or "")
        raw_event = form.get("event-data")
        event_data = json.loads(str(raw_event)) if raw_event is not None else None

    if not timestamp or not token or not signature or event_data is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incomplete Mailgun webhook payload",
        )

    signing_key = (
        settings.mailgun_webhook_signing_key.get_secret_value()
        if settings.mailgun_webhook_signing_key
        else ""
    )
    if not signing_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mailgun webhook signing key is not configured",
        )

    verify_mailgun_signature(
        signing_key=signing_key,
        timestamp=timestamp,
        token=token,
        signature=signature,
    )

    if not isinstance(event_data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mailgun webhook event-data must be an object",
        )
    event_type = str(event_data.get("event") or "").strip()
    provider_event_id = str(event_data.get("id") or "").strip()
    message = event_data.get("message") or {}
    provider_message_id = (
        str(message.get("headers", {}).get("message-id") or "").strip().strip("<>")
    )
    reason = (
        event_data.get("severity")
        or event_data.get("reason")
        or event_data.get("delivery-status", {}).get("description")
    )

    if not event_type or not provider_event_id or not provider_message_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mailgun webhook event is missing correlation fields",
        )

    status_value = MAILGUN_EVENT_STATUS.get(event_type, event_type)
    event_timestamp = datetime.fromtimestamp(float(timestamp), tz=UTC)

    return MailgunWebhookEvent(
        provider_message_id=provider_message_id,
        provider_event_id=provider_event_id,
        event_type=event_type,
        status=status_value,
        timestamp=event_timestamp,
        reason=str(reason) if reason else None,
    )
