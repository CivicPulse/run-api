"""Unit tests for OrganizationMember model and OrgRole enum."""

from __future__ import annotations

from enum import StrEnum

from app.core.security import (
    CampaignRole,
    ORG_ROLE_CAMPAIGN_EQUIVALENT,
    ORG_ROLE_LEVELS,
    OrgRole,
)
from app.models.organization_member import OrganizationMember


class TestOrganizationMemberModel:
    """Tests for OrganizationMember SQLAlchemy model."""

    def test_tablename(self):
        assert OrganizationMember.__tablename__ == "organization_members"

    def test_unique_constraint_user_organization(self):
        constraints = OrganizationMember.__table_args__
        unique_names = [
            c.name for c in constraints if hasattr(c, "name") and "uq_" in (c.name or "")
        ]
        assert "uq_user_organization" in unique_names

    def test_check_constraint_role_valid(self):
        constraints = OrganizationMember.__table_args__
        check_names = [
            c.name for c in constraints if hasattr(c, "name") and "ck_" in (c.name or "")
        ]
        assert "ck_organization_members_role_valid" in check_names

    def test_has_all_fields(self):
        columns = {c.name for c in OrganizationMember.__table__.columns}
        expected = {
            "id",
            "user_id",
            "organization_id",
            "role",
            "invited_by",
            "joined_at",
            "created_at",
            "updated_at",
        }
        assert expected.issubset(columns), f"Missing columns: {expected - columns}"


class TestOrgRole:
    """Tests for OrgRole StrEnum."""

    def test_org_owner_value(self):
        assert OrgRole.ORG_OWNER == "org_owner"

    def test_org_admin_value(self):
        assert OrgRole.ORG_ADMIN == "org_admin"

    def test_is_str_enum(self):
        assert issubclass(OrgRole, StrEnum)


class TestOrgRoleMappings:
    """Tests for ORG_ROLE_CAMPAIGN_EQUIVALENT and ORG_ROLE_LEVELS."""

    def test_org_admin_maps_to_campaign_admin(self):
        assert ORG_ROLE_CAMPAIGN_EQUIVALENT[OrgRole.ORG_ADMIN] == CampaignRole.ADMIN

    def test_org_owner_maps_to_campaign_owner(self):
        assert ORG_ROLE_CAMPAIGN_EQUIVALENT[OrgRole.ORG_OWNER] == CampaignRole.OWNER

    def test_org_role_levels_admin(self):
        assert ORG_ROLE_LEVELS[OrgRole.ORG_ADMIN] == 0

    def test_org_role_levels_owner(self):
        assert ORG_ROLE_LEVELS[OrgRole.ORG_OWNER] == 1
