"""Phone bank session management, call recording, and supervisor endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.call_list import CallListEntryResponse
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.phone_bank import (
    AssignCallerRequest,
    CallRecordCreate,
    CallRecordResponse,
    PhoneBankSessionCreate,
    PhoneBankSessionResponse,
    PhoneBankSessionUpdate,
    ReassignRequest,
    SessionCallerResponse,
    SessionProgressResponse,
)
from app.models.phone_bank import SessionCaller
from app.services.phone_bank import PhoneBankService

router = APIRouter()

_phone_bank_service = PhoneBankService()


# ---------------------------------------------------------------------------
# Session management (manager+)
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions",
    response_model=PhoneBankSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    campaign_id: uuid.UUID,
    body: PhoneBankSessionCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a phone bank session.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    pb_session = await _phone_bank_service.create_session(
        db, campaign_id, body, user.id
    )
    await db.commit()
    return PhoneBankSessionResponse.model_validate(pb_session)


@router.get(
    "/campaigns/{campaign_id}/phone-bank-sessions",
    response_model=PaginatedResponse[PhoneBankSessionResponse],
)
async def list_sessions(
    campaign_id: uuid.UUID,
    assigned_to_me: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List phone bank sessions for a campaign.

    Requires volunteer+ role. Pass ``assigned_to_me=true`` to filter to
    sessions where the current user is an assigned caller.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))

    assigned_to_me_user_id = user.id if assigned_to_me else None
    sessions = await _phone_bank_service.list_sessions(
        db, campaign_id, assigned_to_me_user_id=assigned_to_me_user_id
    )

    # Batch-fetch caller counts for all returned sessions
    session_ids = [s.id for s in sessions]
    caller_counts: dict[uuid.UUID, int] = {}
    if session_ids:
        counts_result = await db.execute(
            select(SessionCaller.session_id, func.count(SessionCaller.id))
            .where(SessionCaller.session_id.in_(session_ids))
            .group_by(SessionCaller.session_id)
        )
        caller_counts = dict(counts_result.all())

    items = [
        PhoneBankSessionResponse(
            **{
                k: v
                for k, v in PhoneBankSessionResponse.model_validate(s).model_dump().items()
                if k != "caller_count"
            },
            caller_count=caller_counts.get(s.id, 0),
        )
        for s in sessions
    ]
    return PaginatedResponse[PhoneBankSessionResponse](
        items=items,
        pagination=PaginationResponse(next_cursor=None, has_more=False),
    )


@router.get(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}",
    response_model=PhoneBankSessionResponse,
)
async def get_session(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get phone bank session detail.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    pb_session = await _phone_bank_service.get_session(db, session_id)
    if pb_session is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Session Not Found",
            detail=f"Phone bank session {session_id} not found",
            type="session-not-found",
        )
    return PhoneBankSessionResponse.model_validate(pb_session)


@router.patch(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}",
    response_model=PhoneBankSessionResponse,
)
async def update_session(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    body: PhoneBankSessionUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update a phone bank session (status transitions, name, schedule).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        pb_session = await _phone_bank_service.update_session(
            db, session_id, body
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Session Update Failed",
            detail=str(exc),
            type="session-update-failed",
        )
    await db.commit()
    return PhoneBankSessionResponse.model_validate(pb_session)


# ---------------------------------------------------------------------------
# Caller management
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers",
    response_model=SessionCallerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_caller(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    body: AssignCallerRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Assign a caller to a phone bank session.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        caller = await _phone_bank_service.assign_caller(
            db, session_id, body.user_id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Assignment Failed",
            detail=str(exc),
            type="caller-assignment-failed",
        )
    await db.commit()
    return SessionCallerResponse.model_validate(caller)


@router.delete(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_caller(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user_id: str,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a caller from a phone bank session.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _phone_bank_service.remove_caller(db, session_id, user_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Caller Not Found",
            detail=str(exc),
            type="caller-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers",
    response_model=list[SessionCallerResponse],
)
async def list_callers(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List callers assigned to a phone bank session.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    callers = await _phone_bank_service.list_callers(db, session_id)
    return [SessionCallerResponse.model_validate(c) for c in callers]


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/check-in",
    response_model=SessionCallerResponse,
)
async def check_in(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Check in to a phone bank session.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        caller = await _phone_bank_service.check_in(db, session_id, user.id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Check-in Failed",
            detail=str(exc),
            type="check-in-failed",
        )
    await db.commit()
    return SessionCallerResponse.model_validate(caller)


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/check-out",
    response_model=SessionCallerResponse,
)
async def check_out(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Check out of a phone bank session.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        caller = await _phone_bank_service.check_out(db, session_id, user.id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Check-out Failed",
            detail=str(exc),
            type="check-out-failed",
        )
    await db.commit()
    return SessionCallerResponse.model_validate(caller)


# ---------------------------------------------------------------------------
# Call recording
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/calls",
    response_model=CallRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_call(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    body: CallRecordCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Record a call outcome with optional survey responses.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        result = await _phone_bank_service.record_call(
            db, campaign_id, session_id, body, user.id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Call Recording Failed",
            detail=str(exc),
            type="call-recording-failed",
        )
    await db.commit()
    return result


# ---------------------------------------------------------------------------
# Supervisor operations (manager+)
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/progress",
    response_model=SessionProgressResponse,
)
async def get_progress(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Get session progress with per-caller stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        result = await _phone_bank_service.get_progress(db, session_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Session Not Found",
            detail=str(exc),
            type="session-not-found",
        )
    return result


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/entries/{entry_id}/reassign",
    response_model=CallListEntryResponse,
)
async def reassign_entry(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: ReassignRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Reassign an entry to a different caller.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        entry = await _phone_bank_service.reassign_entry(
            db, entry_id, body.new_caller_id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Entry Not Found",
            detail=str(exc),
            type="entry-not-found",
        )
    await db.commit()
    return CallListEntryResponse.model_validate(entry)


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/entries/{entry_id}/release",
    response_model=CallListEntryResponse,
)
async def force_release_entry(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Force-release an entry back to AVAILABLE.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        entry = await _phone_bank_service.force_release_entry(db, entry_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Entry Not Found",
            detail=str(exc),
            type="entry-not-found",
        )
    await db.commit()
    return CallListEntryResponse.model_validate(entry)


@router.post(
    "/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/entries/{entry_id}/self-release",
    response_model=CallListEntryResponse,
)
async def self_release_entry(
    campaign_id: uuid.UUID,
    session_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Release a claimed entry back to AVAILABLE (caller self-service).

    The requesting caller must be the one who claimed the entry.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        entry = await _phone_bank_service.self_release_entry(db, entry_id, user.id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Self-Release Failed",
            detail=str(exc),
            type="self-release-failed",
        )
    await db.commit()
    return CallListEntryResponse.model_validate(entry)
