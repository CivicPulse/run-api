"""Unit tests for resolve_campaign_role function."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

from app.core.security import CampaignRole, resolve_campaign_role

USER_ID = "user-test-1"
CAMPAIGN_ID = uuid.uuid4()
USER_ORG_ID = "org-123"
OTHER_ORG_ID = "org-other-456"
ORG_UUID = uuid.uuid4()


def _make_member(role: str | None = "admin") -> MagicMock:
    """Create a mock CampaignMember with optional role."""
    m = MagicMock()
    m.role = role
    return m


def _make_campaign(
    organization_id: uuid.UUID | None = None,
    zitadel_org_id: str | None = None,
) -> MagicMock:
    """Create a mock Campaign."""
    c = MagicMock()
    c.organization_id = organization_id
    c.zitadel_org_id = zitadel_org_id
    return c


class TestResolveCampaignRole:
    """Tests for resolve_campaign_role resolution logic."""

    async def test_explicit_db_role_override(self):
        """Member has role 'admin' in DB -- returns CampaignRole.ADMIN.

        After the org role change, the function selects full CampaignMember
        row, then checks member.role.  We also need to supply the org
        lookup side-effects (campaign, org zitadel_org_id, org_member_role).
        """
        member = _make_member("admin")
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember lookup
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                None,  # OrganizationMember.role (none)
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.ADMIN

    async def test_cross_org_denied(self):
        """No DB role, user_org_id differs from campaign's org -- returns None."""
        campaign = _make_campaign(zitadel_org_id=OTHER_ORG_ID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=USER_ORG_ID,
        )

        assert result is None

    async def test_org_model_lookup_with_org_member(self):
        """Campaign has organization_id, user is org_admin -- returns ADMIN."""
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_admin",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.ADMIN

    async def test_legacy_campaign_fallback_no_org_member(self):
        """Campaign has no organization_id, no org member -- deny (D-07)."""
        campaign = _make_campaign(zitadel_org_id=USER_ORG_ID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup (no organization_id)
                # No Organization.zitadel_org_id lookup (skipped, org_id is None)
                # No OrganizationMember.role lookup (skipped)
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VOLUNTEER,
            user_org_id=USER_ORG_ID,
        )

        # D-07: JWT fallback removed. No CampaignMember AND no OrgMember = deny
        assert result is None

    async def test_no_user_org_id_no_campaign_member(self):
        """user_org_id is None, no CampaignMember -- deny (D-07)."""
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=None)  # CampaignMember lookup

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=None,
        )

        # D-07: JWT fallback removed
        assert result is None

    async def test_invalid_db_role_treated_as_viewer(self):
        """Member has role 'bogus' in DB -- treated as VIEWER (not fall through)."""
        member = _make_member("bogus")

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember with invalid role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.MANAGER,
            user_org_id=USER_ORG_ID,
        )

        # Invalid role is now caught and treated as VIEWER
        assert result == CampaignRole.VIEWER

    # -- New org role resolution tests --

    async def test_org_admin_no_campaign_member_returns_admin(self):
        """D-06: org_admin with NO CampaignMember returns ADMIN."""
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_admin",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.ADMIN

    async def test_org_owner_no_campaign_member_returns_owner(self):
        """D-03: org_owner with NO CampaignMember returns OWNER."""
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_owner",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.OWNER

    async def test_additive_campaign_viewer_org_admin_returns_admin(self):
        """D-08: CampaignMember(VIEWER) + org_admin = ADMIN (max wins)."""
        member = _make_member("viewer")
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember with VIEWER role
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_admin",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.ADMIN

    async def test_additive_campaign_owner_org_admin_returns_owner(self):
        """D-08: CampaignMember(OWNER) + org_admin = OWNER (campaign higher)."""
        member = _make_member("owner")
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember with OWNER role
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_admin",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.OWNER

    async def test_additive_campaign_admin_org_owner_returns_owner(self):
        """D-08: CampaignMember(ADMIN) + org_owner = OWNER (org higher wins)."""
        member = _make_member("admin")
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember with ADMIN role
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                "org_owner",  # OrganizationMember.role
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.OWNER

    async def test_no_campaign_member_no_org_member_deny(self):
        """D-07: No CampaignMember AND no OrganizationMember returns None."""
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                None,  # OrganizationMember.role (not a member)
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=USER_ORG_ID,
        )

        assert result is None

    async def test_null_campaign_member_role_treated_as_viewer(self):
        """NULL CampaignMember.role treated as VIEWER for backward compat."""
        member = _make_member(None)  # role is None
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                member,  # CampaignMember exists but role is None
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id
                None,  # No org member
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.MANAGER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.VIEWER

    async def test_org_admin_different_org_denied(self):
        """org_admin accessing campaign in DIFFERENT org returns None."""
        campaign = _make_campaign(organization_id=ORG_UUID)

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember lookup (no record)
                campaign,  # Campaign lookup
                OTHER_ORG_ID,  # Organization.zitadel_org_id (different!)
                # OrganizationMember lookup skipped (org doesn't match)
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=USER_ORG_ID,
        )

        assert result is None
