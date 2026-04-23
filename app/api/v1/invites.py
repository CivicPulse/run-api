"""Invite endpoints: create, list, revoke, accept."""

from __future__ import annotations

import contextlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi_users import InvalidPasswordException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.backend import auth_backend, get_database_strategy
from app.auth.db import get_access_token_db
from app.auth.manager import UserManager, get_user_manager
from app.core.config import settings
from app.core.middleware.csrf import issue_csrf_cookie
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.invite import (
    InviteAcceptResponse,
    InviteCreate,
    InviteResponse,
    PublicInviteResponse,
)
from app.services.invite import InviteService


class InviteAcceptNativeRequest(BaseModel):
    """Payload for native invite acceptance (no ZITADEL involvement)."""

    password: str = Field(min_length=12, description="New account password.")
    display_name: str = Field(min_length=1, max_length=255)


router = APIRouter()
invite_service = InviteService()


@router.post(
    "/campaigns/{campaign_id}/invites",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("40/minute", key_func=get_user_or_ip_key)
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
            email_delivery_status=invite.email_delivery_status,
            email_delivery_queued_at=invite.email_delivery_queued_at,
            email_delivery_sent_at=invite.email_delivery_sent_at,
            email_delivery_error=invite.email_delivery_error,
            email_delivery_last_event_at=invite.email_delivery_last_event_at,
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
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
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
            email_delivery_status=inv.email_delivery_status,
            email_delivery_queued_at=inv.email_delivery_queued_at,
            email_delivery_sent_at=inv.email_delivery_sent_at,
            email_delivery_error=inv.email_delivery_error,
            email_delivery_last_event_at=inv.email_delivery_last_event_at,
            created_at=inv.created_at,
        )
        for inv in invites
    ]


@router.get(
    "/public/invites/{token}",
    response_model=PublicInviteResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def get_public_invite(
    request: Request,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Resolve public invite metadata for the invite-entry page."""
    invite, campaign, organization, inviter = await invite_service.get_public_invite(
        db,
        token,
    )
    status_value = invite_service.get_public_invite_status(invite)
    return PublicInviteResponse(
        token=token,
        status=status_value,
        campaign_id=campaign.id if campaign else None,
        campaign_name=campaign.name if campaign else None,
        organization_name=organization.name if organization else None,
        inviter_name=inviter.display_name if inviter else None,
        role=invite.role if invite else None,
        expires_at=invite.expires_at if invite else None,
    )


@router.delete(
    "/campaigns/{campaign_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def revoke_invite(
    request: Request,
    campaign_id: uuid.UUID,
    invite_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invite. Requires admin+ role."""
    try:
        await invite_service.revoke_invite(db, invite_id, campaign_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/invites/{token}/accept",
    response_model=InviteAcceptResponse,
)
@limiter.limit("40/minute", key_func=get_user_or_ip_key)
async def accept_invite(
    token: uuid.UUID,
    request: Request,
    payload: InviteAcceptNativeRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user_manager: UserManager = Depends(get_user_manager),
):
    """Accept an invite natively: create a user + log them in.

    Step 4 rewrite -- no authentication required and no ZITADEL involvement.
    The invite token is the proof of identity; the caller supplies a password
    and display name to bootstrap their native account. On success we write
    both ``cp_session`` and ``cp_csrf`` cookies so the SPA lands logged in.
    """
    try:
        invite, user = await invite_service.accept_invite_native(
            db=db,
            token=token,
            password=payload.password,
            display_name=payload.display_name,
            user_manager=user_manager,
        )
    except InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid password: {exc.reason}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Issue a session cookie by running the configured auth backend's login
    # flow with a fresh database-strategy session. We avoid Depends() on the
    # strategy because we need it *after* the user is created.
    access_token_db_gen = get_access_token_db().__aiter__()
    try:
        access_token_db = await access_token_db_gen.__anext__()
    except StopAsyncIteration:  # pragma: no cover -- defensive
        raise HTTPException(status_code=500, detail="session init failed") from None
    try:
        strategy = get_database_strategy(access_token_db)
        login_response = await auth_backend.login(strategy, user)
        # Copy the login response's Set-Cookie header onto our response.
        set_cookie = login_response.headers.get("set-cookie")
        if set_cookie:
            response.headers.append("set-cookie", set_cookie)
        # Issue the matching CSRF cookie so the SPA can make mutating calls.
        issue_csrf_cookie(response, secure=not settings.debug)
    finally:
        # Exhaust the generator so its session is closed.
        with contextlib.suppress(StopAsyncIteration):
            await access_token_db_gen.__anext__()

    return InviteAcceptResponse(
        message="Invite accepted successfully",
        campaign_id=invite.campaign_id,
        role=invite.role,
    )
