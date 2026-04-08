"""Transactional email orchestration for campaign invites."""

from __future__ import annotations

import uuid

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.invite import Invite
from app.models.organization import Organization
from app.models.user import User
from app.services.email_provider import get_transactional_email_provider
from app.services.email_templates import render_template
from app.services.email_types import (
    EmailTenantContext,
    InviteTemplateData,
    TransactionalEmail,
    TransactionalTemplateKey,
)


def build_invite_accept_url(token: uuid.UUID) -> str:
    """Build the public same-origin invite acceptance URL."""
    return f"{settings.app_base_url.rstrip('/')}/invites/{token}"


def build_campaign_invite_email(
    *,
    invite: Invite,
    campaign: Campaign,
    organization: Organization | None,
    inviter: User | None,
) -> TransactionalEmail:
    """Build a rendered transactional email for a campaign invite."""
    inviter_name = (
        inviter.display_name.strip()
        if inviter and inviter.display_name and inviter.display_name.strip()
        else "A CivicPulse teammate"
    )
    organization_name = (
        organization.name.strip()
        if organization and organization.name and organization.name.strip()
        else campaign.name
    )
    rendered = render_template(
        TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE,
        invite=InviteTemplateData(
            inviter_name=inviter_name,
            organization_name=organization_name,
            campaign_name=campaign.name,
            role_label=invite.role,
            accept_url=build_invite_accept_url(invite.token),
            expires_at=invite.expires_at,
        ),
    )
    return TransactionalEmail(
        template=TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE,
        tenant=EmailTenantContext(
            organization_id=campaign.organization_id,
            campaign_id=campaign.id,
        ),
        to_email=invite.email,
        rendered=rendered,
        tags=("campaign-invite", invite.role),
        metadata={
            "invite_id": str(invite.id),
            "campaign_id": str(campaign.id),
        },
    )


async def submit_campaign_invite_email(
    *,
    invite: Invite,
    campaign: Campaign,
    organization: Organization | None,
    inviter: User | None,
) -> str:
    """Render and submit a campaign invite email via the configured provider."""
    provider = get_transactional_email_provider()
    email = build_campaign_invite_email(
        invite=invite,
        campaign=campaign,
        organization=organization,
        inviter=inviter,
    )
    return await provider.send(email)
