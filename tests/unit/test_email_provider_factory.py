from __future__ import annotations

from uuid import uuid4

from pydantic import SecretStr

from app.core.config import settings
from app.services.email_provider import (
    DisabledEmailProvider,
    MailgunEmailProvider,
    get_transactional_email_provider,
    resolve_mailgun_settings,
)
from app.services.email_types import (
    EmailTenantContext,
    RenderedEmail,
    TransactionalEmail,
    TransactionalTemplateKey,
)


def test_provider_defaults_to_disabled():
    original = settings.email_provider
    try:
        settings.email_provider = "disabled"
        provider = get_transactional_email_provider()
    finally:
        settings.email_provider = original

    assert isinstance(provider, DisabledEmailProvider)


def test_mailgun_settings_resolve_safe_metadata_without_secret():
    originals = {
        "email_provider": settings.email_provider,
        "mailgun_domain": settings.mailgun_domain,
        "mailgun_region": settings.mailgun_region,
        "mailgun_base_url": settings.mailgun_base_url,
        "mailgun_api_key": settings.mailgun_api_key,
        "email_sender_name": settings.email_sender_name,
        "email_sender_address": settings.email_sender_address,
    }
    try:
        settings.email_provider = "mailgun"
        settings.mailgun_domain = "mg.example.test"
        settings.mailgun_region = "eu"
        settings.mailgun_base_url = ""
        settings.mailgun_api_key = SecretStr("key-secret-value")
        settings.email_sender_name = "CivicPulse Run"
        settings.email_sender_address = "no-reply@example.test"

        config = resolve_mailgun_settings()
        provider = get_transactional_email_provider()
    finally:
        for key, value in originals.items():
            setattr(settings, key, value)

    assert config.base_url == "https://api.eu.mailgun.net/v3"
    assert config.safe_metadata() == {
        "provider": "mailgun",
        "domain": "mg.example.test",
        "sender_name": "CivicPulse Run",
        "sender_address": "no-reply@example.test",
        "ready": True,
    }
    assert isinstance(provider, MailgunEmailProvider)
    assert "secret-value" not in repr(config.safe_metadata())


def test_transactional_email_contract_stays_single_recipient_and_tenant_scoped():
    email = TransactionalEmail(
        template=TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE,
        tenant=EmailTenantContext(
            organization_id=uuid4(),
            campaign_id=uuid4(),
        ),
        to_email="invitee@example.test",
        rendered=RenderedEmail(
            subject="Join the campaign",
            html_body="<p>Hello</p>",
            text_body="Hello",
        ),
        metadata={"campaign_id": "abc123"},
    )

    assert email.to_email == "invitee@example.test"
    assert email.tenant.organization_id is not None
    assert email.tenant.campaign_id is not None
    assert email.metadata["campaign_id"] == "abc123"
