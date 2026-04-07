"""Organization service -- org-scoped queries."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User
from app.schemas.org import OrgResponse, OrgUpdate, TwilioOrgStatus
from app.services.twilio_config import TwilioConfigService


@dataclass(slots=True)
class OrgUpdateResult:
    """Updated org plus any changed field markers."""

    org: Organization
    name_changed: bool = False
    twilio_changed: bool = False


class OrgService:
    """Service for org-level data access.

    Phase 72 (SEC-06): organizations and organization_members now enforce RLS
    scoped via app.current_campaign_id -> campaigns.organization_id subquery.
    This service runs with Depends(get_db) which currently connects as the
    postgres superuser, so RLS policies are bypassed at runtime. When the
    API switches to the app_user role (tracked as follow-up tech debt),
    callers MUST set a campaign context before querying organization data,
    or use an elevated-privilege session for cross-org admin operations.
    All queries filter by organization_id explicitly as defense-in-depth.
    """

    def __init__(self) -> None:
        self._twilio = TwilioConfigService()

    async def get_org(self, db: AsyncSession, org_id: uuid.UUID) -> Organization | None:
        return await db.scalar(select(Organization).where(Organization.id == org_id))

    def build_org_response(self, org: Organization) -> OrgResponse:
        """Build the org response including redacted Twilio status."""
        return OrgResponse(
            id=org.id,
            name=org.name,
            zitadel_org_id=org.zitadel_org_id,
            created_at=org.created_at,
            twilio=TwilioOrgStatus(
                account_sid=org.twilio_account_sid,
                account_sid_configured=bool(org.twilio_account_sid),
                account_sid_updated_at=org.twilio_account_sid_updated_at,
                auth_token_configured=bool(org.twilio_auth_token_encrypted),
                auth_token_hint=self._twilio.auth_token_hint(
                    org.twilio_auth_token_last4
                ),
                auth_token_updated_at=org.twilio_auth_token_updated_at,
                ready=self._twilio.readiness(
                    account_sid=org.twilio_account_sid,
                    auth_token_encrypted=org.twilio_auth_token_encrypted,
                ),
            ),
        )

    async def update_org_details(
        self,
        db: AsyncSession,
        org: Organization,
        body: OrgUpdate,
    ) -> OrgUpdateResult:
        """Apply org metadata and partial Twilio config updates safely."""
        result = OrgUpdateResult(org=org)
        now = utcnow()

        if body.name is not None and body.name != org.name:
            org.name = body.name
            result.name_changed = True

        if body.twilio is not None:
            twilio_fields = body.twilio.model_fields_set
            if "account_sid" in twilio_fields and body.twilio.account_sid is not None:
                new_sid = body.twilio.account_sid.strip()
                if new_sid != org.twilio_account_sid:
                    org.twilio_account_sid = new_sid
                    org.twilio_account_sid_updated_at = now
                    result.twilio_changed = True

            if "auth_token" in twilio_fields and body.twilio.auth_token is not None:
                encrypted = self._twilio.encrypt_auth_token(
                    body.twilio.auth_token.get_secret_value()
                )
                org.twilio_auth_token_encrypted = encrypted.ciphertext
                org.twilio_auth_token_key_id = encrypted.key_id
                org.twilio_auth_token_last4 = encrypted.last4
                org.twilio_auth_token_updated_at = now
                result.twilio_changed = True

        if result.name_changed or result.twilio_changed:
            await db.commit()
            await db.refresh(org)

        return result

    async def list_campaigns(self, db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
        """List campaigns with member counts for an org."""
        member_count_sq = (
            select(
                CampaignMember.campaign_id,
                func.count().label("member_count"),
            )
            .group_by(CampaignMember.campaign_id)
            .subquery()
        )
        stmt = (
            select(
                Campaign,
                func.coalesce(member_count_sq.c.member_count, 0).label("member_count"),
            )
            .outerjoin(
                member_count_sq,
                Campaign.id == member_count_sq.c.campaign_id,
            )
            .where(Campaign.organization_id == org_id)
            .order_by(Campaign.created_at.desc())
        )
        results = await db.execute(stmt)
        return [{"campaign": row[0], "member_count": row[1]} for row in results.all()]

    async def list_members(self, db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
        """List org-level members with user details."""
        stmt = (
            select(OrganizationMember, User)
            .join(User, OrganizationMember.user_id == User.id)
            .where(OrganizationMember.organization_id == org_id)
            .order_by(OrganizationMember.created_at.desc())
        )
        results = await db.execute(stmt)
        return [{"member": row[0], "user": row[1]} for row in results.all()]

    async def list_members_with_campaign_roles(
        self, db: AsyncSession, org_id: uuid.UUID
    ) -> list[dict]:
        """List org members with their per-campaign roles."""
        # First get org members with user details
        members = await self.list_members(db, org_id)
        # Get all campaigns in this org
        campaigns = await db.execute(
            select(Campaign.id, Campaign.name).where(Campaign.organization_id == org_id)
        )
        campaign_list = campaigns.all()
        # For each member, find their campaign memberships
        for member_dict in members:
            user_id = member_dict["member"].user_id
            cm_stmt = select(CampaignMember.campaign_id, CampaignMember.role).where(
                CampaignMember.user_id == user_id,
                CampaignMember.campaign_id.in_([c.id for c in campaign_list]),
            )
            cm_results = await db.execute(cm_stmt)
            campaign_roles = []
            for cm in cm_results.all():
                campaign_name = next(
                    (c.name for c in campaign_list if c.id == cm.campaign_id),
                    "",
                )
                campaign_roles.append(
                    {
                        "campaign_id": cm.campaign_id,
                        "campaign_name": campaign_name,
                        "role": cm.role or "viewer",
                    }
                )
            member_dict["campaign_roles"] = campaign_roles
        return members

    async def add_member_to_campaign(
        self,
        db: AsyncSession,
        org_id: uuid.UUID,
        campaign_id: uuid.UUID,
        user_id: str,
        role: str,
    ) -> CampaignMember:
        """Add an existing org member to a campaign."""
        # Verify campaign belongs to org
        campaign = await db.scalar(
            select(Campaign).where(
                Campaign.id == campaign_id,
                Campaign.organization_id == org_id,
            )
        )
        if not campaign:
            raise ValueError("Campaign not found in this organization")
        # Verify user is an org member
        org_member = await db.scalar(
            select(OrganizationMember).where(
                OrganizationMember.user_id == user_id,
                OrganizationMember.organization_id == org_id,
            )
        )
        if not org_member:
            raise ValueError("User is not a member of this organization")
        # Check for existing campaign membership
        existing = await db.scalar(
            select(CampaignMember).where(
                CampaignMember.user_id == user_id,
                CampaignMember.campaign_id == campaign_id,
            )
        )
        if existing:
            raise ValueError("User is already a member of this campaign")
        cm = CampaignMember(
            user_id=user_id,
            campaign_id=campaign_id,
            role=role,
        )
        db.add(cm)
        await db.commit()
        await db.refresh(cm)
        return cm
