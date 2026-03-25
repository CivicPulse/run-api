"""Invite endpoints: create, list, revoke, accept."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, get_current_user, require_role
from app.db.session import get_db
from app.schemas.invite import InviteAcceptResponse, InviteCreate, InviteResponse
from app.services.invite import InviteService

router = APIRouter()
invite_service = InviteService()


@router.post(
    "/campaigns/{campaign_id}/invites",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute", key_func=get_user_or_ip_key)
async def create_invite(
    request: Request,
    campaign_id: uuid.UUID,
    data: InviteCreate,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a campaign invite. Requires admin+ role."""
    from app.core.errors import InsufficientPermissionsError

    try:
        invite = await invite_service.create_invite(
            db=db,
            campaign_id=campaign_id,
            email=data.email,
            role=data.role,
            creator=user,
        )
        return InviteResponse(
            id=invite.id,
            campaign_id=invite.campaign_id,
            email=invite.email,
            role=invite.role,
            token=invite.token,
            expires_at=invite.expires_at,
            accepted_at=invite.accepted_at,
            revoked_at=invite.revoked_at,
            created_at=invite.created_at,
        )
    except InsufficientPermissionsError:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/campaigns/{campaign_id}/invites",
    response_model=list[InviteResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_invites(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    """List pending invites for a campaign. Requires admin+ role."""
    invites = await invite_service.list_invites(db, campaign_id)
    return [
        InviteResponse(
            id=inv.id,
            campaign_id=inv.campaign_id,
            email=inv.email,
            role=inv.role,
            token=None,
            expires_at=inv.expires_at,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            created_at=inv.created_at,
        )
        for inv in invites
    ]


@router.delete(
    "/campaigns/{campaign_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def revoke_invite(
    request: Request,
    campaign_id: uuid.UUID,  # noqa: ARG001
    invite_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invite. Requires admin+ role."""
    try:
        await invite_service.revoke_invite(db, invite_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/invites/{token}/accept",
    response_model=InviteAcceptResponse,
)
@limiter.limit("10/minute", key_func=get_user_or_ip_key)
async def accept_invite(
    token: uuid.UUID,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an invite. Requires authentication (any role)."""
    try:
        zitadel = request.app.state.zitadel_service
        invite = await invite_service.accept_invite(
            db=db,
            token=token,
            user=user,
            zitadel=zitadel,
        )
        return InviteAcceptResponse(
            message="Invite accepted successfully",
            campaign_id=invite.campaign_id,
            role=invite.role,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
