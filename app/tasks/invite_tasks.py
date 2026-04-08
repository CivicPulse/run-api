"""Background tasks for invite email delivery."""

from __future__ import annotations

import uuid

from loguru import logger

from app.core.time import utcnow
from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.campaign import Campaign
from app.models.invite import Invite
from app.models.organization import Organization
from app.models.user import User
from app.services.email_delivery import apply_attempt_projection, create_attempt
from app.services.email_provider import EmailProviderError
from app.services.email_types import TransactionalTemplateKey
from app.services.invite_email import submit_campaign_invite_email
from app.tasks.procrastinate_app import procrastinate_app


@procrastinate_app.task(name="send_campaign_invite_email", queue="communications")
async def send_campaign_invite_email(
    *,
    invite_id: str,
    campaign_id: str,
) -> None:
    """Send one campaign invite email after the invite row is durable."""
    async with async_session_factory() as session:
        await set_campaign_context(session, campaign_id)

        invite = await session.get(Invite, uuid.UUID(invite_id))
        campaign = await session.get(Campaign, uuid.UUID(campaign_id))
        if invite is None or campaign is None:
            logger.warning(
                "Skipping invite email task for missing invite/campaign: "
                "invite={} campaign={}",
                invite_id,
                campaign_id,
            )
            return

        if invite.accepted_at is not None or invite.revoked_at is not None:
            invite.email_delivery_status = "skipped"
            invite.email_delivery_error = "Invite is no longer deliverable"
            invite.email_delivery_last_event_at = utcnow()
            await session.commit()
            return

        if invite.expires_at <= utcnow():
            invite.email_delivery_status = "skipped"
            invite.email_delivery_error = "Invite expired before delivery"
            invite.email_delivery_last_event_at = utcnow()
            await session.commit()
            return

        if invite.email_delivery_sent_at is not None:
            return

        organization = None
        if campaign.organization_id is not None:
            organization = await session.get(Organization, campaign.organization_id)
        inviter = await session.get(User, invite.created_by)
        attempt = create_attempt(
            invite=invite,
            organization_id=campaign.organization_id,
            template_key=TransactionalTemplateKey.CAMPAIGN_MEMBER_INVITE.value,
        )
        session.add(attempt)
        await session.flush()

        try:
            message_id = await submit_campaign_invite_email(
                invite=invite,
                campaign=campaign,
                organization=organization,
                inviter=inviter,
            )
        except EmailProviderError as exc:
            apply_attempt_projection(
                invite=invite,
                attempt=attempt,
                status="failed",
                event_at=utcnow(),
                failure_reason=str(exc),
            )
            await session.commit()
            raise

        apply_attempt_projection(
            invite=invite,
            attempt=attempt,
            status="submitted",
            event_at=utcnow(),
            provider_message_id=message_id,
        )
        await session.commit()
