"""Twilio webhook security and routing infrastructure.

Provides three composable pieces used by all webhook endpoints:

1. ``resolve_org_from_phone`` -- looks up the org that owns the To/Called
   phone number in the inbound Twilio request.
2. ``verify_twilio_signature`` -- validates the ``X-Twilio-Signature``
   HMAC using the resolved org's auth token and a server-side public URL
   (never ``request.url``, which may differ behind a reverse proxy).
3. ``check_idempotency`` -- INSERT ... ON CONFLICT DO NOTHING against the
   ``webhook_events`` table to detect duplicate deliveries by
   ``(provider_sid, event_type)``.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.request_validator import RequestValidator

from app.core.config import settings
from app.db.session import get_db
from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization
from app.models.webhook_event import WebhookEvent
from app.services.twilio_config import TwilioConfigService

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _reconstruct_public_url(request: Request) -> str:
    """Build the canonical public URL that Twilio signed against.

    Uses ``settings.webhook_base_url`` (server-side config) instead of
    ``request.url`` to prevent an attacker-controlled Host header from
    bypassing signature validation (T-90-05).
    """
    base = settings.webhook_base_url.rstrip("/")
    url = base + request.url.path
    if request.url.query:
        url += "?" + request.url.query
    return url


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


async def resolve_org_from_phone(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """Resolve the owning organization from the To/Called phone number.

    Raises:
        HTTPException 404: No target number in request, unknown number,
            or organization not found.
    """
    form_data = await request.form()
    to_number = form_data.get("To") or form_data.get("Called")
    if not to_number:
        raise HTTPException(status_code=404, detail="No target number in request")

    stmt = select(OrgPhoneNumber).where(OrgPhoneNumber.phone_number == to_number)
    phone_record = (await db.scalars(stmt)).first()
    if phone_record is None:
        raise HTTPException(status_code=404, detail="Unknown phone number")

    org = await db.get(Organization, phone_record.org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def verify_twilio_signature(
    request: Request,
    org: Organization = Depends(resolve_org_from_phone),
) -> Organization:
    """Validate the ``X-Twilio-Signature`` HMAC for this request.

    The signature is verified against the *public* URL reconstructed from
    ``settings.webhook_base_url``, not from the inbound ``request.url``.

    Returns the resolved ``Organization`` so downstream handlers can use
    it without a redundant lookup.

    Raises:
        HTTPException 403: Missing header, unconfigured org, or bad signature.
    """
    signature = request.headers.get("x-twilio-signature")
    if not signature:
        raise HTTPException(status_code=403, detail="Missing Twilio signature")

    public_url = _reconstruct_public_url(request)

    creds = TwilioConfigService().credentials_for_org(org)
    if creds is None:
        raise HTTPException(
            status_code=403,
            detail="Twilio not configured for organization",
        )

    validator = RequestValidator(creds.auth_token)
    form_data = await request.form()
    params = dict(form_data)

    if not validator.validate(public_url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    return org


# ---------------------------------------------------------------------------
# Idempotency check (not a dependency -- called explicitly by handlers)
# ---------------------------------------------------------------------------


async def check_idempotency(
    db: AsyncSession,
    provider_sid: str,
    event_type: str,
    org_id: uuid.UUID,
    payload_summary: dict | None = None,
) -> bool:
    """Return ``True`` if this (provider_sid, event_type) is a duplicate.

    Uses INSERT ... ON CONFLICT DO NOTHING on the
    ``uq_webhook_events_sid_type`` unique constraint. If ``rowcount == 0``
    the row already existed (duplicate).
    """
    stmt = (
        pg_insert(WebhookEvent)
        .values(
            provider_sid=provider_sid,
            event_type=event_type,
            org_id=org_id,
            payload_summary=payload_summary,
        )
        .on_conflict_do_nothing(constraint="uq_webhook_events_sid_type")
    )
    result = await db.execute(stmt)
    return result.rowcount == 0
