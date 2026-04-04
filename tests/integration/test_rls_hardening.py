"""Integration tests for Phase 72 Row-Level Security hardening.

Covers SEC-05 (FORCE ROW LEVEL SECURITY missing on ``campaigns``,
``campaign_members``, ``users``) and SEC-06 (``organizations`` /
``organization_members`` have no RLS policies at all) per
CODEBASE-REVIEW-2026-04-04 C5 and C6.

These tests are authored BEFORE migration 026_rls_hardening exists,
so they fail until Plan 02 ships the migration. The intent is to
make the migration's red-to-green transition observable.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.rls import set_campaign_context

pytestmark = pytest.mark.integration


async def _session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return factory()


async def test_force_on_campaigns(app_user_engine, two_orgs_with_campaigns):
    """FORCE RLS on campaigns hides other campaigns from app_user.

    RED: fails until migration 026_rls_hardening applies FORCE RLS.
    """
    data = two_orgs_with_campaigns
    async with await _session(app_user_engine) as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        result = await s.execute(text("SELECT id FROM campaigns"))
        ids = {row[0] for row in result.all()}
        assert data["campaign_a_id"] in ids
        assert data["campaign_b_id"] not in ids


async def test_force_on_campaign_members(app_user_engine, two_orgs_with_campaigns):
    """FORCE RLS on campaign_members hides other campaigns' members.

    RED: fails until migration 026_rls_hardening applies FORCE RLS.
    """
    data = two_orgs_with_campaigns
    async with await _session(app_user_engine) as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        result = await s.execute(text("SELECT campaign_id FROM campaign_members"))
        campaign_ids = {row[0] for row in result.all()}
        assert data["campaign_a_id"] in campaign_ids
        assert data["campaign_b_id"] not in campaign_ids


async def test_force_on_users(app_user_engine, two_orgs_with_campaigns):
    """FORCE RLS on users restricts to users linked via campaign_members.

    RED: fails until migration 026_rls_hardening applies FORCE RLS and a
    scoping policy on users.
    """
    data = two_orgs_with_campaigns
    async with await _session(app_user_engine) as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        result = await s.execute(text("SELECT id FROM users"))
        user_ids = {row[0] for row in result.all()}
        assert data["user_a_id"] in user_ids
        assert data["user_b_id"] not in user_ids


async def test_organizations_cross_campaign_blocked(
    app_user_engine, two_orgs_with_campaigns
):
    """SEC-06: app_user under Campaign A cannot see Org B.

    RED: fails until migration 026_rls_hardening enables RLS + policy on
    organizations. Pre-migration, organizations has no RLS at all and
    returns both orgs.
    """
    data = two_orgs_with_campaigns
    async with await _session(app_user_engine) as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        result = await s.execute(text("SELECT id FROM organizations"))
        org_ids = {row[0] for row in result.all()}
        assert data["org_a_id"] in org_ids
        assert data["org_b_id"] not in org_ids


async def test_organization_members_cross_campaign_blocked(
    app_user_engine, two_orgs_with_campaigns
):
    """SEC-06: app_user under Campaign A cannot see Org B's members.

    RED: fails until migration 026_rls_hardening enables RLS + policy on
    organization_members.
    """
    data = two_orgs_with_campaigns
    async with await _session(app_user_engine) as s:
        await set_campaign_context(s, str(data["campaign_a_id"]))
        result = await s.execute(
            text("SELECT organization_id FROM organization_members")
        )
        org_ids = {row[0] for row in result.all()}
        assert data["org_a_id"] in org_ids
        assert data["org_b_id"] not in org_ids


async def test_organizations_empty_without_context(
    app_user_engine, two_orgs_with_campaigns
):
    """Organizations returns zero rows when campaign context is the nil UUID.

    RED: fails until migration 026_rls_hardening gates organizations on
    a valid campaign context. Pre-migration, there is no policy so both
    organizations are returned.
    """
    async with await _session(app_user_engine) as s:
        # Nil UUID context -- no set_campaign_context(real_id) call made
        await set_campaign_context(s, str(uuid.UUID(int=0)))
        result = await s.execute(text("SELECT id FROM organizations"))
        rows = result.all()
        assert rows == []


async def test_migration_reversible(app_user_engine, two_orgs_with_campaigns):
    """Placeholder: Plan 02 asserts alembic upgrade / downgrade cleanliness.

    RED: deliberately unimplemented so Plan 02's migration author has a
    gate they must fill in. See 72-02-PLAN.md.
    """
    pytest.fail(
        "Not yet implemented -- filled in by Plan 02 "
        "(migration 026_rls_hardening reversibility check)."
    )
