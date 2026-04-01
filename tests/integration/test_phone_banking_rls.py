"""Integration tests for phone banking RLS isolation.

Verifies that RLS policies correctly prevent cross-campaign data access
for call_lists, call_list_entries, phone_bank_sessions, session_callers,
and do_not_call tables.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.time import utcnow


@pytest.fixture
async def two_campaigns_with_phone_banking_data(superuser_session):
    """Create two campaigns with phone banking data for RLS testing.

    Sets up call lists, entries, sessions, callers, and DNC entries
    for both campaigns.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-pa-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-pb-{uuid.uuid4().hex[:8]}"
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    call_list_a_id = uuid.uuid4()
    call_list_b_id = uuid.uuid4()
    entry_a_id = uuid.uuid4()
    entry_b_id = uuid.uuid4()
    session_a_id = uuid.uuid4()
    session_b_id = uuid.uuid4()
    caller_a_id = uuid.uuid4()
    caller_b_id = uuid.uuid4()
    dnc_a_id = uuid.uuid4()
    dnc_b_id = uuid.uuid4()
    now = utcnow()

    # Users
    for uid, name, email in [
        (user_a_id, "Phone User A", f"phoneA-{uuid.uuid4().hex[:6]}@test.com"),
        (user_b_id, "Phone User B", f"phoneB-{uuid.uuid4().hex[:6]}@test.com"),
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
            f"org-pa-{campaign_a_id.hex[:8]}",
            "Phone Campaign A",
            "STATE",
            user_a_id,
        ),
        (
            campaign_b_id,
            f"org-pb-{campaign_b_id.hex[:8]}",
            "Phone Campaign B",
            "FEDERAL",
            user_b_id,
        ),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns (id, zitadel_org_id, name,"
                " type, status, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :org_id, :name, :type,"
                " 'ACTIVE', :created_by, :now, :now)"
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
                "INSERT INTO voters (id, campaign_id,"
                " source_type, first_name, last_name,"
                " created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'Test',"
                " 'Voter', :now, :now)"
            ),
            {"id": vid, "cid": cid, "now": now},
        )

    # Call lists (direct campaign_id RLS)
    for clid, cid, name, uid in [
        (call_list_a_id, campaign_a_id, "Call List A", user_a_id),
        (call_list_b_id, campaign_b_id, "Call List B", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO call_lists (id, campaign_id,"
                " name, status, total_entries,"
                " completed_entries, max_attempts,"
                " claim_timeout_minutes,"
                " cooldown_minutes, created_by,"
                " created_at, updated_at) "
                "VALUES (:id, :cid, :name, 'active',"
                " 1, 0, 3, 30, 60, :uid, :now, :now)"
            ),
            {"id": clid, "cid": cid, "name": name, "uid": uid, "now": now},
        )

    # Call list entries (subquery RLS through call_lists)
    for eid, clid, vid in [
        (entry_a_id, call_list_a_id, voter_a_id),
        (entry_b_id, call_list_b_id, voter_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO call_list_entries (id,"
                " call_list_id, voter_id,"
                " priority_score, phone_numbers,"
                " status, attempt_count) "
                "VALUES (:id, :clid, :vid, 50,"
                " '[]'::jsonb, 'available', 0)"
            ),
            {"id": eid, "clid": clid, "vid": vid},
        )

    # Phone bank sessions (direct campaign_id RLS)
    for sid, cid, clid, name, uid in [
        (session_a_id, campaign_a_id, call_list_a_id, "Session A", user_a_id),
        (session_b_id, campaign_b_id, call_list_b_id, "Session B", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO phone_bank_sessions (id,"
                " campaign_id, call_list_id, name,"
                " status, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :cid, :clid, :name,"
                " 'active', :uid, :now, :now)"
            ),
            {"id": sid, "cid": cid, "clid": clid, "name": name, "uid": uid, "now": now},
        )

    # Session callers (subquery RLS through phone_bank_sessions)
    for scid, sid, uid in [
        (caller_a_id, session_a_id, user_a_id),
        (caller_b_id, session_b_id, user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO session_callers (id, session_id, user_id, created_at) "
                "VALUES (:id, :sid, :uid, :now)"
            ),
            {"id": scid, "sid": sid, "uid": uid, "now": now},
        )

    # DNC entries (direct campaign_id RLS)
    for did, cid, phone, uid in [
        (dnc_a_id, campaign_a_id, "5550001111", user_a_id),
        (dnc_b_id, campaign_b_id, "5550002222", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO do_not_call (id, campaign_id,"
                " phone_number, reason, added_by,"
                " added_at) "
                "VALUES (:id, :cid, :phone, 'manual',"
                " :uid, :now)"
            ),
            {"id": did, "cid": cid, "phone": phone, "uid": uid, "now": now},
        )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "call_list_a_id": call_list_a_id,
        "call_list_b_id": call_list_b_id,
        "entry_a_id": entry_a_id,
        "entry_b_id": entry_b_id,
        "session_a_id": session_a_id,
        "session_b_id": session_b_id,
        "caller_a_id": caller_a_id,
        "caller_b_id": caller_b_id,
        "dnc_a_id": dnc_a_id,
        "dnc_b_id": dnc_b_id,
    }

    # Cleanup (reverse dependency order)
    await session.execute(
        text("DELETE FROM do_not_call WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM session_callers WHERE session_id IN (:a, :b)"),
        {"a": session_a_id, "b": session_b_id},
    )
    await session.execute(
        text("DELETE FROM phone_bank_sessions WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM call_list_entries WHERE call_list_id IN (:a, :b)"),
        {"a": call_list_a_id, "b": call_list_b_id},
    )
    await session.execute(
        text("DELETE FROM call_lists WHERE campaign_id IN (:a, :b)"),
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
class TestPhoneBankingRLS:
    """Tests for row-level security isolation across phone banking tables."""

    async def _set_context(self, session, campaign_id):
        """Helper to set RLS campaign context."""
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(campaign_id)},
        )

    async def test_call_list_rls_isolation(
        self, app_user_session, two_campaigns_with_phone_banking_data
    ):
        """Campaign A can't see campaign B call lists."""
        data = two_campaigns_with_phone_banking_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM call_lists"))
        ids = [row[0] for row in result.all()]
        assert data["call_list_a_id"] in ids
        assert data["call_list_b_id"] not in ids

        await self._set_context(session, data["campaign_b_id"])
        result = await session.execute(text("SELECT id FROM call_lists"))
        ids = [row[0] for row in result.all()]
        assert data["call_list_b_id"] in ids
        assert data["call_list_a_id"] not in ids

    async def test_call_list_entry_rls_isolation(
        self, app_user_session, two_campaigns_with_phone_banking_data
    ):
        """Entries isolated via call_list parent."""
        data = two_campaigns_with_phone_banking_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM call_list_entries"))
        ids = [row[0] for row in result.all()]
        assert data["entry_a_id"] in ids
        assert data["entry_b_id"] not in ids

    async def test_phone_bank_session_rls_isolation(
        self, app_user_session, two_campaigns_with_phone_banking_data
    ):
        """Sessions isolated by campaign_id."""
        data = two_campaigns_with_phone_banking_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM phone_bank_sessions"))
        ids = [row[0] for row in result.all()]
        assert data["session_a_id"] in ids
        assert data["session_b_id"] not in ids

    async def test_session_caller_rls_isolation(
        self, app_user_session, two_campaigns_with_phone_banking_data
    ):
        """Callers isolated via session parent."""
        data = two_campaigns_with_phone_banking_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM session_callers"))
        ids = [row[0] for row in result.all()]
        assert data["caller_a_id"] in ids
        assert data["caller_b_id"] not in ids

    async def test_dnc_rls_isolation(
        self, app_user_session, two_campaigns_with_phone_banking_data
    ):
        """DNC entries isolated by campaign_id."""
        data = two_campaigns_with_phone_banking_data
        session = app_user_session

        await self._set_context(session, data["campaign_a_id"])
        result = await session.execute(text("SELECT id FROM do_not_call"))
        ids = [row[0] for row in result.all()]
        assert data["dnc_a_id"] in ids
        assert data["dnc_b_id"] not in ids
