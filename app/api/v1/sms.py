"""Campaign-scoped SMS API routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.models.campaign import Campaign
from app.models.organization import Organization
from app.schemas.sms import (
    SMSBulkSendRequest,
    SMSBulkSendResponse,
    SMSComposeRequest,
    SMSConversationDetail,
    SMSConversationRead,
    SMSMessageRead,
    SMSSendResponse,
)
from app.services.communication_budget import CommunicationBudgetService
from app.services.sms import SMSService, SMSServiceError
from app.tasks.sms_tasks import send_bulk_sms_batch

campaign_router = APIRouter()

_sms_service = SMSService()
_budget_service = CommunicationBudgetService()


async def _resolve_campaign_org(
    db: AsyncSession,
    campaign_id: uuid.UUID,
) -> tuple[Campaign, Organization]:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    org = await db.get(Organization, campaign.organization_id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return campaign, org


@campaign_router.post(
    "/{campaign_id}/sms/send",
    response_model=SMSSendResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def send_sms(
    request: Request,
    campaign_id: uuid.UUID,
    body: SMSComposeRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Send one SMS from the campaign context."""
    _campaign, org = await _resolve_campaign_org(db, campaign_id)
    gate = await _budget_service.evaluate_gate(db, org)
    if not gate.allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "reason_code": gate.reason_code,
                "reason_detail": gate.reason_detail,
                "budget": gate.summary.model_dump(mode="json"),
            },
        )
    eligibility = await _sms_service.check_eligibility(
        db,
        campaign_id=campaign_id,
        voter_phone_id=body.voter_phone_id,
        org_id=org.id,
    )
    if not eligibility.allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "reason_code": eligibility.reason_code,
                "reason_detail": eligibility.reason_detail,
            },
        )

    try:
        conversation, message, eligibility = await _sms_service.send_single_sms(
            db,
            org,
            campaign_id=campaign_id,
            voter_id=body.voter_id,
            voter_phone_id=body.voter_phone_id,
            body=body.body,
            sent_by_user_id=user.id,
        )
    except SMSServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    await db.commit()
    return SMSSendResponse(
        conversation=SMSConversationRead.model_validate(conversation),
        message=SMSMessageRead.model_validate(message),
        eligibility=eligibility,
        budget=await _budget_service.get_budget_summary(db, org),
    )


@campaign_router.post(
    "/{campaign_id}/sms/bulk-send",
    response_model=SMSBulkSendResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("10/minute", key_func=get_user_or_ip_key)
async def bulk_send_sms(
    request: Request,
    campaign_id: uuid.UUID,
    body: SMSBulkSendRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Queue bulk SMS fan-out via Procrastinate."""
    _campaign, org = await _resolve_campaign_org(db, campaign_id)
    gate = await _budget_service.evaluate_gate(db, org)
    if not gate.allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "reason_code": gate.reason_code,
                "reason_detail": gate.reason_detail,
                "budget": gate.summary.model_dump(mode="json"),
            },
        )

    queued_count = 0
    blocked_count = 0
    job_id = f"sms-bulk-{campaign_id}-{uuid.uuid4()}"

    for voter_phone_id in body.voter_phone_ids:
        eligibility = await _sms_service.check_eligibility(
            db,
            campaign_id=campaign_id,
            voter_phone_id=voter_phone_id,
            org_id=org.id,
        )
        if not eligibility.allowed:
            blocked_count += 1
            continue

        phone = await _sms_service.get_voter_phone(
            db,
            campaign_id=campaign_id,
            voter_phone_id=voter_phone_id,
        )
        if phone is None:
            blocked_count += 1
            continue

        await send_bulk_sms_batch.defer_async(
            campaign_id=str(campaign_id),
            org_id=str(org.id),
            voter_id=str(phone.voter_id),
            voter_phone_id=str(voter_phone_id),
            body=body.body,
            sender_user_id=user.id,
        )
        queued_count += 1

    return SMSBulkSendResponse(
        job_id=job_id,
        queued_count=queued_count,
        blocked_count=blocked_count,
        budget=await _budget_service.get_budget_summary(db, org),
    )


@campaign_router.get(
    "/{campaign_id}/sms/conversations",
    response_model=list[SMSConversationRead],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_sms_conversations(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List campaign inbox conversations."""
    rows = await _sms_service.list_conversations(db, campaign_id=campaign_id)
    return [SMSConversationRead.model_validate(row) for row in rows]


@campaign_router.get(
    "/{campaign_id}/sms/conversations/{conversation_id}",
    response_model=SMSConversationDetail,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_sms_conversation(
    request: Request,
    campaign_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Load one inbox conversation with thread detail."""
    _campaign, org = await _resolve_campaign_org(db, campaign_id)
    try:
        conversation, messages, eligibility = (
            await _sms_service.get_conversation_detail(
                db,
                campaign_id=campaign_id,
                conversation_id=conversation_id,
            )
        )
    except SMSServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return SMSConversationDetail(
        conversation=SMSConversationRead.model_validate(conversation),
        messages=[SMSMessageRead.model_validate(row) for row in messages],
        eligibility=eligibility,
        budget=await _budget_service.get_budget_summary(db, org),
    )


@campaign_router.post(
    "/{campaign_id}/sms/conversations/{conversation_id}/read",
    response_model=SMSConversationRead,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def mark_sms_conversation_read(
    request: Request,
    campaign_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Clear unread count when the operator opens a thread."""
    try:
        conversation = await _sms_service.mark_conversation_read(
            db,
            campaign_id=campaign_id,
            conversation_id=conversation_id,
        )
    except SMSServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    await db.commit()
    return SMSConversationRead.model_validate(conversation)
