"""Unit tests for require_org_role() auth dependency."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    require_org_role,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_UUID = uuid.uuid4()
ZITADEL_ORG_ID = "zitadel-org-test-1"


def _make_user(
    user_id: str = "user-1",
    org_id: str = ZITADEL_ORG_ID,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=CampaignRole.VIEWER,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )


def _make_org_mock(
    org_id: uuid.UUID = ORG_UUID,
    zitadel_org_id: str = ZITADEL_ORG_ID,
):
    org = MagicMock()
    org.id = org_id
    org.zitadel_org_id = zitadel_org_id
    return org


def _setup_db_mock(org=None, member_role: str | None = None):
    """Create mock db session returning org then member_role."""
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[org, member_role])
    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRequireOrgRole:
    """Tests for the require_org_role() dependency factory."""

    @pytest.mark.asyncio
    async def test_org_admin_allows_org_admin(self):
        """org_admin allows user with org_admin role."""
        org = _make_org_mock()
        db = _setup_db_mock(org=org, member_role="org_admin")
        user = _make_user()

        checker = require_org_role("org_admin")
        result = await checker(current_user=user, db=db)

        assert result.id == user.id

    @pytest.mark.asyncio
    async def test_org_admin_allows_org_owner(self):
        """org_admin allows org_owner (owner >= admin)."""
        org = _make_org_mock()
        db = _setup_db_mock(org=org, member_role="org_owner")
        user = _make_user()

        checker = require_org_role("org_admin")
        result = await checker(current_user=user, db=db)

        assert result.id == user.id

    @pytest.mark.asyncio
    async def test_org_owner_denies_org_admin(self):
        """org_owner denies user with org_admin role (403)."""
        org = _make_org_mock()
        db = _setup_db_mock(org=org, member_role="org_admin")
        user = _make_user()

        checker = require_org_role("org_owner")
        with pytest.raises(HTTPException) as exc_info:
            await checker(current_user=user, db=db)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_denies_no_org_member_record(self):
        """Denies user with no OrganizationMember record."""
        org = _make_org_mock()
        db = _setup_db_mock(org=org, member_role=None)
        user = _make_user()

        checker = require_org_role("org_admin")
        with pytest.raises(HTTPException) as exc_info:
            await checker(current_user=user, db=db)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_denies_no_matching_organization(self):
        """Denies user whose JWT org_id has no Organization."""
        db = _setup_db_mock(org=None, member_role=None)
        user = _make_user()

        checker = require_org_role("org_admin")
        with pytest.raises(HTTPException) as exc_info:
            await checker(current_user=user, db=db)

        assert exc_info.value.status_code == 403
        assert "Organization not found" in exc_info.value.detail
