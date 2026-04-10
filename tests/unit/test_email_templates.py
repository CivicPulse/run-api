from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services.email_templates import EmailTemplateError, render_template
from app.services.email_types import InviteTemplateData, TransactionalTemplateKey


def test_render_invite_template_returns_html_and_text():
    rendered = render_template(
        TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE,
        invite=InviteTemplateData(
            inviter_name="Alex Admin",
            organization_name="River County Democrats",
            campaign_name="Alex for Mayor",
            role_label="manager",
            accept_url="https://app.example.test/invites/abc",
            expires_at=datetime(2026, 4, 15, 16, 30, tzinfo=UTC),
        ),
    )

    assert rendered.subject == "Alex Admin invited you to join Alex for Mayor"
    assert "Accept your invite" in rendered.html_body
    assert "https://app.example.test/invites/abc" in rendered.text_body
    assert "River County Democrats" in rendered.html_body
    assert "Invite expires: 2026-04-15 16:30 UTC" in rendered.text_body


def test_render_invite_template_requires_data():
    with pytest.raises(EmailTemplateError, match="Invite template data is required"):
        render_template(TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE)
