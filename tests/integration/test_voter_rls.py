"""Integration tests for RLS isolation across all voter-related tables.

Verifies that RLS policies correctly prevent cross-campaign data access
for voters, voter_tags, voter_tag_members, voter_lists, voter_list_members,
voter_interactions, voter_phones, voter_emails, voter_addresses,
import_jobs, and field_mapping_templates.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text


@pytest.fixture
async def two_campaigns_with_voter_data(superuser_session):
    """Create two campaigns with full voter data for RLS testing.

    Sets up voters, tags, lists, interactions, contacts, import jobs,
    and field mapping templates for both campaigns.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-va-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-vb-{uuid.uuid4().hex[:8]}"
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    tag_a_id = uuid.uuid4()
    tag_b_id = uuid.uuid4()
    list_a_id = uuid.uuid4()
    list_b_id = uuid.uuid4()
    now = datetime.now(UTC)

    # Users
    for uid, name, email in [
        (user_a_id, "Voter User A", "vuserA@test.com"),
        (user_b_id, "Voter User B", "vuserB@test.com"),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Campaigns
    for cid, org, name, ctype, created_by in [
        (campaign_a_id, f"org-va-{campaign_a_id.hex[:8]}", "Voter Campaign A", "state", user_a_id),
        (campaign_b_id, f"org-vb-{campaign_b_id.hex[:8]}", "Voter Campaign B", "federal", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns (id, zitadel_org_id, name, type, status, created_by, created_at, updated_at) "
                "VALUES (:id, :org_id, :name, :type, 'active', :created_by, :now, :now)"
            ),
            {"id": cid, "org_id": org, "name": name, "type": ctype, "created_by": created_by, "now": now},
        )

    # Campaign members
    for uid, cid in [(user_a_id, campaign_a_id), (user_b_id, campaign_b_id)]:
        await session.execute(
            text(
                "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
                "VALUES (:id, :user_id, :campaign_id, :now)"
            ),
            {"id": uuid.uuid4(), "user_id": uid, "campaign_id": cid, "now": now},
        )

    # Voters
    for vid, cid in [(voter_a_id, campaign_a_id), (voter_b_id, campaign_b_id)]:
        await session.execute(
            text(
                "INSERT INTO voters (id, campaign_id, source_type, first_name, last_name, created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'Test', 'Voter', :now, :now)"
            ),
            {"id": vid, "cid": cid, "now": now},
        )

    # Voter tags
    for tid, cid, name in [(tag_a_id, campaign_a_id, "Tag A"), (tag_b_id, campaign_b_id, "Tag B")]:
        await session.execute(
            text(
                "INSERT INTO voter_tags (id, campaign_id, name, created_at) "
                "VALUES (:id, :cid, :name, :now)"
            ),
            {"id": tid, "cid": cid, "name": name, "now": now},
        )

    # Voter tag members
    for vid, tid in [(voter_a_id, tag_a_id), (voter_b_id, tag_b_id)]:
        await session.execute(
            text(
                "INSERT INTO voter_tag_members (voter_id, tag_id, assigned_at) "
                "VALUES (:vid, :tid, :now)"
            ),
            {"vid": vid, "tid": tid, "now": now},
        )

    # Voter lists
    for lid, cid, name in [(list_a_id, campaign_a_id, "List A"), (list_b_id, campaign_b_id, "List B")]:
        await session.execute(
            text(
                "INSERT INTO voter_lists (id, campaign_id, name, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, :name, :created_by, :now, :now)"
            ),
            {"id": lid, "cid": cid, "name": name, "created_by": user_a_id if cid == campaign_a_id else user_b_id, "now": now},
        )

    # Voter list members
    for vid, lid in [(voter_a_id, list_a_id), (voter_b_id, list_b_id)]:
        await session.execute(
            text(
                "INSERT INTO voter_list_members (voter_id, list_id, added_at) "
                "VALUES (:vid, :lid, :now)"
            ),
            {"vid": vid, "lid": lid, "now": now},
        )

    # Voter interactions
    for vid, cid, uid in [(voter_a_id, campaign_a_id, user_a_id), (voter_b_id, campaign_b_id, user_b_id)]:
        await session.execute(
            text(
                "INSERT INTO voter_interactions (id, campaign_id, voter_id, type, payload, created_by, created_at) "
                "VALUES (:id, :cid, :vid, 'note', '{}'::jsonb, :uid, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "vid": vid, "uid": uid, "now": now},
        )

    # Voter phones
    for vid, cid, val in [(voter_a_id, campaign_a_id, "+15551111"), (voter_b_id, campaign_b_id, "+15552222")]:
        await session.execute(
            text(
                "INSERT INTO voter_phones (id, campaign_id, voter_id, value, type, is_primary, source, created_at, updated_at) "
                "VALUES (:id, :cid, :vid, :val, 'cell', true, 'manual', :now, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "vid": vid, "val": val, "now": now},
        )

    # Voter emails
    for vid, cid, val in [(voter_a_id, campaign_a_id, "a@test.com"), (voter_b_id, campaign_b_id, "b@test.com")]:
        await session.execute(
            text(
                "INSERT INTO voter_emails (id, campaign_id, voter_id, value, type, is_primary, source, created_at, updated_at) "
                "VALUES (:id, :cid, :vid, :val, 'home', true, 'manual', :now, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "vid": vid, "val": val, "now": now},
        )

    # Voter addresses
    for vid, cid in [(voter_a_id, campaign_a_id), (voter_b_id, campaign_b_id)]:
        await session.execute(
            text(
                "INSERT INTO voter_addresses (id, campaign_id, voter_id, address_line1, city, state, zip_code, type, is_primary, source, created_at, updated_at) "
                "VALUES (:id, :cid, :vid, '123 Main St', 'Springfield', 'IL', '62701', 'home', true, 'manual', :now, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "vid": vid, "now": now},
        )

    # Import jobs
    for cid, uid in [(campaign_a_id, user_a_id), (campaign_b_id, user_b_id)]:
        await session.execute(
            text(
                "INSERT INTO import_jobs (id, campaign_id, file_name, file_path, status, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, 'test.csv', 's3://test', 'pending', :uid, :now, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "uid": uid, "now": now},
        )

    # Field mapping templates (campaign-scoped, not NULL campaign_id)
    for cid in [campaign_a_id, campaign_b_id]:
        await session.execute(
            text(
                "INSERT INTO field_mapping_templates (id, campaign_id, name, mapping, created_at, updated_at) "
                "VALUES (:id, :cid, 'Template', '{}'::jsonb, :now, :now)"
            ),
            {"id": uuid.uuid4(), "cid": cid, "now": now},
        )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "voter_a_id": voter_a_id,
        "voter_b_id": voter_b_id,
        "tag_a_id": tag_a_id,
        "tag_b_id": tag_b_id,
        "list_a_id": list_a_id,
        "list_b_id": list_b_id,
    }

    # Cleanup (reverse dependency order)
    for table in [
        "field_mapping_templates",
        "import_jobs",
        "voter_addresses",
        "voter_emails",
        "voter_phones",
        "voter_interactions",
        "voter_list_members",
        "voter_lists",
        "voter_tag_members",
        "voter_tags",
        "voters",
        "campaign_members",
        "campaigns",
    ]:
        if table in ("voter_tag_members", "voter_list_members"):
            # These don't have campaign_id directly
            continue
        await session.execute(
            text(f"DELETE FROM {table} WHERE campaign_id IN (:a, :b)"),
            {"a": campaign_a_id, "b": campaign_b_id},
        )
    # Clean join tables via parent
    await session.execute(
        text("DELETE FROM voter_tag_members WHERE tag_id IN (:a, :b)"),
        {"a": tag_a_id, "b": tag_b_id},
    )
    await session.execute(
        text("DELETE FROM voter_list_members WHERE list_id IN (:a, :b)"),
        {"a": list_a_id, "b": list_b_id},
    )
    await session.execute(
        text("DELETE FROM users WHERE id IN (:a, :b)"),
        {"a": user_a_id, "b": user_b_id},
    )
    await session.commit()


@pytest.mark.integration
class TestVoterRLSIsolation:
    """Verify RLS isolates all voter-related tables by campaign context."""

    async def _set_context(self, session, campaign_id):
        """Helper to set RLS campaign context."""
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(campaign_id)},
        )

    async def test_voters_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voters only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM voters"))
        ids = [row[0] for row in result.all()]

        assert data["voter_a_id"] in ids
        assert data["voter_b_id"] not in ids

    async def test_voter_tags_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter tags only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id, name FROM voter_tags"))
        rows = result.all()

        tag_ids = [row[0] for row in rows]
        assert data["tag_a_id"] in tag_ids
        assert data["tag_b_id"] not in tag_ids

    async def test_voter_tag_members_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter tag members only visible via RLS on parent tag."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT voter_id FROM voter_tag_members"))
        voter_ids = [row[0] for row in result.all()]

        assert data["voter_a_id"] in voter_ids
        assert data["voter_b_id"] not in voter_ids

    async def test_voter_lists_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter lists only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id, name FROM voter_lists"))
        rows = result.all()

        list_ids = [row[0] for row in rows]
        assert data["list_a_id"] in list_ids
        assert data["list_b_id"] not in list_ids

    async def test_voter_list_members_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter list members only visible via RLS on parent list."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT voter_id FROM voter_list_members"))
        voter_ids = [row[0] for row in result.all()]

        assert data["voter_a_id"] in voter_ids
        assert data["voter_b_id"] not in voter_ids

    async def test_voter_interactions_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter interactions only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT voter_id FROM voter_interactions"))
        voter_ids = [row[0] for row in result.all()]

        assert data["voter_a_id"] in voter_ids
        assert data["voter_b_id"] not in voter_ids

    async def test_voter_phones_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter phones only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT value FROM voter_phones"))
        values = [row[0] for row in result.all()]

        assert "+15551111" in values
        assert "+15552222" not in values

    async def test_voter_emails_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter emails only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT value FROM voter_emails"))
        values = [row[0] for row in result.all()]

        assert "a@test.com" in values
        assert "b@test.com" not in values

    async def test_voter_addresses_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Voter addresses only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT voter_id FROM voter_addresses"))
        voter_ids = [row[0] for row in result.all()]

        assert data["voter_a_id"] in voter_ids
        assert data["voter_b_id"] not in voter_ids

    async def test_import_jobs_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Import jobs only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT campaign_id FROM import_jobs"))
        campaign_ids = [row[0] for row in result.all()]

        assert data["campaign_a_id"] in campaign_ids
        assert data["campaign_b_id"] not in campaign_ids

    async def test_field_mapping_templates_isolated(
        self, app_user_session, two_campaigns_with_voter_data
    ):
        """Field mapping templates only visible for active campaign context."""
        data = two_campaigns_with_voter_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(
            text("SELECT campaign_id FROM field_mapping_templates WHERE campaign_id IS NOT NULL")
        )
        campaign_ids = [row[0] for row in result.all()]

        assert data["campaign_a_id"] in campaign_ids
        assert data["campaign_b_id"] not in campaign_ids
