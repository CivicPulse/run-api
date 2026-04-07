"""Twilio webhook ingress routes.

Placeholder endpoints for voice and SMS callbacks. Phase 91 and 92
implement the actual handler logic; this phase provides the secure
routing infrastructure they depend on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse

from app.core.rate_limit import get_real_ip, limiter
from app.models.organization import Organization
from app.services.twilio_webhook import verify_twilio_signature

router = APIRouter()


@router.post(
    "/voice/status",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def voice_status_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
) -> str:
    """Receive voice call status updates from Twilio.

    Phase 91 implements actual call status processing.
    Returns empty 200 to acknowledge receipt.
    """
    return ""


@router.post(
    "/sms/inbound",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def sms_inbound_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
) -> str:
    """Receive inbound SMS messages from Twilio.

    Phase 92 implements actual message processing.
    Returns empty 200 to acknowledge receipt.
    """
    return ""


@router.post(
    "/sms/status",
    response_class=PlainTextResponse,
)
@limiter.limit("120/minute", key_func=get_real_ip)
async def sms_status_callback(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
) -> str:
    """Receive outbound SMS delivery status from Twilio.

    Phase 92 implements actual delivery status processing.
    Returns empty 200 to acknowledge receipt.
    """
    return ""
