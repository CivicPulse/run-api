"""Tests for JWT validation, JWKS management, and role enforcement."""

from __future__ import annotations

import pytest

from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    JWKSManager,
    _extract_role,
)
from tests.conftest import (
    BAD_PRIVATE_PEM,
    TEST_ISSUER,
    TEST_KID,
    TEST_PROJECT_ID,
    build_jwks,
    make_jwt,
)


class TestJWTValidation:
    """Tests for JWT token validation via JWKSManager."""

    async def test_valid_jwt_returns_claims(self):
        """Valid JWT with correct claims returns decoded claims dict."""
        manager = JWKSManager(issuer=TEST_ISSUER)
        manager._jwks = build_jwks()

        token = make_jwt(sub="user-abc", org_id="org-xyz", role="admin")
        claims = await manager.validate_token(token)

        assert claims["sub"] == "user-abc"
        assert claims["urn:zitadel:iam:user:resourceowner:id"] == "org-xyz"
        assert claims["iss"] == TEST_ISSUER

    async def test_expired_jwt_raises(self):
        """Expired JWT raises an exception."""
        manager = JWKSManager(issuer=TEST_ISSUER)
        manager._jwks = build_jwks()

        token = make_jwt(exp_offset=-3600)  # Expired 1 hour ago

        with pytest.raises((Exception,), match=".*"):  # noqa: B017
            await manager.validate_token(token)

    async def test_invalid_signature_raises(self):
        """JWT signed with wrong key raises an exception."""
        manager = JWKSManager(issuer=TEST_ISSUER)
        manager._jwks = build_jwks()  # Uses PUBLIC_KEY

        # Sign with a different key
        token = make_jwt(private_pem=BAD_PRIVATE_PEM)

        with pytest.raises((Exception,), match=".*"):  # noqa: B017
            await manager.validate_token(token)

    async def test_unknown_kid_triggers_jwks_refresh(self):
        """Unknown key ID triggers JWKS refresh and retry."""
        manager = JWKSManager(issuer=TEST_ISSUER)
        # Start with empty JWKS (no keys)
        manager._jwks = {"keys": []}

        # Mock get_jwks to return proper JWKS on force_refresh
        call_count = 0

        async def mock_get_jwks(force_refresh=False):
            nonlocal call_count
            call_count += 1
            if force_refresh:
                manager._jwks = build_jwks()
                return manager._jwks
            return manager._jwks

        manager.get_jwks = mock_get_jwks

        token = make_jwt(kid=TEST_KID)
        claims = await manager.validate_token(token)

        assert claims["sub"] == "user-123"
        assert call_count >= 2  # Initial fetch + refresh

    async def test_missing_org_claim_jwt(self):
        """JWT without org_id claim is still decodable (validation at user level)."""
        manager = JWKSManager(issuer=TEST_ISSUER)
        manager._jwks = build_jwks()

        token = make_jwt(include_org=False)
        claims = await manager.validate_token(token)

        # Token decodes fine, but org claim is missing
        assert "urn:zitadel:iam:user:resourceowner:id" not in claims


class TestRoleExtraction:
    """Tests for ZITADEL nested role claim extraction."""

    def test_extract_admin_role(self):
        """Extract admin role from nested ZITADEL claim structure."""
        claims = {
            f"urn:zitadel:iam:org:project:{TEST_PROJECT_ID}:roles": {
                "admin": {"org-456": "test.civpulse.org"}
            }
        }
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.ADMIN

    def test_extract_owner_role(self):
        """Extract owner role from claims."""
        claims = {
            f"urn:zitadel:iam:org:project:{TEST_PROJECT_ID}:roles": {
                "owner": {"org-456": "test.civpulse.org"}
            }
        }
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.OWNER

    def test_extract_viewer_role(self):
        """Extract viewer role from claims."""
        claims = {
            f"urn:zitadel:iam:org:project:{TEST_PROJECT_ID}:roles": {
                "viewer": {"org-456": "test.civpulse.org"}
            }
        }
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.VIEWER

    def test_missing_role_defaults_to_viewer(self):
        """Missing role claim defaults to VIEWER."""
        claims = {}
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.VIEWER

    def test_unknown_role_defaults_to_viewer(self):
        """Unknown role name defaults to VIEWER."""
        claims = {
            f"urn:zitadel:iam:org:project:{TEST_PROJECT_ID}:roles": {
                "superduper": {"org-456": "test.civpulse.org"}
            }
        }
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.VIEWER

    def test_extracts_highest_role_when_multiple(self):
        """When multiple roles present, extract the highest."""
        claims = {
            f"urn:zitadel:iam:org:project:{TEST_PROJECT_ID}:roles": {
                "viewer": {"org-456": "test.civpulse.org"},
                "manager": {"org-456": "test.civpulse.org"},
            }
        }
        role = _extract_role(claims, project_id=TEST_PROJECT_ID)
        assert role == CampaignRole.MANAGER


class TestRoleHierarchy:
    """Tests for require_role dependency enforcement."""

    def test_role_ordering(self):
        """Verify role hierarchy ordering."""
        assert CampaignRole.VIEWER < CampaignRole.VOLUNTEER
        assert CampaignRole.VOLUNTEER < CampaignRole.MANAGER
        assert CampaignRole.MANAGER < CampaignRole.ADMIN
        assert CampaignRole.ADMIN < CampaignRole.OWNER

    def test_viewer_allows_all_roles(self):
        """require_role('viewer') allows all roles."""
        for role in CampaignRole:
            assert role >= CampaignRole.VIEWER

    def test_manager_allows_owner_admin_manager(self):
        """require_role('manager') allows owner, admin, manager."""
        min_level = CampaignRole.MANAGER
        assert min_level <= CampaignRole.OWNER
        assert min_level <= CampaignRole.ADMIN
        assert min_level <= CampaignRole.MANAGER
        assert min_level > CampaignRole.VOLUNTEER
        assert min_level > CampaignRole.VIEWER

    def test_owner_rejects_admin_and_below(self):
        """require_role('owner') rejects admin and below."""
        min_level = CampaignRole.OWNER
        assert min_level <= CampaignRole.OWNER
        assert min_level > CampaignRole.ADMIN
        assert min_level > CampaignRole.MANAGER
        assert min_level > CampaignRole.VOLUNTEER
        assert min_level > CampaignRole.VIEWER


class TestAuthenticatedUser:
    """Tests for AuthenticatedUser model."""

    def test_authenticated_user_creation(self):
        """AuthenticatedUser correctly populated from claims data."""
        user = AuthenticatedUser(
            id="user-abc",
            org_id="org-xyz",
            role=CampaignRole.ADMIN,
            email="test@example.com",
            display_name="Test User",
        )
        assert user.id == "user-abc"
        assert user.org_id == "org-xyz"
        assert user.role == CampaignRole.ADMIN
        assert user.email == "test@example.com"
        assert user.display_name == "Test User"

    def test_authenticated_user_optional_fields(self):
        """AuthenticatedUser works with only required fields."""
        user = AuthenticatedUser(
            id="user-abc",
            org_id="org-xyz",
            role=CampaignRole.VIEWER,
        )
        assert user.email is None
        assert user.display_name is None
