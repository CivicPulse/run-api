"""Transactional email provider abstraction and Mailgun implementation."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.services.email_types import TransactionalEmail

MAILGUN_US_BASE_URL = "https://api.mailgun.net/v3"
MAILGUN_EU_BASE_URL = "https://api.eu.mailgun.net/v3"


class EmailProviderError(RuntimeError):
    """Raised when transactional email provider operations fail."""


@dataclass(slots=True)
class MailgunSettings:
    """Resolved Mailgun configuration for app-owned email."""

    api_key: str
    domain: str
    sender_name: str
    sender_address: str
    base_url: str

    @property
    def ready(self) -> bool:
        return bool(self.api_key and self.domain and self.sender_address)

    def safe_metadata(self) -> dict[str, str | bool]:
        """Return non-secret operational metadata."""
        return {
            "provider": "mailgun",
            "domain": self.domain,
            "sender_name": self.sender_name,
            "sender_address": self.sender_address,
            "ready": self.ready,
        }


def resolve_mailgun_settings() -> MailgunSettings:
    """Resolve Mailgun configuration from app settings."""
    api_key = (
        settings.mailgun_api_key.get_secret_value() if settings.mailgun_api_key else ""
    )
    region = settings.mailgun_region.strip().lower()
    if settings.mailgun_base_url.strip():
        base_url = settings.mailgun_base_url.strip().rstrip("/")
    elif region == "eu":
        base_url = MAILGUN_EU_BASE_URL
    else:
        base_url = MAILGUN_US_BASE_URL
    return MailgunSettings(
        api_key=api_key,
        domain=settings.mailgun_domain.strip(),
        sender_name=settings.email_sender_name.strip(),
        sender_address=settings.email_sender_address.strip(),
        base_url=base_url,
    )


class TransactionalEmailProvider:
    """Provider interface for app-owned transactional email."""

    async def send(self, email: TransactionalEmail) -> str:
        """Send the transactional email and return the provider message id."""
        raise NotImplementedError


class DisabledEmailProvider(TransactionalEmailProvider):
    """Disabled-safe provider used when email is not configured."""

    async def send(self, email: TransactionalEmail) -> str:  # pragma: no cover
        raise EmailProviderError("Transactional email provider is disabled")


class MailgunEmailProvider(TransactionalEmailProvider):
    """Mailgun adapter for app-owned transactional email."""

    def __init__(self, config: MailgunSettings) -> None:
        if not config.ready:
            raise EmailProviderError("Mailgun is not fully configured")
        self._config = config

    def build_payload(self, email: TransactionalEmail) -> dict[str, str]:
        """Build the Mailgun form payload for a single-recipient email."""
        if "," in email.to_email:
            raise EmailProviderError("Transactional email must target one recipient")
        payload = {
            "from": _format_from(self._config.sender_name, self._config.sender_address),
            "to": email.to_email,
            "subject": email.rendered.subject,
            "text": email.rendered.text_body,
            "html": email.rendered.html_body,
        }
        for idx, tag in enumerate(email.tags):
            payload[f"o:tag[{idx}]"] = tag
        for key, value in email.metadata.items():
            payload[f"v:{key}"] = value
        return payload

    async def send(self, email: TransactionalEmail) -> str:
        """Send a transactional email through Mailgun."""
        payload = self.build_payload(email)
        url = f"{self._config.base_url}/{self._config.domain}/messages"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    url,
                    data=payload,
                    auth=("api", self._config.api_key),
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise EmailProviderError(
                f"Mailgun request failed with status {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            raise EmailProviderError("Mailgun request failed") from exc

        message_id = response.json().get("id")
        if not isinstance(message_id, str) or not message_id:
            raise EmailProviderError("Mailgun response did not include a message id")
        return message_id


def get_transactional_email_provider() -> TransactionalEmailProvider:
    """Resolve the configured transactional email provider."""
    provider = settings.email_provider.strip().lower()
    if provider in {"", "disabled", "none"}:
        return DisabledEmailProvider()
    if provider == "mailgun":
        return MailgunEmailProvider(resolve_mailgun_settings())
    raise EmailProviderError(f"Unsupported email provider: {provider}")


def _format_from(sender_name: str, sender_address: str) -> str:
    """Format a safe RFC-2822-style sender header."""
    if sender_name:
        return f"{sender_name} <{sender_address}>"
    return sender_address
