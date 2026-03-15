"""Integration tests for Row-Level Security cross-campaign isolation.

These tests verify that RLS policies correctly prevent data access
across campaign boundaries when connected as app_user.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text


@pytest.mark.integration
class TestRLSCampaignIsolation:
    """Verify RLS prevents cross-campaign data access."""

    async def test_campaigns_isolated_by_context(self, app_user_session, two_campaigns):
        """Setting context to Campaign A hides Campaign B."""
        session = app_user_session
        data = two_campaigns

        # Set context to Campaign A
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_a_id"])},
        )

        result = await session.execute(text("SELECT id, name FROM campaigns"))
        rows = result.all()

        campaign_ids = [row[0] for row in rows]
        assert data["campaign_a_id"] in campaign_ids
        assert data["campaign_b_id"] not in campaign_ids

    async def test_campaign_members_isolated(self, app_user_session, two_campaigns):
        """Campaign members only visible for active campaign context."""
        session = app_user_session
        data = two_campaigns

        # Set context to Campaign A
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_a_id"])},
        )

        result = await session.execute(
            text("SELECT user_id, campaign_id FROM campaign_members")
        )
        rows = result.all()

        user_ids = [row[0] for row in rows]
        assert data["user_a_id"] in user_ids
        assert data["user_b_id"] not in user_ids

    async def test_invites_isolated(self, app_user_session, two_campaigns):
        """Invites only visible for active campaign context."""
        session = app_user_session
        data = two_campaigns

        # Set context to Campaign A
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_a_id"])},
        )

        result = await session.execute(text("SELECT email, campaign_id FROM invites"))
        rows = result.all()

        emails = [row[0] for row in rows]
        assert "invite-a@test.com" in emails
        assert "invite-b@test.com" not in emails

    async def test_context_switch_shows_different_data(
        self, app_user_session, two_campaigns
    ):
        """Switching context from A to B changes visible data."""
        session = app_user_session
        data = two_campaigns

        # Start with Campaign A
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_a_id"])},
        )

        result_a = await session.execute(text("SELECT name FROM campaigns"))
        names_a = [row[0] for row in result_a.all()]
        assert "Campaign A" in names_a
        assert "Campaign B" not in names_a

        # Switch to Campaign B
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_b_id"])},
        )

        result_b = await session.execute(text("SELECT name FROM campaigns"))
        names_b = [row[0] for row in result_b.all()]
        assert "Campaign B" in names_b
        assert "Campaign A" not in names_b
