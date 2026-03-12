"""Do Not Call list management endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
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
async def list_dnc_entries(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """List all DNC entries for a campaign.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    items = await _dnc_service.list_entries(db, campaign_id)
    return [DNCEntryResponse.model_validate(e) for e in items]


@router.post(
    "/campaigns/{campaign_id}/dnc",
    response_model=DNCEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_dnc_entry(
    campaign_id: uuid.UUID,
    body: DNCEntryCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Add a phone number to the DNC list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    entry = await _dnc_service.add_entry(
        db, campaign_id, body.phone_number, body.reason, user.id
    )
    await db.commit()
    return DNCEntryResponse.model_validate(entry)


@router.post(
    "/campaigns/{campaign_id}/dnc/import",
    response_model=DNCImportResponse,
)
async def bulk_import_dnc(
    campaign_id: uuid.UUID,
    file: UploadFile,
    reason: str = Query(default="manual"),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import DNC entries from a CSV file.

    Requires manager+ role. CSV must have a phone_number column.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
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
async def delete_dnc_entry(
    campaign_id: uuid.UUID,
    dnc_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a DNC entry.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
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
async def check_dnc(
    campaign_id: uuid.UUID,
    body: DNCCheckRequest,
    user: AuthenticatedUser = Depends(
        require_role("volunteer")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Check if a phone number is on the DNC list.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    return await _dnc_service.check_number(
        db, campaign_id, body.phone_number
    )
