"""Survey script, question, and response endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.models.survey import ScriptStatus
from app.schemas.common import PaginationResponse
from app.schemas.survey import (
    BatchResponseCreate,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    ScriptCreate,
    ScriptDetailResponse,
    ScriptListResponse,
    ScriptResponse,
    ScriptUpdate,
    SurveyResponseOut,
)
from app.services.survey import SurveyService

router = APIRouter()

_service = SurveyService()


# ---------------------------------------------------------------------------
# Script endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/surveys",
    response_model=ScriptResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def create_script(
    request: Request,
    campaign_id: uuid.UUID,
    body: ScriptCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Create a new survey script in draft status. Requires manager+ role."""
    await ensure_user_synced(user, db)

    script = await _service.create_script(
        session=db,
        campaign_id=campaign_id,
        data=body,
        user_id=user.id,
    )
    await db.commit()

    return ScriptResponse.model_validate(script)


@router.get(
    "/campaigns/{campaign_id}/surveys",
    response_model=ScriptListResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_scripts(
    request: Request,
    campaign_id: uuid.UUID,
    status_filter: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List survey scripts with optional status filter. Requires volunteer+ role."""
    await ensure_user_synced(user, db)

    parsed_status = None
    if status_filter is not None:
        try:
            parsed_status = ScriptStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status filter: {status_filter}",
            ) from None

    items, next_cursor, has_more = await _service.list_scripts(
        session=db,
        campaign_id=campaign_id,
        status_filter=parsed_status,
        cursor=cursor,
        limit=limit,
    )

    return ScriptListResponse(
        items=[ScriptResponse.model_validate(s) for s in items],
        pagination=PaginationResponse(
            next_cursor=next_cursor,
            has_more=has_more,
        ),
    )


@router.get(
    "/campaigns/{campaign_id}/surveys/{script_id}",
    response_model=ScriptDetailResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_script(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get a script with its questions. Requires volunteer+ role."""
    await ensure_user_synced(user, db)

    script = await _service.get_script(session=db, script_id=script_id)
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script {script_id} not found",
        )

    questions = await _service.list_questions(session=db, script_id=script_id)

    return ScriptDetailResponse(
        **ScriptResponse.model_validate(script).model_dump(),
        questions=[QuestionResponse.model_validate(q) for q in questions],
    )


@router.patch(
    "/campaigns/{campaign_id}/surveys/{script_id}",
    response_model=ScriptResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def update_script(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    body: ScriptUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update a script (status transitions and metadata). Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        script = await _service.update_script(
            session=db, script_id=script_id, data=body
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return ScriptResponse.model_validate(script)


@router.delete(
    "/campaigns/{campaign_id}/surveys/{script_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def delete_script(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Delete a draft script. Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        await _service.delete_script(session=db, script_id=script_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Question endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/surveys/{script_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def add_question(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    body: QuestionCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Add a question to a draft script. Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        question = await _service.add_question(
            session=db, script_id=script_id, data=body
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return QuestionResponse.model_validate(question)


@router.patch(
    "/campaigns/{campaign_id}/surveys/{script_id}/questions/{question_id}",
    response_model=QuestionResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def update_question(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    question_id: uuid.UUID,
    body: QuestionUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update a question on a draft script. Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        question = await _service.update_question(
            session=db, question_id=question_id, data=body
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return QuestionResponse.model_validate(question)


@router.delete(
    "/campaigns/{campaign_id}/surveys/{script_id}/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def delete_question(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    question_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Delete a question from a draft script. Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        await _service.delete_question(session=db, question_id=question_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/campaigns/{campaign_id}/surveys/{script_id}/questions/order",
    response_model=list[QuestionResponse],
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def reorder_questions(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    question_ids: list[uuid.UUID],
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Reorder questions on a draft script. Requires manager+ role."""
    await ensure_user_synced(user, db)

    try:
        questions = await _service.reorder_questions(
            session=db, script_id=script_id, question_ids=question_ids
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return [QuestionResponse.model_validate(q) for q in questions]


# ---------------------------------------------------------------------------
# Response endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/surveys/{script_id}/responses",
    response_model=list[SurveyResponseOut],
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def record_batch_responses(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    body: BatchResponseCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Record batch survey responses for a voter. Requires volunteer+ role."""
    await ensure_user_synced(user, db)

    try:
        results = await _service.record_responses_batch(
            session=db,
            campaign_id=campaign_id,
            script_id=script_id,
            voter_id=body.voter_id,
            responses=body.responses,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    await db.commit()

    return [SurveyResponseOut.model_validate(r) for r in results]


@router.get(
    "/campaigns/{campaign_id}/surveys/{script_id}/voters/{voter_id}/responses",
    response_model=list[SurveyResponseOut],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_voter_responses(
    request: Request,
    campaign_id: uuid.UUID,
    script_id: uuid.UUID,
    voter_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get a voter's responses for a script. Requires volunteer+ role."""
    await ensure_user_synced(user, db)

    results = await _service.get_voter_responses(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        script_id=script_id,
    )

    return [SurveyResponseOut.model_validate(r) for r in results]
