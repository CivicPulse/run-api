from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from app.services.email_provider import (
    MAILGUN_EU_BASE_URL,
    EmailProviderError,
    MailgunEmailProvider,
    MailgunSettings,
)
from app.services.email_types import (
    EmailTenantContext,
    RenderedEmail,
    TransactionalEmail,
    TransactionalTemplateKey,
)


def _make_email(to_email: str = "invitee@example.test") -> TransactionalEmail:
    return TransactionalEmail(
        template=TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE,
        tenant=EmailTenantContext(
            organization_id=uuid4(),
            campaign_id=uuid4(),
        ),
        to_email=to_email,
        rendered=RenderedEmail(
            subject="Join the campaign",
            html_body="<p>Hello</p>",
            text_body="Hello",
        ),
        tags=("invite",),
        metadata={"campaign_id": "campaign-123"},
    )


def test_mailgun_payload_is_single_recipient_and_contains_expected_fields():
    provider = MailgunEmailProvider(
        MailgunSettings(
            api_key="key-test-secret",
            domain="mg.example.test",
            sender_name="CivicPulse Run",
            sender_address="no-reply@example.test",
            base_url=MAILGUN_EU_BASE_URL,
        )
    )

    payload = provider.build_payload(_make_email())

    assert payload["from"] == "CivicPulse Run <no-reply@example.test>"
    assert payload["to"] == "invitee@example.test"
    assert payload["subject"] == "Join the campaign"
    assert payload["text"] == "Hello"
    assert payload["html"] == "<p>Hello</p>"
    assert payload["o:tag[0]"] == "invite"
    assert payload["v:campaign_id"] == "campaign-123"


def test_mailgun_payload_rejects_multi_recipient_strings():
    provider = MailgunEmailProvider(
        MailgunSettings(
            api_key="key-test-secret",
            domain="mg.example.test",
            sender_name="CivicPulse Run",
            sender_address="no-reply@example.test",
            base_url=MAILGUN_EU_BASE_URL,
        )
    )

    with pytest.raises(EmailProviderError, match="one recipient"):
        provider.build_payload(_make_email("a@example.test,b@example.test"))


@pytest.mark.asyncio
async def test_mailgun_send_sanitizes_failure_details():
    provider = MailgunEmailProvider(
        MailgunSettings(
            api_key="key-super-secret",
            domain="mg.example.test",
            sender_name="CivicPulse Run",
            sender_address="no-reply@example.test",
            base_url=MAILGUN_EU_BASE_URL,
        )
    )
    response = MagicMock()
    response.status_code = 401
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401 error key-super-secret",
        request=httpx.Request(
            "POST", "https://api.eu.mailgun.net/v3/mg.example.test/messages"
        ),
        response=response,
    )
    mock_client = AsyncMock()
    mock_client.post.return_value = response
    mock_context = AsyncMock()
    mock_context.__aenter__.return_value = mock_client

    with (
        patch(
            "app.services.email_provider.httpx.AsyncClient",
            return_value=mock_context,
        ),
        pytest.raises(EmailProviderError) as exc,
    ):
        await provider.send(_make_email())

    assert "401" in str(exc.value)
    assert "key-super-secret" not in str(exc.value)


@pytest.mark.asyncio
async def test_mailgun_send_strips_angle_brackets_from_message_id():
    """Mailgun's send response wraps message-id in <...>; webhook events report
    it bare. Normalize on store so downstream lookups match."""
    provider = MailgunEmailProvider(
        MailgunSettings(
            api_key="key-test-secret",
            domain="mg.example.test",
            sender_name="CivicPulse Run",
            sender_address="no-reply@example.test",
            base_url=MAILGUN_EU_BASE_URL,
        )
    )
    response = MagicMock()
    response.status_code = 200
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "id": "<20260423021908.deadbeef@mg.example.test>",
        "message": "Queued. Thank you.",
    }
    mock_client = AsyncMock()
    mock_client.post.return_value = response
    mock_context = AsyncMock()
    mock_context.__aenter__.return_value = mock_client

    with patch(
        "app.services.email_provider.httpx.AsyncClient",
        return_value=mock_context,
    ):
        message_id = await provider.send(_make_email())

    assert message_id == "20260423021908.deadbeef@mg.example.test"
