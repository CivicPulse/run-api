"""Transactional email helpers for native-auth flows.

These helpers are intentionally lightweight: they build a tiny plain-text +
HTML body for the verify-email and password-reset flows, send via the
configured transactional provider, and fall back to a `[DEV-EMAIL]` log line
when the provider is `disabled`. The fastapi-users hooks call these and must
never crash on failure, so callers wrap invocations in a broad try/except.
"""

from __future__ import annotations

from loguru import logger

from app.core.config import settings
from app.services.email_provider import (
    EmailProviderError,
    get_transactional_email_provider,
)
from app.services.email_types import (
    EmailTenantContext,
    RenderedEmail,
    TransactionalEmail,
    TransactionalTemplateKey,
)

# We reuse the one existing template key for now; the actual rendering happens
# inline below. When Step 4 / Step 5 introduce dedicated auth templates we can
# add members to ``TransactionalTemplateKey`` and render via
# ``app.services.email_templates``.
_FALLBACK_TEMPLATE = TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE


def _render_verify(display_name: str, verify_url: str) -> RenderedEmail:
    greeting = f"Hi {display_name}," if display_name else "Hi,"
    text_body = (
        f"{greeting}\n\n"
        "Please verify your email address by visiting the link below. "
        "This link expires in 24 hours.\n\n"
        f"{verify_url}\n\n"
        "If you did not create a CivicPulse Run account, you can ignore this "
        "message.\n"
    )
    html_body = (
        f"<p>{greeting}</p>"
        "<p>Please verify your email address by clicking the link below. "
        "This link expires in 24 hours.</p>"
        f'<p><a href="{verify_url}">{verify_url}</a></p>'
        "<p>If you did not create a CivicPulse Run account, you can ignore "
        "this message.</p>"
    )
    return RenderedEmail(
        subject="Verify your CivicPulse Run email",
        html_body=html_body,
        text_body=text_body,
    )


def _render_reset(display_name: str, reset_url: str) -> RenderedEmail:
    greeting = f"Hi {display_name}," if display_name else "Hi,"
    text_body = (
        f"{greeting}\n\n"
        "We received a request to reset your CivicPulse Run password. "
        "If that was you, use the link below to choose a new password. "
        "This link expires in 1 hour.\n\n"
        f"{reset_url}\n\n"
        "If you did not request a password reset, you can ignore this "
        "message; your password will not change.\n"
    )
    html_body = (
        f"<p>{greeting}</p>"
        "<p>We received a request to reset your CivicPulse Run password. "
        "If that was you, click the link below to choose a new password. "
        "This link expires in 1 hour.</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        "<p>If you did not request a password reset, you can ignore this "
        "message; your password will not change.</p>"
    )
    return RenderedEmail(
        subject="Reset your CivicPulse Run password",
        html_body=html_body,
        text_body=text_body,
    )


def _provider_disabled() -> bool:
    return settings.email_provider.strip().lower() in {"", "disabled", "none"}


async def _send(
    *,
    to_email: str,
    rendered: RenderedEmail,
    tag: str,
    dev_log_url: str,
) -> None:
    """Send a transactional email, or log the link in dev."""
    if _provider_disabled():
        logger.info(
            "[DEV-EMAIL] {tag} to={to} subject={subject} url={url}",
            tag=tag,
            to=to_email,
            subject=rendered.subject,
            url=dev_log_url,
        )
        return
    provider = get_transactional_email_provider()
    email = TransactionalEmail(
        template=_FALLBACK_TEMPLATE,
        tenant=EmailTenantContext(),
        to_email=to_email,
        rendered=rendered,
        tags=(tag,),
        metadata={},
    )
    try:
        await provider.send(email)
    except EmailProviderError as exc:
        logger.error(
            "native-auth: email provider failed tag={} to={} err={}",
            tag,
            to_email,
            exc,
        )


async def send_verify_email(
    *, to_email: str, display_name: str, verify_url: str
) -> None:
    """Send the verify-email message (or log the link when email is disabled)."""
    await _send(
        to_email=to_email,
        rendered=_render_verify(display_name, verify_url),
        tag="auth-verify",
        dev_log_url=verify_url,
    )


async def send_password_reset_email(
    *, to_email: str, display_name: str, reset_url: str
) -> None:
    """Send the password-reset message (or log the link when email is disabled)."""
    await _send(
        to_email=to_email,
        rendered=_render_reset(display_name, reset_url),
        tag="auth-reset",
        dev_log_url=reset_url,
    )
