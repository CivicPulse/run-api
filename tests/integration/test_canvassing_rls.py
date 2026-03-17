"""Integration tests for RLS isolation on all Phase 3 canvassing tables.

Verifies that RLS policies correctly prevent cross-campaign data access
for turfs, walk_lists, walk_list_entries, walk_list_canvassers,
survey_scripts, survey_questions, and survey_responses.

Also verifies the voter geom column exists and can be populated.

Requires: PostgreSQL with PostGIS running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.time import utcnow


@pytest.fixture
async def two_campaigns_with_canvassing_data(superuser_session):
    """Create two campaigns with canvassing data for RLS testing.

    Sets up turfs, walk lists, entries, canvassers, survey scripts,
    questions, and responses for both campaigns.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-ca-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-cb-{uuid.uuid4().hex[:8]}"
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    turf_a_id = uuid.uuid4()
    turf_b_id = uuid.uuid4()
    walk_list_a_id = uuid.uuid4()
    walk_list_b_id = uuid.uuid4()
    entry_a_id = uuid.uuid4()
    entry_b_id = uuid.uuid4()
    script_a_id = uuid.uuid4()
    script_b_id = uuid.uuid4()
    question_a_id = uuid.uuid4()
    question_b_id = uuid.uuid4()
    response_a_id = uuid.uuid4()
    response_b_id = uuid.uuid4()
    now = utcnow()

    # Users
    for uid, name, email in [
        (user_a_id, "Canvass User A", "canvassA@test.com"),
        (user_b_id, "Canvass User B", "canvassB@test.com"),
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
        (
            campaign_a_id,
            f"org-ca-{campaign_a_id.hex[:8]}",
            "Canvass Campaign A",
            "state",
            user_a_id,
        ),
        (
            campaign_b_id,
            f"org-cb-{campaign_b_id.hex[:8]}",
            "Canvass Campaign B",
            "federal",
            user_b_id,
        ),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns (id, zitadel_org_id, name,"
                " type, status, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :org_id, :name, :type,"
                " 'active', :created_by, :now, :now)"
            ),
            {
                "id": cid,
                "org_id": org,
                "name": name,
                "type": ctype,
                "created_by": created_by,
                "now": now,
            },
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
                "INSERT INTO voters (id, campaign_id, source_type,"
                " first_name, last_name, created_at,"
                " updated_at) "
                "VALUES (:id, :cid, 'manual', 'Test',"
                " 'Canvasser', :now, :now)"
            ),
            {"id": vid, "cid": cid, "now": now},
        )

    # Turfs (PostGIS polygon -- simple square)
    polygon_wkt = "SRID=4326;POLYGON((-90 40, -90 41, -89 41, -89 40, -90 40))"
    for tid, cid, name in [
        (turf_a_id, campaign_a_id, "Turf A"),
        (turf_b_id, campaign_b_id, "Turf B"),
    ]:
        await session.execute(
            text(
                "INSERT INTO turfs (id, campaign_id, name,"
                " status, boundary, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :cid, :name, 'active',"
                " ST_GeomFromEWKT(:geom), :uid, :now,"
                " :now)"
            ),
            {
                "id": tid,
                "cid": cid,
                "name": name,
                "geom": polygon_wkt,
                "uid": user_a_id if cid == campaign_a_id else user_b_id,
                "now": now,
            },
        )

    # Walk lists
    for wid, cid, tid, name in [
        (walk_list_a_id, campaign_a_id, turf_a_id, "Walk A"),
        (walk_list_b_id, campaign_b_id, turf_b_id, "Walk B"),
    ]:
        await session.execute(
            text(
                "INSERT INTO walk_lists (id, campaign_id,"
                " turf_id, name, status, created_by,"
                " created_at, updated_at) "
                "VALUES (:id, :cid, :tid, :name,"
                " 'pending', :uid, :now, :now)"
            ),
            {
                "id": wid,
                "cid": cid,
                "tid": tid,
                "name": name,
                "uid": user_a_id if cid == campaign_a_id else user_b_id,
                "now": now,
            },
        )

    # Walk list entries (child table -- subquery RLS through walk_lists)
    for eid, wid, vid in [
        (entry_a_id, walk_list_a_id, voter_a_id),
        (entry_b_id, walk_list_b_id, voter_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO walk_list_entries (id,"
                " walk_list_id, voter_id, position,"
                " status) "
                "VALUES (:id, :wid, :vid, 1, 'pending')"
            ),
            {"id": eid, "wid": wid, "vid": vid},
        )

    # Walk list canvassers (child table -- subquery RLS through walk_lists)
    for wid, uid in [
        (walk_list_a_id, user_a_id),
        (walk_list_b_id, user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO walk_list_canvassers (id,"
                " walk_list_id, user_id, assigned_at) "
                "VALUES (:id, :wid, :uid, :now)"
            ),
            {"id": uuid.uuid4(), "wid": wid, "uid": uid, "now": now},
        )

    # Survey scripts
    for sid, cid, title in [
        (script_a_id, campaign_a_id, "Script A"),
        (script_b_id, campaign_b_id, "Script B"),
    ]:
        await session.execute(
            text(
                "INSERT INTO survey_scripts (id, campaign_id,"
                " title, status, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :cid, :title, 'active',"
                " :uid, :now, :now)"
            ),
            {
                "id": sid,
                "cid": cid,
                "title": title,
                "uid": user_a_id if cid == campaign_a_id else user_b_id,
                "now": now,
            },
        )

    # Survey questions (child table -- subquery RLS through survey_scripts)
    for qid, sid, text_val in [
        (question_a_id, script_a_id, "Question A?"),
        (question_b_id, script_b_id, "Question B?"),
    ]:
        await session.execute(
            text(
                "INSERT INTO survey_questions (id, script_id,"
                " position, question_text,"
                " question_type) "
                "VALUES (:id, :sid, 1, :text,"
                " 'free_text')"
            ),
            {"id": qid, "sid": sid, "text": text_val},
        )

    # Survey responses (direct campaign_id RLS)
    for rid, cid, sid, qid, vid, uid in [
        (
            response_a_id,
            campaign_a_id,
            script_a_id,
            question_a_id,
            voter_a_id,
            user_a_id,
        ),
        (
            response_b_id,
            campaign_b_id,
            script_b_id,
            question_b_id,
            voter_b_id,
            user_b_id,
        ),
    ]:
        await session.execute(
            text(
                "INSERT INTO survey_responses (id,"
                " campaign_id, script_id, question_id,"
                " voter_id, answer_value, answered_by,"
                " answered_at) "
                "VALUES (:id, :cid, :sid, :qid, :vid,"
                " 'test answer', :uid, :now)"
            ),
            {
                "id": rid,
                "cid": cid,
                "sid": sid,
                "qid": qid,
                "vid": vid,
                "uid": uid,
                "now": now,
            },
        )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "voter_a_id": voter_a_id,
        "voter_b_id": voter_b_id,
        "turf_a_id": turf_a_id,
        "turf_b_id": turf_b_id,
        "walk_list_a_id": walk_list_a_id,
        "walk_list_b_id": walk_list_b_id,
        "entry_a_id": entry_a_id,
        "entry_b_id": entry_b_id,
        "script_a_id": script_a_id,
        "script_b_id": script_b_id,
        "question_a_id": question_a_id,
        "question_b_id": question_b_id,
        "response_a_id": response_a_id,
        "response_b_id": response_b_id,
    }

    # Cleanup (reverse dependency order)
    await session.execute(
        text("DELETE FROM survey_responses WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM survey_questions WHERE script_id IN (:a, :b)"),
        {"a": script_a_id, "b": script_b_id},
    )
    await session.execute(
        text("DELETE FROM survey_scripts WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM walk_list_canvassers WHERE walk_list_id IN (:a, :b)"),
        {"a": walk_list_a_id, "b": walk_list_b_id},
    )
    await session.execute(
        text("DELETE FROM walk_list_entries WHERE walk_list_id IN (:a, :b)"),
        {"a": walk_list_a_id, "b": walk_list_b_id},
    )
    await session.execute(
        text("DELETE FROM walk_lists WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM turfs WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM voters WHERE campaign_id IN (:a, :b)"),
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
class TestCanvassingRLSIsolation:
    """Verify RLS isolates all Phase 3 canvassing tables by campaign context."""

    async def _set_context(self, session, campaign_id):
        """Helper to set RLS campaign context."""
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(campaign_id)},
        )

    async def test_turf_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Turfs only visible for active campaign context."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        # Campaign A context: only Turf A visible
        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id, name FROM turfs"))
        rows = result.all()
        ids = [row[0] for row in rows]
        assert data["turf_a_id"] in ids
        assert data["turf_b_id"] not in ids

        # Campaign B context: only Turf B visible
        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id, name FROM turfs"))
        rows = result.all()
        ids = [row[0] for row in rows]
        assert data["turf_b_id"] in ids
        assert data["turf_a_id"] not in ids

    async def test_walk_list_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Walk lists only visible for active campaign context."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM walk_lists"))
        ids = [row[0] for row in result.all()]
        assert data["walk_list_a_id"] in ids
        assert data["walk_list_b_id"] not in ids

    async def test_walk_list_entries_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Walk list entries isolated via subquery RLS through walk_lists."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM walk_list_entries"))
        ids = [row[0] for row in result.all()]
        assert data["entry_a_id"] in ids
        assert data["entry_b_id"] not in ids

    async def test_walk_list_canvassers_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Walk list canvassers isolated via subquery RLS through walk_lists."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT user_id FROM walk_list_canvassers"))
        user_ids = [row[0] for row in result.all()]
        assert data["user_a_id"] in user_ids
        assert data["user_b_id"] not in user_ids

    async def test_survey_script_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Survey scripts only visible for active campaign context."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM survey_scripts"))
        ids = [row[0] for row in result.all()]
        assert data["script_a_id"] in ids
        assert data["script_b_id"] not in ids

    async def test_survey_questions_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Survey questions isolated via subquery RLS through survey_scripts."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM survey_questions"))
        ids = [row[0] for row in result.all()]
        assert data["question_a_id"] in ids
        assert data["question_b_id"] not in ids

    async def test_survey_responses_rls_isolation(
        self, app_user_session, two_campaigns_with_canvassing_data
    ):
        """Survey responses isolated by direct campaign_id RLS."""
        data = two_campaigns_with_canvassing_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM survey_responses"))
        ids = [row[0] for row in result.all()]
        assert data["response_a_id"] in ids
        assert data["response_b_id"] not in ids

    async def test_voter_geom_column_exists(self, superuser_session):
        """Verify voter geom column exists in the voters table schema."""
        session = superuser_session

        result = await session.execute(
            text(
                "SELECT column_name, udt_name FROM information_schema.columns "
                "WHERE table_name = 'voters' AND column_name = 'geom'"
            )
        )
        row = result.one_or_none()
        assert row is not None, "geom column should exist on voters table"
        assert row[1] == "geometry", (
            f"geom column type should be geometry, got {row[1]}"
        )
