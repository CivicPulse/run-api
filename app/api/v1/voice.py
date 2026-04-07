"""Voice calling API endpoints — token, TwiML, capability, compliance.

Campaign-scoped routes require authentication. The TwiML handler is
Twilio-facing and uses webhook signature validation instead.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.twiml.voice_response import VoiceResponse

from app.api.deps import get_campaign_db
from app.core.config import settings
from app.core.rate_limit import get_real_ip, get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.models.campaign import Campaign
from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization
from app.schemas.voice import (
    CallingHoursCheck,
    DNCCheckResult,
    VoiceCapabilityResponse,
    VoiceTokenResponse,
)
from app.services.twilio_config import TwilioConfigError
from app.services.voice import VoiceService

# ---------------------------------------------------------------------------
# Service singleton
# ---------------------------------------------------------------------------

_voice_service = VoiceService()

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class DNCCheckRequest(BaseModel):
    """Request body for DNC pre-call check."""

    phone_number: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_campaign_org(
    db: AsyncSession,
    campaign_id: uuid.UUID,
) -> tuple[Campaign, Organization]:
    """Load campaign and its parent organization.

    Raises:
        HTTPException 404: Campaign or organization not found.
    """
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    if campaign.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign has no organization",
        )
    org = await db.get(Organization, campaign.organization_id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return campaign, org


async def _resolve_twiml_context(
    db: AsyncSession,
    campaign_id: uuid.UUID,
) -> tuple[Campaign, Organization]:
    """Resolve campaign + org for TwiML handler from CampaignId param."""
    return await _resolve_campaign_org(db, campaign_id)


async def _get_caller_id(
    db: AsyncSession,
    org: Organization,
) -> str | None:
    """Get the org's default voice number for caller ID.

    Falls back to the first voice-capable number if no default set.
    Returns None if no voice-capable numbers exist.
    """
    if org.default_voice_number_id:
        phone = await db.get(OrgPhoneNumber, org.default_voice_number_id)
        if phone:
            return phone.phone_number

    # Fallback: first voice-capable number
    stmt = (
        select(OrgPhoneNumber)
        .where(
            OrgPhoneNumber.org_id == org.id,
            OrgPhoneNumber.voice_capable.is_(True),
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    phone = result.scalar_one_or_none()
    return phone.phone_number if phone else None


# ---------------------------------------------------------------------------
# Campaign-scoped routes (require user auth)
# ---------------------------------------------------------------------------

campaign_router = APIRouter()


@campaign_router.post(
    "/{campaign_id}/voice/token",
    response_model=VoiceTokenResponse,
)
@limiter.limit("10/minute", key_func=get_user_or_ip_key)
async def generate_voice_token(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Generate a Twilio Access Token for the browser dialer.

    Any campaign member (volunteer+) can request a token.
    Returns 404 when the org has no voice configuration.
    """
    _campaign, org = await _resolve_campaign_org(db, campaign_id)

    try:
        token = _voice_service.generate_voice_token(org, user.id)
    except TwilioConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice calling not configured for this organization",
        ) from exc

    return VoiceTokenResponse(token=token)


@campaign_router.get(
    "/{campaign_id}/voice/capability",
    response_model=VoiceCapabilityResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def check_voice_capability(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Check if browser voice calling is available for this org."""
    _campaign, org = await _resolve_campaign_org(db, campaign_id)
    return await _voice_service.check_voice_capability(db, org)


@campaign_router.get(
    "/{campaign_id}/voice/calling-hours",
    response_model=CallingHoursCheck,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def check_calling_hours(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Check current calling hours status for this campaign."""
    campaign, _org = await _resolve_campaign_org(db, campaign_id)
    return _voice_service.check_calling_hours(campaign)


@campaign_router.post(
    "/{campaign_id}/voice/dnc-check",
    response_model=DNCCheckResult,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def check_dnc(
    request: Request,
    campaign_id: uuid.UUID,
    body: DNCCheckRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Check if a phone number is on the DNC list."""
    return await _voice_service.check_dnc(db, campaign_id, body.phone_number)


# ---------------------------------------------------------------------------
# Twilio-facing TwiML route (webhook auth, not user auth)
# ---------------------------------------------------------------------------

twiml_router = APIRouter()


@twiml_router.post("/twiml", response_class=PlainTextResponse)
@limiter.limit("60/minute", key_func=get_real_ip)
async def twiml_voice_handler(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """TwiML voice URL handler — returns Dial XML for outbound calls.

    Called by Twilio when a browser device connects a call. Validates
    the destination number against DNC and calling hours before dialing.

    The CampaignId is passed as a connect parameter from the frontend
    Twilio Device (T-91-09 mitigation).
    """
    form_data = await request.form()
    params = dict(form_data)

    to_number = params.get("To")
    call_sid = params.get("CallSid", "")
    from_identity = params.get("From", "")
    campaign_id_str = params.get("CampaignId")

    response = VoiceResponse()

    # No destination number — hangup
    if not to_number:
        response.say("No destination number provided.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # No campaign context — hangup
    if not campaign_id_str:
        response.say("Missing campaign context.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # Parse campaign ID
    try:
        campaign_id = uuid.UUID(campaign_id_str)
    except (ValueError, TypeError):
        response.say("Invalid campaign context.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # Resolve campaign + org
    try:
        campaign, org = await _resolve_twiml_context(db, campaign_id)
    except HTTPException:
        response.say("Campaign not found.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # Defense-in-depth: calling hours check (T-91-05)
    hours_check = _voice_service.check_calling_hours(campaign)
    if not hours_check.allowed:
        response.say(hours_check.message or "Calling is not permitted at this time.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # Defense-in-depth: DNC check (T-91-05)
    dnc_check = await _voice_service.check_dnc(db, campaign_id, to_number)
    if dnc_check.blocked:
        response.say(dnc_check.message or "This number cannot be called.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")

    # Get caller ID from org's voice numbers
    caller_id = await _get_caller_id(db, org)

    # Extract user identity from the From field (client:user_id_format)
    caller_user_id = from_identity.replace("client:", "").replace("_", "-")

    # Build status callback URL
    status_callback_url = (
        f"{settings.webhook_base_url.rstrip('/')}/api/v1/webhooks/twilio/voice/status"
    )

    # Build Dial TwiML
    dial = response.dial(
        caller_id=caller_id,
    )
    dial.number(
        to_number,
        status_callback=status_callback_url,
        status_callback_event="initiated ringing answered completed",
    )

    # Create initial call record
    try:
        await _voice_service.create_call_record(
            db,
            campaign_id=campaign_id,
            twilio_sid=call_sid,
            caller_user_id=caller_user_id,
            from_number=caller_id or "",
            to_number=to_number,
            status="initiated",
        )
        await db.commit()
    except Exception:
        # Don't block the call if record creation fails
        await db.rollback()

    return PlainTextResponse(str(response), media_type="text/xml")
