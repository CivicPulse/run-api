"""Unit tests for Mailgun webhook verification and invite reconciliation."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.core.config import settings
from app.core.rate_limit import limiter
from app.models.email_delivery_attempt import EmailDeliveryAttempt
from app.models.invite import Invite
from app.services.email_delivery import apply_attempt_projection

limiter.enabled = False


def _signature(timestamp: str, token: str, key: str) -> str:
    return hmac.new(
        key.encode("utf-8"),
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _mock_request(form_data: dict[str, str]) -> MagicMock:
    request = MagicMock()

    async def _form():
        return form_data

    request.form = _form
    return request


def _make_invite() -> Invite:
    return Invite(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        email="invitee@example.test",
        role="volunteer",
        token=uuid.uuid4(),
        created_by="user-1",
        email_delivery_status="submitted",
    )


def _make_attempt(invite: Invite) -> EmailDeliveryAttempt:
    return EmailDeliveryAttempt(
        id=uuid.uuid4(),
        invite_id=invite.id,
        organization_id=uuid.uuid4(),
        campaign_id=invite.campaign_id,
        template_key="campaign_member_invite",
        provider="mailgun",
        recipient_email=invite.email,
        status="submitted",
        provider_message_id="<message-1@example.test>",
    )


@pytest.mark.asyncio
async def test_parse_mailgun_event_verifies_signature_and_maps_status():
    from app.services.mailgun_webhook import parse_mailgun_event

    timestamp = "1710000000"
    token = "mailgun-token"
    key = "signing-secret"
    request = _mock_request(
        {
            "timestamp": timestamp,
            "token": token,
            "signature": _signature(timestamp, token, key),
            "event-data": json.dumps(
                {
                    "id": "evt-1",
                    "event": "delivered",
                    "message": {"headers": {"message-id": "<message-1@example.test>"}},
                }
            ),
        }
    )

    original = settings.mailgun_webhook_signing_key
    try:
        settings.mailgun_webhook_signing_key = SecretStr(key)
        event = await parse_mailgun_event(request)
    finally:
        settings.mailgun_webhook_signing_key = original

    assert event.provider_event_id == "evt-1"
    assert event.provider_message_id == "<message-1@example.test>"
    assert event.status == "delivered"


@pytest.mark.asyncio
async def test_parse_mailgun_event_rejects_bad_signature():
    from app.services.mailgun_webhook import parse_mailgun_event

    original = settings.mailgun_webhook_signing_key
    try:
        settings.mailgun_webhook_signing_key = SecretStr("signing-secret")
        request = _mock_request(
            {
                "timestamp": "1710000000",
                "token": "mailgun-token",
                "signature": "bad-signature",
                "event-data": json.dumps(
                    {
                        "id": "evt-1",
                        "event": "delivered",
                        "message": {
                            "headers": {
                                "message-id": "<message-1@example.test>"
                            }
                        },
                    }
                ),
            }
        )

        with pytest.raises(HTTPException) as exc_info:
            await parse_mailgun_event(request)
    finally:
        settings.mailgun_webhook_signing_key = original

    assert exc_info.value.status_code == 403


def test_apply_attempt_projection_is_monotonic():
    invite = _make_invite()
    attempt = _make_attempt(invite)

    apply_attempt_projection(
        invite=invite,
        attempt=attempt,
        status="delivered",
    )
    assert invite.email_delivery_status == "delivered"

    apply_attempt_projection(
        invite=invite,
        attempt=attempt,
        status="submitted",
    )
    assert invite.email_delivery_status == "delivered"


@pytest.mark.asyncio
async def test_mailgun_events_updates_attempt_and_invite():
    from app.api.v1.mailgun_webhooks import mailgun_events

    invite = _make_invite()
    attempt = _make_attempt(invite)
    timestamp = "1710000000"
    token = "mailgun-token"
    key = "signing-secret"
    request = _mock_request(
        {
            "timestamp": timestamp,
            "token": token,
            "signature": _signature(timestamp, token, key),
            "event-data": json.dumps(
                {
                    "id": "evt-1",
                    "event": "delivered",
                    "message": {"headers": {"message-id": attempt.provider_message_id}},
                }
            ),
        }
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=attempt)
    db.get = AsyncMock(return_value=invite)

    original = settings.mailgun_webhook_signing_key
    try:
        settings.mailgun_webhook_signing_key = SecretStr(key)
        with patch(
            "app.api.v1.mailgun_webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=False,
        ):
            result = await mailgun_events(request=request, db=db)
    finally:
        settings.mailgun_webhook_signing_key = original

    assert result == ""
    assert invite.email_delivery_status == "delivered"
    assert attempt.status == "delivered"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_mailgun_events_ignores_duplicate_delivery():
    from app.api.v1.mailgun_webhooks import mailgun_events
    from app.core.config import settings

    invite = _make_invite()
    attempt = _make_attempt(invite)
    timestamp = "1710000000"
    token = "mailgun-token"
    key = "signing-secret"
    request = _mock_request(
        {
            "timestamp": timestamp,
            "token": token,
            "signature": _signature(timestamp, token, key),
            "event-data": json.dumps(
                {
                    "id": "evt-1",
                    "event": "delivered",
                    "message": {"headers": {"message-id": attempt.provider_message_id}},
                }
            ),
        }
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=attempt)

    original = settings.mailgun_webhook_signing_key
    try:
        settings.mailgun_webhook_signing_key = SecretStr(key)
        with patch(
            "app.api.v1.mailgun_webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=True,
        ):
            result = await mailgun_events(request=request, db=db)
    finally:
        settings.mailgun_webhook_signing_key = original

    assert result == ""
    db.commit.assert_not_awaited()
