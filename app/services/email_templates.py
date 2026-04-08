"""Code-owned transactional email templates."""

from __future__ import annotations

from datetime import UTC

from app.services.email_types import (
    InviteTemplateData,
    RenderedEmail,
    TransactionalTemplateKey,
)


class EmailTemplateError(RuntimeError):
    """Raised when a transactional email template cannot be rendered."""


def render_invite_email(data: InviteTemplateData) -> RenderedEmail:
    """Render the campaign member invite email in HTML and text."""
    expiry_text = data.expires_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    subject = f"{data.inviter_name} invited you to join {data.campaign_name}"
    html_body = (
        "<html><body>"
        f"<p>{data.inviter_name} invited you to join "
        f"<strong>{data.campaign_name}</strong> "
        f"for {data.organization_name} as a <strong>{data.role_label}</strong>.</p>"
        f"<p>This invite expires on {expiry_text}.</p>"
        f'<p><a href="{data.accept_url}">Accept your invite</a></p>'
        "</body></html>"
    )
    text_body = (
        f"{data.inviter_name} invited you to join {data.campaign_name} for "
        f"{data.organization_name} as a {data.role_label}.\n\n"
        f"Accept your invite: {data.accept_url}\n"
        f"Invite expires: {expiry_text}"
    )
    return RenderedEmail(subject=subject, html_body=html_body, text_body=text_body)


def render_template(
    template: TransactionalTemplateKey,
    *,
    invite: InviteTemplateData | None = None,
) -> RenderedEmail:
    """Render a supported transactional template."""
    if template is TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE:
        if invite is None:
            raise EmailTemplateError("Invite template data is required")
        return render_invite_email(invite)
    raise EmailTemplateError(f"Unsupported transactional template: {template}")
