"""Invite business logic: create, validate, accept, revoke, list."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import InsufficientPermissionsError
from app.core.security import CampaignRole
from app.core.time import utcnow
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.invite import Invite
from app.models.organization import Organization
from app.models.user import User
from app.models.volunteer import Volunteer
from app.tasks.invite_tasks import send_campaign_invite_email

if TYPE_CHECKING:
    from app.core.security import AuthenticatedUser
    from app.services.zitadel import ZitadelService


INVITE_EXPIRY_DAYS = 7


class InviteService:
    """Invite lifecycle management."""

    async def create_invite(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        email: str,
        role: str,
        creator: AuthenticatedUser,
    ) -> Invite:
        """Create a campaign invite with role validation.

        Args:
            db: Async database session.
            campaign_id: The campaign to invite into.
            email: Email of the invitee.
            role: Role to grant upon acceptance.
            creator: The authenticated user creating the invite.

        Returns:
            The created Invite.

        Raises:
            InsufficientPermissionsError: If creator cannot invite at this role level.
            ValueError: If a pending invite already exists for this email+campaign.
        """
        # Validate role hierarchy: creator must be above the invited role
        invited_role = CampaignRole[role.upper()]
        if creator.role == CampaignRole.OWNER:
            # Owner can invite any role except owner
            if invited_role == CampaignRole.OWNER:
                raise InsufficientPermissionsError("Cannot invite with owner role")
        elif creator.role == CampaignRole.ADMIN:
            # Admin can invite manager and below
            if invited_role > CampaignRole.MANAGER:
                raise InsufficientPermissionsError(
                    "Admins can only invite manager role and below"
                )
        elif creator.role == CampaignRole.MANAGER:
            if invited_role > CampaignRole.VOLUNTEER:
                raise InsufficientPermissionsError(
                    "Managers can only invite volunteer role and below"
                )
        else:
            raise InsufficientPermissionsError(
                "Only managers, admins, and owners can create invites"
            )

        # Check for existing pending invite
        result = await db.execute(
            select(Invite).where(
                and_(
                    Invite.campaign_id == campaign_id,
                    Invite.email == email.lower(),
                    Invite.accepted_at.is_(None),
                    Invite.revoked_at.is_(None),
                    Invite.expires_at > utcnow(),
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            msg = f"A pending invite already exists for {email} in this campaign"
            raise ValueError(msg)

        now = utcnow()
        invite = Invite(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            email=email.lower(),
            role=role.lower(),
            token=uuid.uuid4(),
            expires_at=now + timedelta(days=INVITE_EXPIRY_DAYS),
            created_by=creator.id,
            created_at=now,
        )
        db.add(invite)
        await db.commit()
        await db.refresh(invite)
        await self.enqueue_invite_email(db, invite)
        logger.info(
            "Invite created for {} to campaign {} with role {}",
            email,
            campaign_id,
            role,
        )
        return invite

    async def validate_invite(
        self,
        db: AsyncSession,
        token: uuid.UUID,
    ) -> Invite | None:
        """Validate an invite token.

        Args:
            db: Async database session.
            token: The invite token UUID.

        Returns:
            The Invite if valid, None otherwise.
        """
        result = await db.execute(select(Invite).where(Invite.token == token))
        invite = result.scalar_one_or_none()
        if invite is None:
            return None
        if invite.expires_at < utcnow():
            return None
        if invite.revoked_at is not None:
            return None
        if invite.accepted_at is not None:
            return None
        return invite

    async def enqueue_invite_email(
        self,
        db: AsyncSession,
        invite: Invite,
    ) -> Invite:
        """Queue asynchronous invite email delivery after the invite commit."""
        invite.email_delivery_status = "queued"
        invite.email_delivery_queued_at = utcnow()
        invite.email_delivery_last_event_at = invite.email_delivery_queued_at
        invite.email_delivery_error = None
        await db.commit()
        await db.refresh(invite)

        try:
            await send_campaign_invite_email.configure(
                queueing_lock=f"invite-email:{invite.id}",
            ).defer_async(
                invite_id=str(invite.id),
                campaign_id=str(invite.campaign_id),
            )
        except Exception:
            invite.email_delivery_status = "failed"
            invite.email_delivery_error = "Failed to queue invite email"
            invite.email_delivery_last_event_at = utcnow()
            await db.commit()
            await db.refresh(invite)
        return invite

    async def accept_invite(
        self,
        db: AsyncSession,
        token: uuid.UUID,
        user: AuthenticatedUser,
        zitadel: ZitadelService,
    ) -> Invite:
        """Accept an invite: create member, assign ZITADEL role.

        Args:
            db: Async database session.
            token: The invite token UUID.
            user: The authenticated user accepting.
            zitadel: ZITADEL service for role assignment.

        Returns:
            The accepted Invite.

        Raises:
            ValueError: If invite is invalid or email doesn't match.
        """
        invite = await self.validate_invite(db, token)
        if invite is None:
            msg = "Invalid or expired invite"
            raise ValueError(msg)

        # Verify email match (case-insensitive)
        if user.email is None or user.email.lower() != invite.email.lower():
            msg = "Email does not match the invite"
            raise ValueError(msg)

        # Create or update CampaignMember
        member_result = await db.execute(
            select(CampaignMember).where(
                and_(
                    CampaignMember.user_id == user.id,
                    CampaignMember.campaign_id == invite.campaign_id,
                )
            )
        )
        member = member_result.scalar_one_or_none()
        old_role: str | None = None
        if member is None:
            member = CampaignMember(
                user_id=user.id,
                campaign_id=invite.campaign_id,
                role=invite.role,
            )
            db.add(member)
        else:
            old_role = member.role
            member.role = invite.role

        # Back-fill any unlinked Volunteer row created by the volunteer
        # application approval path so it ties to this user's account.
        await db.execute(
            update(Volunteer)
            .where(
                Volunteer.campaign_id == invite.campaign_id,
                Volunteer.email == invite.email.lower(),
                Volunteer.user_id.is_(None),
            )
            .values(user_id=user.id, updated_at=utcnow())
        )

        # Look up campaign for ZITADEL context — fail fast if missing
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == invite.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign is None:
            msg = f"Campaign {invite.campaign_id} not found"
            raise ValueError(msg)
        zitadel_org_id = campaign.zitadel_org_id

        project_grant_id = None
        if campaign.organization_id:
            org_result = await db.execute(
                select(Organization).where(Organization.id == campaign.organization_id)
            )
            org = org_result.scalar_one_or_none()
            if org:
                project_grant_id = org.zitadel_project_grant_id

        # Remove prior ZITADEL role if member already existed with a different role
        if old_role and old_role != invite.role:
            await zitadel.remove_project_role(
                settings.zitadel_project_id,
                user.id,
                old_role,
                org_id=zitadel_org_id,
            )

        # Assign ZITADEL project role
        await zitadel.assign_project_role(
            settings.zitadel_project_id,
            user.id,
            invite.role,
            project_grant_id=project_grant_id,
            org_id=zitadel_org_id,
        )

        try:
            invite.accepted_at = utcnow()
            await db.commit()
            await db.refresh(invite)
        except Exception as commit_exc:
            logger.error(
                "DB commit failed for invite accept (invite_id={}): {}",
                invite.id,
                commit_exc,
            )
            await db.rollback()
            try:
                await zitadel.remove_project_role(
                    settings.zitadel_project_id,
                    user.id,
                    invite.role,
                    org_id=zitadel_org_id,
                )
            except Exception as cleanup_exc:
                logger.error(
                    "Failed to remove orphaned ZITADEL role after "
                    "invite commit failure: {}",
                    cleanup_exc,
                )
            raise
        logger.info(
            "Invite accepted by {} for campaign {} with role {}",
            user.id,
            invite.campaign_id,
            invite.role,
        )
        return invite

    async def revoke_invite(
        self,
        db: AsyncSession,
        invite_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> Invite:
        """Revoke a pending invite.

        Args:
            db: Async database session.
            invite_id: The invite UUID.
            campaign_id: The campaign UUID scope — invite must belong here.

        Returns:
            The revoked Invite.

        Raises:
            ValueError: If invite not found (or belongs to a different campaign).
        """
        result = await db.execute(
            select(Invite).where(
                and_(
                    Invite.id == invite_id,
                    Invite.campaign_id == campaign_id,
                )
            )
        )
        invite = result.scalar_one_or_none()
        if invite is None:
            msg = "Invite not found"
            raise ValueError(msg)

        invite.revoked_at = utcnow()
        await db.commit()
        await db.refresh(invite)
        return invite

    async def list_invites(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[Invite]:
        """List pending invites for a campaign.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.

        Returns:
            List of pending (not accepted, not revoked, not expired) invites.
        """
        result = await db.execute(
            select(Invite).where(
                and_(
                    Invite.campaign_id == campaign_id,
                    Invite.accepted_at.is_(None),
                    Invite.revoked_at.is_(None),
                    Invite.expires_at > utcnow(),
                )
            )
        )
        return list(result.scalars().all())

    async def get_public_invite(
        self,
        db: AsyncSession,
        token: uuid.UUID,
    ) -> tuple[Invite | None, Campaign | None, Organization | None, User | None]:
        """Load public-facing invite context by token."""
        invite = (
            await db.execute(select(Invite).where(Invite.token == token))
        ).scalar_one_or_none()
        if invite is None:
            return None, None, None, None

        campaign = await db.get(Campaign, invite.campaign_id)
        organization = None
        if campaign and campaign.organization_id is not None:
            organization = await db.get(Organization, campaign.organization_id)
        inviter = await db.get(User, invite.created_by)
        return invite, campaign, organization, inviter

    def get_public_invite_status(self, invite: Invite | None) -> str:
        """Summarize the current public invite state."""
        if invite is None:
            return "not_found"
        if invite.accepted_at is not None:
            return "accepted"
        if invite.revoked_at is not None:
            return "revoked"
        if invite.expires_at <= utcnow():
            return "expired"
        return "valid"
