"""Member management endpoints: list, update role, remove, transfer ownership."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.config import settings
from app.core.errors import InsufficientPermissionsError
from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    require_role,
)
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.user import User
from app.schemas.member import MemberResponse, OwnershipTransfer, RoleUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/campaigns/{campaign_id}/members",
    response_model=list[MemberResponse],
)
async def list_members(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("viewer")),
    db: AsyncSession = Depends(get_db),
):
    """List campaign members with their roles. Requires viewer+ role.

    For v1, roles are fetched from ZITADEL via the requesting user's JWT context.
    Since we don't store roles in campaign_members, we return the role from
    the join context. This is simplified -- production would call ZITADEL API.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    result = await db.execute(
        select(CampaignMember, User)
        .join(User, CampaignMember.user_id == User.id)
        .where(CampaignMember.campaign_id == campaign_id)
    )
    rows = result.all()

    members = []
    for member, member_user in rows:
        display_name = member_user.display_name or ""
        email = member_user.email or ""
        if not display_name.strip():
            logger.warning(
                "display_name empty for user %s, falling back to 'Unknown'",
                member.user_id,
            )
        members.append(
            MemberResponse(
                user_id=member.user_id,
                display_name=display_name if display_name.strip() else "Unknown",
                email=email if email.strip() else "",
                role=member.role or "viewer",
                synced_at=member.synced_at,
            )
        )
    return members


@router.patch(
    "/campaigns/{campaign_id}/members/{member_user_id}/role",
    response_model=MemberResponse,
)
async def update_member_role(
    campaign_id: uuid.UUID,
    member_user_id: str,
    data: RoleUpdate,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's role. Requires admin+ role.

    Owner can change any role below owner.
    Admin can change roles at manager and below.
    """
    target_role = CampaignRole[data.role.upper()]

    # Enforce role hierarchy
    if user.role == CampaignRole.OWNER:
        if target_role == CampaignRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot grant owner role via role update. "
                "Use transfer-ownership instead.",
            )
    elif user.role == CampaignRole.ADMIN:
        if target_role >= CampaignRole.ADMIN:
            raise InsufficientPermissionsError(
                "Admins can only assign manager role and below"
            )
    else:
        raise InsufficientPermissionsError("Only admins and owners can update roles")

    # Verify member exists
    result = await db.execute(
        select(CampaignMember, User)
        .join(User, CampaignMember.user_id == User.id)
        .where(
            CampaignMember.user_id == member_user_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    member, member_user = row
    zitadel = request.app.state.zitadel_service

    # Look up campaign for ZITADEL org context
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    zitadel_org_id = campaign.zitadel_org_id

    # Remove all existing roles then assign the new one in ZITADEL
    # Using remove_all ensures we clean up even if DB role diverged
    await zitadel.remove_all_project_roles(
        settings.zitadel_project_id,
        member.user_id,
        org_id=zitadel_org_id,
    )
    await zitadel.assign_project_role(
        settings.zitadel_project_id,
        member.user_id,
        data.role,
        org_id=zitadel_org_id,
    )

    # Persist role change in DB
    member.role = data.role
    await db.commit()

    display_name = member_user.display_name or ""
    email = member_user.email or ""
    if not display_name.strip():
        logger.warning(
            "display_name empty for user %s, falling back to 'Unknown'",
            member.user_id,
        )
    return MemberResponse(
        user_id=member.user_id,
        display_name=display_name if display_name.strip() else "Unknown",
        email=email if email.strip() else "",
        role=data.role,
        synced_at=member.synced_at,
    )


@router.delete(
    "/campaigns/{campaign_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    campaign_id: uuid.UUID,
    member_user_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("admin")),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    """Remove a campaign member. Requires admin+ role. Cannot remove owner."""
    # Check the campaign to verify ownership
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign and campaign.created_by == member_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the campaign owner",
        )

    result = await db.execute(
        select(CampaignMember).where(
            CampaignMember.user_id == member_user_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    zitadel = request.app.state.zitadel_service
    await zitadel.remove_all_project_roles(
        settings.zitadel_project_id,
        member_user_id,
        org_id=campaign.zitadel_org_id if campaign else None,
    )
    await db.delete(member)
    await db.commit()


@router.post(
    "/campaigns/{campaign_id}/transfer-ownership",
    response_model=dict,
)
async def transfer_ownership(
    campaign_id: uuid.UUID,
    data: OwnershipTransfer,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Transfer campaign ownership. Requires owner role.

    Demotes current owner to admin, promotes target to owner.
    """
    # Verify campaign exists
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Verify target is a member
    target_result = await db.execute(
        select(CampaignMember).where(
            CampaignMember.user_id == data.new_owner_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    target_member = target_result.scalar_one_or_none()
    if target_member is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user is not a campaign member",
        )

    zitadel = request.app.state.zitadel_service
    zitadel_org_id = campaign.zitadel_org_id

    # Demote current owner to admin in ZITADEL
    await zitadel.remove_project_role(
        settings.zitadel_project_id,
        user.id,
        "owner",
        org_id=zitadel_org_id,
    )
    await zitadel.assign_project_role(
        settings.zitadel_project_id,
        user.id,
        "admin",
        org_id=zitadel_org_id,
    )

    # Promote target to owner in ZITADEL
    await zitadel.remove_project_role(
        settings.zitadel_project_id,
        data.new_owner_id,
        target_member.role or "viewer",
        org_id=zitadel_org_id,
    )
    await zitadel.assign_project_role(
        settings.zitadel_project_id,
        data.new_owner_id,
        "owner",
        org_id=zitadel_org_id,
    )

    # Update campaign.created_by
    campaign.created_by = data.new_owner_id

    # Persist role changes in DB
    current_owner_member = await db.execute(
        select(CampaignMember).where(
            CampaignMember.user_id == user.id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    owner_member = current_owner_member.scalar_one_or_none()
    if not owner_member:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Current owner member record not found",
        )
    owner_member.role = "admin"
    target_member.role = "owner"

    await db.commit()

    return {
        "message": "Ownership transferred successfully",
        "new_owner_id": data.new_owner_id,
        "campaign_id": str(campaign_id),
    }
