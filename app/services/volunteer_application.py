"""Volunteer application intake and approval workflow."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import AuthenticatedUser, CampaignRole
from app.core.time import utcnow
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.user import User
from app.models.volunteer import Volunteer
from app.models.volunteer_application import VolunteerApplication
from app.services.invite import InviteService
from app.services.signup_link import SignupLinkService


@dataclass(slots=True)
class VolunteerApplicationReviewSnapshot:
    """Derived review metadata for admin-facing application responses."""

    has_existing_account: bool
    existing_member: bool
    existing_member_role: str | None
    prior_application_statuses: list[str]
    approval_delivery: str | None


class VolunteerApplicationService:
    """Handles public volunteer applications and admin review actions."""

    def __init__(self) -> None:
        self._signup_link_service = SignupLinkService()
        self._invite_service = InviteService()

    def _match_conditions(
        self,
        *,
        email: str,
        applicant_user_id: str | None,
    ) -> list[object]:
        conditions: list[object] = [VolunteerApplication.email == email]
        if applicant_user_id is not None:
            conditions.append(
                VolunteerApplication.applicant_user_id == applicant_user_id
            )
        return conditions

    async def get_current_application(
        self,
        db: AsyncSession,
        token: uuid.UUID,
        applicant_user_id: str,
    ) -> VolunteerApplication | None:
        link, campaign, _organization = await self._signup_link_service.get_public_link(
            db,
            token,
        )
        if link is None or campaign is None:
            return None
        return await db.scalar(
            select(VolunteerApplication).where(
                VolunteerApplication.campaign_id == campaign.id,
                VolunteerApplication.applicant_user_id == applicant_user_id,
            )
        )

    async def submit_application(
        self,
        db: AsyncSession,
        token: uuid.UUID,
        *,
        applicant_user_id: str | None,
        first_name: str,
        last_name: str,
        email: str,
        phone: str | None,
        notes: str | None,
    ) -> VolunteerApplication:
        link, campaign, _organization = await self._signup_link_service.get_public_link(
            db,
            token,
        )
        if link is None or campaign is None:
            raise ValueError("Signup link unavailable")

        normalized_email = email.strip().lower()

        existing = await db.scalar(
            select(VolunteerApplication)
            .where(
                VolunteerApplication.campaign_id == campaign.id,
                VolunteerApplication.status.in_(("pending", "approved")),
                or_(
                    *self._match_conditions(
                        email=normalized_email,
                        applicant_user_id=applicant_user_id,
                    )
                ),
            )
            .order_by(VolunteerApplication.created_at.desc())
        )
        if existing is not None:
            return existing

        application = VolunteerApplication(
            campaign_id=campaign.id,
            signup_link_id=link.id,
            signup_link_label=link.label,
            applicant_user_id=applicant_user_id,
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            email=normalized_email,
            phone=phone,
            notes=notes,
            status="pending",
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return application

    async def list_applications(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[VolunteerApplication]:
        result = await db.execute(
            select(VolunteerApplication)
            .where(VolunteerApplication.campaign_id == campaign_id)
            .order_by(
                case(
                    (VolunteerApplication.status == "pending", 0),
                    else_=1,
                ),
                VolunteerApplication.created_at.desc(),
            )
        )
        applications = list(result.scalars().all())
        for application in applications:
            application.review_context = await self._build_review_context(
                db, application
            )
        return applications

    async def approve_application(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        application_id: uuid.UUID,
        reviewer_id: str,
        zitadel,
    ) -> VolunteerApplication:
        application = await db.scalar(
            select(VolunteerApplication).where(
                VolunteerApplication.id == application_id,
                VolunteerApplication.campaign_id == campaign_id,
            )
        )
        if application is None:
            raise ValueError("Volunteer application not found")
        if application.status == "approved":
            return application

        campaign = await db.scalar(select(Campaign).where(Campaign.id == campaign_id))
        if campaign is None:
            raise ValueError("Campaign not found")

        user = await self._resolve_application_user(db, application)
        created_member = False
        invite_delivery = None

        if user is None and application.applicant_user_id is None:
            reviewer = AuthenticatedUser(
                id=reviewer_id,
                org_id=campaign.zitadel_org_id,
                role=CampaignRole.ADMIN,
            )
            invite = await self._invite_service.create_invite(
                db=db,
                campaign_id=campaign_id,
                email=application.email,
                role="volunteer",
                creator=reviewer,
            )
            invite_delivery = invite.email_delivery_status
        elif user is None:
            display_name = f"{application.first_name} {application.last_name}".strip()
            user = User(
                id=application.applicant_user_id,
                display_name=display_name,
                email=application.email,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(user)
            await db.flush()

        # Always create/update a Volunteer row so list_volunteers surfaces the
        # approved applicant, regardless of whether a local users row exists yet.
        # When `user` is None (anonymous invite path), the Volunteer row is
        # created with user_id=None and back-filled on invite acceptance.
        if user is not None:
            display_name = f"{application.first_name} {application.last_name}".strip()
            if application.applicant_user_id is None:
                application.applicant_user_id = user.id

            changed = False
            if display_name and user.display_name != display_name:
                user.display_name = display_name
                changed = True
            if application.email and user.email != application.email:
                user.email = application.email
                changed = True
            if changed:
                user.updated_at = utcnow()

            member = await db.scalar(
                select(CampaignMember).where(
                    CampaignMember.user_id == user.id,
                    CampaignMember.campaign_id == campaign_id,
                )
            )
            if member is None:
                member = CampaignMember(
                    user_id=user.id,
                    campaign_id=campaign_id,
                    role="volunteer",
                )
                db.add(member)
                created_member = True

            volunteer = await db.scalar(
                select(Volunteer).where(
                    Volunteer.campaign_id == campaign_id,
                    Volunteer.user_id == user.id,
                )
            )
        else:
            # Anonymous path: de-dupe by (campaign_id, email) + user_id IS NULL.
            volunteer = await db.scalar(
                select(Volunteer).where(
                    Volunteer.campaign_id == campaign_id,
                    Volunteer.user_id.is_(None),
                    Volunteer.email == application.email,
                )
            )

        if volunteer is None:
            volunteer = Volunteer(
                campaign_id=campaign_id,
                user_id=user.id if user is not None else None,
                first_name=application.first_name,
                last_name=application.last_name,
                email=application.email,
                phone=application.phone,
                notes=application.notes,
                status="active",
                skills=[],
                created_by=reviewer_id,
            )
            db.add(volunteer)
        else:
            volunteer.first_name = application.first_name
            volunteer.last_name = application.last_name
            volunteer.email = application.email
            if application.phone:
                volunteer.phone = application.phone
            if application.notes:
                volunteer.notes = application.notes
            volunteer.status = "active"
            volunteer.updated_at = utcnow()

        project_grant_id = None
        if campaign.organization_id:
            organization = await db.scalar(
                select(Organization).where(Organization.id == campaign.organization_id)
            )
            if organization is not None:
                project_grant_id = organization.zitadel_project_grant_id

        if created_member and user is not None:
            await zitadel.assign_project_role(
                settings.zitadel_project_id,
                user.id,
                "volunteer",
                project_grant_id=project_grant_id,
                org_id=campaign.zitadel_org_id,
            )

        application.status = "approved"
        application.reviewed_by = reviewer_id
        application.reviewed_at = utcnow()
        application.rejection_reason = None
        application.review_context = await self._build_review_context(
            db,
            application,
            approval_delivery=invite_delivery,
        )
        await db.commit()
        await db.refresh(application)
        application.review_context = await self._build_review_context(
            db,
            application,
            approval_delivery=invite_delivery,
        )
        return application

    async def reject_application(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        application_id: uuid.UUID,
        reviewer_id: str,
        rejection_reason: str | None,
    ) -> VolunteerApplication:
        application = await db.scalar(
            select(VolunteerApplication).where(
                VolunteerApplication.id == application_id,
                VolunteerApplication.campaign_id == campaign_id,
            )
        )
        if application is None:
            raise ValueError("Volunteer application not found")
        if application.status == "rejected":
            return application
        if application.status == "approved":
            raise ValueError("Approved applications cannot be rejected")

        application.status = "rejected"
        application.reviewed_by = reviewer_id
        application.reviewed_at = utcnow()
        application.rejection_reason = rejection_reason
        await db.commit()
        await db.refresh(application)
        return application

    async def _resolve_application_user(
        self,
        db: AsyncSession,
        application: VolunteerApplication,
    ) -> User | None:
        if application.applicant_user_id:
            return await db.scalar(
                select(User).where(User.id == application.applicant_user_id)
            )
        return await db.scalar(select(User).where(User.email == application.email))

    async def _build_review_context(
        self,
        db: AsyncSession,
        application: VolunteerApplication,
        *,
        approval_delivery: str | None = None,
    ) -> VolunteerApplicationReviewSnapshot:
        user = await self._resolve_application_user(db, application)
        member = None
        if user is not None:
            member = await db.scalar(
                select(CampaignMember).where(
                    CampaignMember.user_id == user.id,
                    CampaignMember.campaign_id == application.campaign_id,
                )
            )

        result = await db.execute(
            select(VolunteerApplication.status)
            .where(
                VolunteerApplication.campaign_id == application.campaign_id,
                VolunteerApplication.id != application.id,
                or_(
                    *self._match_conditions(
                        email=application.email,
                        applicant_user_id=application.applicant_user_id,
                    )
                ),
            )
            .order_by(VolunteerApplication.created_at.desc())
        )
        prior_statuses = [status for status in result.scalars().all() if status]

        return VolunteerApplicationReviewSnapshot(
            has_existing_account=user is not None,
            existing_member=member is not None,
            existing_member_role=member.role if member is not None else None,
            prior_application_statuses=prior_statuses,
            approval_delivery=approval_delivery,
        )
