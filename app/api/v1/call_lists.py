"""Call list CRUD and entry claiming endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.call_list import (
    CallListCreate,
    CallListEntryResponse,
    CallListResponse,
    CallListSummaryResponse,
    ClaimEntriesRequest,
)
from app.services.call_list import CallListService

router = APIRouter()

_call_list_service = CallListService()


@router.post(
    "/campaigns/{campaign_id}/call-lists",
    response_model=CallListResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_call_list(
    campaign_id: uuid.UUID,
    body: CallListCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a call list from a voter universe.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        call_list = await _call_list_service.generate_call_list(
            db, campaign_id, body, user.id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Call List Generation Failed",
            detail=str(exc),
            type="call-list-generation-failed",
        )
    await db.commit()
    return CallListResponse.model_validate(call_list)


@router.get(
    "/campaigns/{campaign_id}/call-lists",
    response_model=list[CallListSummaryResponse],
)
async def list_call_lists(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(
        require_role("volunteer")
    ),
    db: AsyncSession = Depends(get_db),
):
    """List call lists for a campaign.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    items = await _call_list_service.list_call_lists(
        db, campaign_id
    )
    return [
        CallListSummaryResponse.model_validate(cl) for cl in items
    ]


@router.get(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}",
    response_model=CallListResponse,
)
async def get_call_list(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(
        require_role("volunteer")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Get call list detail.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    call_list = await _call_list_service.get_call_list(
        db, call_list_id
    )
    if call_list is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Call List Not Found",
            detail=f"Call list {call_list_id} not found",
            type="call-list-not-found",
        )
    return CallListResponse.model_validate(call_list)


@router.patch(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}",
    response_model=CallListResponse,
)
async def update_call_list_status(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    new_status: str,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update call list status (draft->active->completed).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        call_list = await _call_list_service.update_status(
            db, call_list_id, new_status
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Status Update Failed",
            detail=str(exc),
            type="status-update-failed",
        )
    await db.commit()
    return CallListResponse.model_validate(call_list)


@router.delete(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_call_list(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a call list and its entries.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _call_list_service.delete_call_list(
            db, call_list_id
        )
    except ValueError:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Call List Not Found",
            detail=f"Call list {call_list_id} not found",
            type="call-list-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}/claim",
    response_model=list[CallListEntryResponse],
)
async def claim_entries(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    body: ClaimEntriesRequest,
    user: AuthenticatedUser = Depends(
        require_role("volunteer")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Claim a batch of entries for calling.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        entries = await _call_list_service.claim_entries(
            db, call_list_id, user.id, body.batch_size
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Claim Failed",
            detail=str(exc),
            type="claim-failed",
        )
    await db.commit()
    return [
        CallListEntryResponse.model_validate(e) for e in entries
    ]
