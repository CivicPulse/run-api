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
    AppendFromListRequest,
    AppendFromListResponse,
    CallListCreate,
    CallListEntryResponse,
    CallListResponse,
    CallListSummaryResponse,
    CallListUpdate,
    ClaimEntriesRequest,
)
from app.schemas.common import PaginatedResponse, PaginationResponse
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
    response_model=PaginatedResponse[CallListSummaryResponse],
)
async def list_call_lists(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List call lists for a campaign.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    items = await _call_list_service.list_call_lists(db, campaign_id)
    return PaginatedResponse[CallListSummaryResponse](
        items=[CallListSummaryResponse.model_validate(cl) for cl in items],
        pagination=PaginationResponse(next_cursor=None, has_more=False),
    )


@router.get(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}",
    response_model=CallListResponse,
)
async def get_call_list(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get call list detail.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    call_list = await _call_list_service.get_call_list(db, call_list_id)
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
    new_status: str | None = None,
    body: CallListUpdate | None = None,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update call list status and/or name/voter_list_id.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        call_list = await _call_list_service.update_call_list(
            db, call_list_id, body or CallListUpdate(), new_status
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Update Failed",
            detail=str(exc),
            type="update-failed",
        )
    await db.commit()
    return CallListResponse.model_validate(call_list)


@router.get(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}/entries",
    response_model=PaginatedResponse[CallListEntryResponse],
)
async def list_call_list_entries(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    entry_status: str | None = None,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List entries for a call list with optional status filter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from sqlalchemy import select as sa_select

    from app.db.rls import set_campaign_context
    from app.models.voter import Voter

    await set_campaign_context(db, str(campaign_id))
    entries = await _call_list_service.list_entries(db, call_list_id, entry_status)

    # Resolve voter names
    voter_ids = [e.voter_id for e in entries]
    voter_names: dict[uuid.UUID, str] = {}
    if voter_ids:
        voters_result = await db.execute(
            sa_select(Voter.id, Voter.first_name, Voter.last_name).where(
                Voter.id.in_(voter_ids)
            )
        )
        for row in voters_result.all():
            voter_names[row.id] = f"{row.first_name} {row.last_name}".strip()

    items = []
    for entry in entries:
        entry_dict = {
            "id": entry.id,
            "voter_id": entry.voter_id,
            "voter_name": voter_names.get(entry.voter_id),
            "priority_score": entry.priority_score,
            "phone_numbers": entry.phone_numbers,
            "status": entry.status,
            "attempt_count": entry.attempt_count,
            "claimed_by": entry.claimed_by,
            "claimed_at": entry.claimed_at,
            "last_attempt_at": entry.last_attempt_at,
            "phone_attempts": entry.phone_attempts,
        }
        items.append(CallListEntryResponse(**entry_dict))

    return PaginatedResponse[CallListEntryResponse](
        items=items,
        pagination=PaginationResponse(next_cursor=None, has_more=False),
    )


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
        await _call_list_service.delete_call_list(db, call_list_id)
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
    user: AuthenticatedUser = Depends(require_role("volunteer")),
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
    # Resolve voter names (same pattern as list_call_list_entries)
    from sqlalchemy import select as sa_select

    from app.models.voter import Voter

    voter_ids = [e.voter_id for e in entries]
    voter_names: dict[uuid.UUID, str] = {}
    if voter_ids:
        voters_result = await db.execute(
            sa_select(Voter.id, Voter.first_name, Voter.last_name).where(
                Voter.id.in_(voter_ids)
            )
        )
        for row in voters_result.all():
            voter_names[row.id] = f"{row.first_name} {row.last_name}".strip()

    # Commit after enrichment so a failure above rolls back the claims
    await db.commit()

    items = []
    for entry in entries:
        entry_dict = {
            "id": entry.id,
            "voter_id": entry.voter_id,
            "voter_name": voter_names.get(entry.voter_id),
            "priority_score": entry.priority_score,
            "phone_numbers": entry.phone_numbers,
            "status": entry.status,
            "attempt_count": entry.attempt_count,
            "claimed_by": entry.claimed_by,
            "claimed_at": entry.claimed_at,
            "last_attempt_at": entry.last_attempt_at,
            "phone_attempts": entry.phone_attempts,
        }
        items.append(CallListEntryResponse(**entry_dict))

    return items


@router.post(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}/append-from-list",
    response_model=AppendFromListResponse,
    status_code=status.HTTP_200_OK,
)
async def append_from_list(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    body: AppendFromListRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Append voters from a voter list into an existing call list.

    Voters already present in the call list are skipped. New voters must
    have at least one valid non-DNC phone to be added.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        added, skipped = await _call_list_service.append_from_list(
            db, campaign_id, call_list_id, body.voter_list_id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Append From List Failed",
            detail=str(exc),
            type="append-from-list-failed",
        )
    await db.commit()
    return AppendFromListResponse(added=added, skipped=skipped)
