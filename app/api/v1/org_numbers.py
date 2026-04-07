"""Phone number inventory API endpoints.

Org-scoped endpoints for managing Twilio phone numbers.
All endpoints under /api/v1/org/numbers (mounted on the org router).
Role gates: org_admin for reads, org_owner for writes (D-10).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_org_role
from app.db.session import get_db
from app.models.organization import Organization
from app.schemas.org_phone_number import (
    OrgPhoneNumberResponse,
    RegisterPhoneNumberRequest,
    SetDefaultRequest,
)
from app.services.org_phone_number import OrgPhoneNumberService

numbers_router = APIRouter()
_number_service = OrgPhoneNumberService()


async def _resolve_org(
    user: AuthenticatedUser,
    db: AsyncSession,
) -> Organization:
    """Resolve the Organization row from the authenticated user's org_id."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return org


@numbers_router.get("", response_model=list[OrgPhoneNumberResponse])
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_numbers(
    request: Request,
    user: AuthenticatedUser = Depends(require_org_role("org_admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all phone numbers registered for the authenticated user's org."""
    org = await _resolve_org(user, db)
    numbers = await _number_service.list_numbers(db, org.id)
    return [_number_service.enrich_response(n, org) for n in numbers]


@numbers_router.post(
    "",
    response_model=OrgPhoneNumberResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def register_number(
    request: Request,
    body: RegisterPhoneNumberRequest,
    user: AuthenticatedUser = Depends(require_org_role("org_owner")),
    db: AsyncSession = Depends(get_db),
):
    """Register a BYO Twilio phone number for the org."""
    org = await _resolve_org(user, db)
    number = await _number_service.register_number(db, org, body.phone_number)
    # Re-fetch org to pick up any default FK changes
    await db.refresh(org)
    return _number_service.enrich_response(number, org)


@numbers_router.delete(
    "/{number_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def delete_number(
    request: Request,
    number_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_org_role("org_owner")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a registered phone number, clearing defaults if applicable."""
    org = await _resolve_org(user, db)
    await _number_service.delete_number(db, org, number_id)


@numbers_router.post(
    "/{number_id}/sync",
    response_model=OrgPhoneNumberResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def sync_number(
    request: Request,
    number_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_org_role("org_owner")),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch capabilities from Twilio for a registered number."""
    org = await _resolve_org(user, db)
    number = await _number_service.sync_number(db, org, number_id)
    return _number_service.enrich_response(number, org)


@numbers_router.patch(
    "/{number_id}/set-default",
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def set_default(
    request: Request,
    number_id: uuid.UUID,
    body: SetDefaultRequest,
    user: AuthenticatedUser = Depends(require_org_role("org_owner")),
    db: AsyncSession = Depends(get_db),
):
    """Set a phone number as the org default for voice or SMS."""
    org = await _resolve_org(user, db)
    await _number_service.set_default(db, org, number_id, body.capability)
    return {"status": "ok"}
