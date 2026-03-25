"""Do Not Call list management endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.schemas.dnc import (
    DNCCheckRequest,
    DNCCheckResponse,
    DNCEntryCreate,
    DNCEntryResponse,
    DNCImportResponse,
)
from app.services.dnc import DNCService

router = APIRouter()

_dnc_service = DNCService()


@router.get(
    "/campaigns/{campaign_id}/dnc",
    response_model=list[DNCEntryResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_dnc_entries(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List all DNC entries for a campaign.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    items = await _dnc_service.list_entries(db, campaign_id)
    return [DNCEntryResponse.model_validate(e) for e in items]


@router.post(
    "/campaigns/{campaign_id}/dnc",
    response_model=DNCEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def add_dnc_entry(
    request: Request,
    campaign_id: uuid.UUID,
    body: DNCEntryCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Add a phone number to the DNC list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    entry = await _dnc_service.add_entry(
        db, campaign_id, body.phone_number, body.reason, user.id
    )
    await db.commit()
    return DNCEntryResponse.model_validate(entry)


@router.post(
    "/campaigns/{campaign_id}/dnc/import",
    response_model=DNCImportResponse,
)
@limiter.limit("5/minute", key_func=get_user_or_ip_key)
async def bulk_import_dnc(
    request: Request,
    campaign_id: uuid.UUID,
    file: UploadFile,
    reason: str = Query(default="manual"),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Bulk import DNC entries from a CSV file.

    Requires manager+ role. CSV must have a phone_number column.
    """
    await ensure_user_synced(user, db)
    content = await file.read()
    csv_content = content.decode("utf-8")
    result = await _dnc_service.bulk_import(
        db, campaign_id, csv_content, user.id, default_reason=reason
    )
    await db.commit()
    return result


@router.delete(
    "/campaigns/{campaign_id}/dnc/{dnc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def delete_dnc_entry(
    request: Request,
    campaign_id: uuid.UUID,
    dnc_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Remove a DNC entry.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _dnc_service.delete_entry(db, dnc_id)
    except ValueError:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="DNC Entry Not Found",
            detail=f"DNC entry {dnc_id} not found",
            type="dnc-entry-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/campaigns/{campaign_id}/dnc/check",
    response_model=DNCCheckResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def check_dnc(
    request: Request,
    campaign_id: uuid.UUID,
    body: DNCCheckRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Check if a phone number is on the DNC list.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    return await _dnc_service.check_number(db, campaign_id, body.phone_number)
