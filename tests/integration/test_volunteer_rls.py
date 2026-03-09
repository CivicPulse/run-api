"""Integration tests for volunteer management RLS isolation.

Verifies that RLS policies correctly prevent cross-campaign data access
for volunteers, volunteer_tags, volunteer_tag_members, shifts,
shift_volunteers, and volunteer_availability tables.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text


@pytest.fixture
async def two_campaigns_with_volunteer_data(superuser_session):
    """Create two campaigns with volunteer management data for RLS testing.

    Sets up volunteers, tags, tag members, shifts, shift volunteers,
    and availability records for both campaigns.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-va-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-vb-{uuid.uuid4().hex[:8]}"
    volunteer_a_id = uuid.uuid4()
    volunteer_b_id = uuid.uuid4()
    tag_a_id = uuid.uuid4()
    tag_b_id = uuid.uuid4()
    shift_a_id = uuid.uuid4()
    shift_b_id = uuid.uuid4()
    shift_vol_a_id = uuid.uuid4()
    shift_vol_b_id = uuid.uuid4()
    avail_a_id = uuid.uuid4()
    avail_b_id = uuid.uuid4()
    now = datetime.now(UTC)

    # Users
    for uid, name, email in [
        (user_a_id, "Vol User A", f"volA-{uuid.uuid4().hex[:6]}@test.com"),
        (user_b_id, "Vol User B", f"volB-{uuid.uuid4().hex[:6]}@test.com"),
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
        (campaign_a_id, f"org-va-{campaign_a_id.hex[:8]}", "Vol Campaign A", "state", user_a_id),
        (campaign_b_id, f"org-vb-{campaign_b_id.hex[:8]}", "Vol Campaign B", "federal", user_b_id),
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

    # Volunteers (direct campaign_id RLS)
    for vid, cid, fname, uid in [
        (volunteer_a_id, campaign_a_id, "Alice", user_a_id),
        (volunteer_b_id, campaign_b_id, "Bob", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO volunteers (id, campaign_id, first_name, last_name, status, "
                "skills, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, :fname, 'Tester', 'active', "
                "'{}'::varchar[], :uid, :now, :now)"
            ),
            {"id": vid, "cid": cid, "fname": fname, "uid": uid, "now": now},
        )

    # Volunteer tags (direct campaign_id RLS)
    for tid, cid, name in [
        (tag_a_id, campaign_a_id, "Tag A"),
        (tag_b_id, campaign_b_id, "Tag B"),
    ]:
        await session.execute(
            text(
                "INSERT INTO volunteer_tags (id, campaign_id, name, created_at) "
                "VALUES (:id, :cid, :name, :now)"
            ),
            {"id": tid, "cid": cid, "name": name, "now": now},
        )

    # Volunteer tag members (subquery RLS through volunteer_tags)
    for vid, tid in [
        (volunteer_a_id, tag_a_id),
        (volunteer_b_id, tag_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO volunteer_tag_members (volunteer_id, tag_id) "
                "VALUES (:vid, :tid)"
            ),
            {"vid": vid, "tid": tid},
        )

    # Shifts (direct campaign_id RLS)
    for sid, cid, name, uid in [
        (shift_a_id, campaign_a_id, "Shift A", user_a_id),
        (shift_b_id, campaign_b_id, "Shift B", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO shifts (id, campaign_id, name, type, status, start_at, end_at, "
                "max_volunteers, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, :name, 'general', 'scheduled', :start, :end, "
                "10, :uid, :now, :now)"
            ),
            {
                "id": sid,
                "cid": cid,
                "name": name,
                "uid": uid,
                "now": now,
                "start": now + timedelta(days=1),
                "end": now + timedelta(days=1, hours=4),
            },
        )

    # Shift volunteers (subquery RLS through shifts)
    for svid, sid, vid in [
        (shift_vol_a_id, shift_a_id, volunteer_a_id),
        (shift_vol_b_id, shift_b_id, volunteer_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO shift_volunteers (id, shift_id, volunteer_id, status, signed_up_at) "
                "VALUES (:id, :sid, :vid, 'signed_up', :now)"
            ),
            {"id": svid, "sid": sid, "vid": vid, "now": now},
        )

    # Volunteer availability (subquery RLS through volunteers)
    for aid, vid in [
        (avail_a_id, volunteer_a_id),
        (avail_b_id, volunteer_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO volunteer_availability (id, volunteer_id, start_at, end_at) "
                "VALUES (:id, :vid, :start, :end)"
            ),
            {
                "id": aid,
                "vid": vid,
                "start": now + timedelta(days=2),
                "end": now + timedelta(days=2, hours=6),
            },
        )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "volunteer_a_id": volunteer_a_id,
        "volunteer_b_id": volunteer_b_id,
        "tag_a_id": tag_a_id,
        "tag_b_id": tag_b_id,
        "shift_a_id": shift_a_id,
        "shift_b_id": shift_b_id,
        "shift_vol_a_id": shift_vol_a_id,
        "shift_vol_b_id": shift_vol_b_id,
        "avail_a_id": avail_a_id,
        "avail_b_id": avail_b_id,
    }

    # Cleanup (reverse dependency order)
    await session.execute(
        text("DELETE FROM volunteer_availability WHERE volunteer_id IN (:a, :b)"),
        {"a": volunteer_a_id, "b": volunteer_b_id},
    )
    await session.execute(
        text("DELETE FROM shift_volunteers WHERE shift_id IN (:a, :b)"),
        {"a": shift_a_id, "b": shift_b_id},
    )
    await session.execute(
        text("DELETE FROM shifts WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM volunteer_tag_members WHERE tag_id IN (:a, :b)"),
        {"a": tag_a_id, "b": tag_b_id},
    )
    await session.execute(
        text("DELETE FROM volunteer_tags WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM volunteers WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM campaign_members WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM campaigns WHERE id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM users WHERE id IN (:a, :b)"),
        {"a": user_a_id, "b": user_b_id},
    )
    await session.commit()


@pytest.mark.integration
class TestVolunteerRLS:
    """Tests for row-level security isolation across volunteer management tables."""

    async def _set_context(self, session, campaign_id):
        """Helper to set RLS campaign context."""
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(campaign_id)},
        )

    async def test_volunteer_isolation(
        self, app_user_session, two_campaigns_with_volunteer_data
    ):
        """Campaign A cannot see campaign B volunteers."""
        data = two_campaigns_with_volunteer_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM volunteers"))
        ids = [row[0] for row in result.all()]
        assert data["volunteer_a_id"] in ids
        assert data["volunteer_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM volunteers"))
        ids = [row[0] for row in result.all()]
        assert data["volunteer_b_id"] in ids
        assert data["volunteer_a_id"] not in ids

    async def test_shift_isolation(
        self, app_user_session, two_campaigns_with_volunteer_data
    ):
        """Campaign A cannot see campaign B shifts."""
        data = two_campaigns_with_volunteer_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM shifts"))
        ids = [row[0] for row in result.all()]
        assert data["shift_a_id"] in ids
        assert data["shift_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM shifts"))
        ids = [row[0] for row in result.all()]
        assert data["shift_b_id"] in ids
        assert data["shift_a_id"] not in ids

    async def test_volunteer_tag_isolation(
        self, app_user_session, two_campaigns_with_volunteer_data
    ):
        """Tags isolated by campaign via direct campaign_id RLS."""
        data = two_campaigns_with_volunteer_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM volunteer_tags"))
        ids = [row[0] for row in result.all()]
        assert data["tag_a_id"] in ids
        assert data["tag_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM volunteer_tags"))
        ids = [row[0] for row in result.all()]
        assert data["tag_b_id"] in ids
        assert data["tag_a_id"] not in ids

    async def test_shift_volunteer_isolation(
        self, app_user_session, two_campaigns_with_volunteer_data
    ):
        """Shift signups isolated via subquery through shifts.campaign_id."""
        data = two_campaigns_with_volunteer_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM shift_volunteers"))
        ids = [row[0] for row in result.all()]
        assert data["shift_vol_a_id"] in ids
        assert data["shift_vol_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM shift_volunteers"))
        ids = [row[0] for row in result.all()]
        assert data["shift_vol_b_id"] in ids
        assert data["shift_vol_a_id"] not in ids

    async def test_volunteer_availability_isolation(
        self, app_user_session, two_campaigns_with_volunteer_data
    ):
        """Availability isolated via subquery through volunteers.campaign_id."""
        data = two_campaigns_with_volunteer_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM volunteer_availability"))
        ids = [row[0] for row in result.all()]
        assert data["avail_a_id"] in ids
        assert data["avail_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM volunteer_availability"))
        ids = [row[0] for row in result.all()]
        assert data["avail_b_id"] in ids
        assert data["avail_a_id"] not in ids
