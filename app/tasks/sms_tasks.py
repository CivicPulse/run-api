"""Background tasks for SMS bulk sending."""

from __future__ import annotations

import uuid

from loguru import logger

from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.campaign import Campaign
from app.models.organization import Organization
from app.services.sms import SMSService
from app.tasks.procrastinate_app import procrastinate_app


@procrastinate_app.task(name="send_bulk_sms_batch", queue="communications")
async def send_bulk_sms_batch(
    campaign_id: str,
    org_id: str,
    voter_id: str,
    voter_phone_id: str,
    body: str,
    sender_user_id: str | None = None,
) -> None:
    """Send one queued SMS item.

    Plan 92 batches fan out into one task per recipient to keep retries small.
    """
    sms_service = SMSService()

    async with async_session_factory() as session:
        await set_campaign_context(session, campaign_id)
        org = await session.get(Organization, uuid.UUID(org_id))
        campaign = await session.get(Campaign, uuid.UUID(campaign_id))
        if org is None or campaign is None:
            logger.warning(
                "Skipping SMS task for missing org/campaign: org={} campaign={}",
                org_id,
                campaign_id,
            )
            return

        await sms_service.send_single_sms(
            session,
            org,
            campaign_id=campaign.id,
            voter_id=uuid.UUID(voter_id),
            voter_phone_id=uuid.UUID(voter_phone_id),
            body=body,
            sent_by_user_id=sender_user_id,
        )
        await session.commit()
