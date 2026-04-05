"""Integration tests for phone bank API endpoints.

Covers the ``GET .../phone-bank-sessions/{session_id}/callers/me``
endpoint introduced by SEC-12 (Plan 73-02). The endpoint is the
server-side source of truth for a caller's check-in status on the
active calling page -- the client's local ``checkedIn`` React
state is untrusted.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.security import CampaignRole
from app.core.time import utcnow
from tests.integration.test_rls_api_smoke import _make_app_for_campaign


@pytest.fixture
async def session_with_caller(superuser_session):
    """Create a campaign + phone bank session + assigned caller.

    Yields a dict containing ids needed to exercise
    ``/callers/me``. The caller row starts with both
    ``check_in_at`` and ``check_out_at`` NULL (never checked in).
    Tests mutate the row in-place via the superuser session to
    cover the three status permutations.
    """
    session = superuser_session
    now = utcnow()

    campaign_id = uuid.uuid4()
    other_campaign_id = uuid.uuid4()
    assigned_user_id = f"user-pbci-a-{uuid.uuid4().hex[:8]}"
    stranger_user_id = f"user-pbci-s-{uuid.uuid4().hex[:8]}"
    org_id = f"org-pbci-{campaign_id.hex[:8]}"
    other_org_id = f"org-pbci-o-{other_campaign_id.hex[:8]}"
    voter_id = uuid.uuid4()
    call_list_id = uuid.uuid4()
    pb_session_id = uuid.uuid4()
    caller_row_id = uuid.uuid4()

    # Users
    for uid, name, email in [
        (
            assigned_user_id,
            "Assigned Caller",
            f"pbci-a-{uuid.uuid4().hex[:6]}@test.com",
        ),
        (
            stranger_user_id,
            "Stranger User",
            f"pbci-s-{uuid.uuid4().hex[:6]}@test.com",
        ),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Campaigns
    for cid, zit, name, created_by in [
        (campaign_id, org_id, "PBCI Campaign", assigned_user_id),
        (other_campaign_id, other_org_id, "PBCI Other Campaign", stranger_user_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns (id, zitadel_org_id, name,"
                " type, status, created_by, created_at,"
                " updated_at) "
                "VALUES (:id, :org_id, :name, 'STATE',"
                " 'ACTIVE', :created_by, :now, :now)"
            ),
            {
                "id": cid,
                "org_id": zit,
                "name": name,
                "created_by": created_by,
                "now": now,
            },
        )

    # Campaign members (volunteer role -- endpoint requires volunteer+)
    for uid, cid in [
        (assigned_user_id, campaign_id),
        (stranger_user_id, campaign_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaign_members"
                " (id, user_id, campaign_id, role, synced_at) "
                "VALUES (:id, :user_id, :campaign_id,"
                " 'volunteer', :now)"
            ),
            {
                "id": uuid.uuid4(),
                "user_id": uid,
                "campaign_id": cid,
                "now": now,
            },
        )

    # Voter (call_list needs at least the referenced rows to pass FKs)
    await session.execute(
        text(
            "INSERT INTO voters (id, campaign_id, source_type,"
            " first_name, last_name, created_at, updated_at) "
            "VALUES (:id, :cid, 'manual', 'Test',"
            " 'Voter', :now, :now)"
        ),
        {"id": voter_id, "cid": campaign_id, "now": now},
    )

    # Call list
    await session.execute(
        text(
            "INSERT INTO call_lists (id, campaign_id, name, status,"
            " total_entries, completed_entries, max_attempts,"
            " claim_timeout_minutes, cooldown_minutes, created_by,"
            " created_at, updated_at) "
            "VALUES (:id, :cid, 'PBCI Call List', 'active',"
            " 0, 0, 3, 30, 60, :uid, :now, :now)"
        ),
        {
            "id": call_list_id,
            "cid": campaign_id,
            "uid": assigned_user_id,
            "now": now,
        },
    )

    # Phone bank session
    await session.execute(
        text(
            "INSERT INTO phone_bank_sessions (id, campaign_id,"
            " call_list_id, name, status, created_by,"
            " created_at, updated_at) "
            "VALUES (:id, :cid, :clid, 'PBCI Session',"
            " 'active', :uid, :now, :now)"
        ),
        {
            "id": pb_session_id,
            "cid": campaign_id,
            "clid": call_list_id,
            "uid": assigned_user_id,
            "now": now,
        },
    )

    # Session caller (never-checked-in state by default)
    await session.execute(
        text(
            "INSERT INTO session_callers (id, session_id, user_id, created_at) "
            "VALUES (:id, :sid, :uid, :now)"
        ),
        {
            "id": caller_row_id,
            "sid": pb_session_id,
            "uid": assigned_user_id,
            "now": now,
        },
    )

    await session.commit()

    yield {
        "campaign_id": campaign_id,
        "org_id": org_id,
        "assigned_user_id": assigned_user_id,
        "stranger_user_id": stranger_user_id,
        "session_id": pb_session_id,
        "caller_row_id": caller_row_id,
    }

    # Teardown
    await session.execute(
        text("DELETE FROM session_callers WHERE session_id = :sid"),
        {"sid": pb_session_id},
    )
    await session.execute(
        text("DELETE FROM phone_bank_sessions WHERE id = :id"),
        {"id": pb_session_id},
    )
    await session.execute(
        text("DELETE FROM call_lists WHERE id = :id"),
        {"id": call_list_id},
    )
    await session.execute(
        text("DELETE FROM voters WHERE id = :id"),
        {"id": voter_id},
    )
    await session.execute(
        text("DELETE FROM campaign_members WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_id, "b": other_campaign_id},
    )
    await session.execute(
        text("DELETE FROM campaigns WHERE id IN (:a, :b)"),
        {"a": campaign_id, "b": other_campaign_id},
    )
    await session.execute(
        text("DELETE FROM users WHERE id IN (:a, :b)"),
        {"a": assigned_user_id, "b": stranger_user_id},
    )
    await session.commit()


def _build_client(
    data: dict,
    user_id: str,
    app_user_engine,
    superuser_engine,
    role: CampaignRole = CampaignRole.VOLUNTEER,
) -> AsyncClient:
    """Build an ASGI AsyncClient acting as ``user_id`` on the fixture campaign."""
    app, _ = _make_app_for_campaign(
        user_id,
        data["org_id"],
        data["campaign_id"],
        app_user_engine,
        superuser_engine=superuser_engine,
        role=role,
    )
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.integration
class TestCallerCheckInStatus:
    """``GET .../sessions/{id}/callers/me`` returns the caller's own status.

    Covers SEC-12 (server-side enforcement of phone bank check-in
    state for the active calling page).
    """

    def _url(self, data: dict) -> str:
        return (
            f"/api/v1/campaigns/{data['campaign_id']}"
            f"/phone-bank-sessions/{data['session_id']}/callers/me"
        )

    async def test_check_in_status_returns_true_when_checked_in(
        self,
        session_with_caller,
        superuser_session,
        app_user_engine,
        superuser_engine,
    ):
        """check_in_at set + check_out_at null -> checked_in=true."""
        data = session_with_caller
        now = utcnow()
        await superuser_session.execute(
            text(
                "UPDATE session_callers"
                " SET check_in_at = :now, check_out_at = NULL"
                " WHERE id = :id"
            ),
            {"now": now, "id": data["caller_row_id"]},
        )
        await superuser_session.commit()

        async with _build_client(
            data, data["assigned_user_id"], app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(self._url(data))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["checked_in"] is True
        assert body["check_in_at"] is not None
        assert body["check_out_at"] is None
        assert body["user_id"] == data["assigned_user_id"]
        assert body["session_id"] == str(data["session_id"])

    async def test_check_in_status_returns_false_when_checked_out(
        self,
        session_with_caller,
        superuser_session,
        app_user_engine,
        superuser_engine,
    ):
        """Assigned caller with both timestamps set -> checked_in=false."""
        data = session_with_caller
        now = utcnow()
        await superuser_session.execute(
            text(
                "UPDATE session_callers"
                " SET check_in_at = :now, check_out_at = :now"
                " WHERE id = :id"
            ),
            {"now": now, "id": data["caller_row_id"]},
        )
        await superuser_session.commit()

        async with _build_client(
            data, data["assigned_user_id"], app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(self._url(data))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["checked_in"] is False
        assert body["check_in_at"] is not None
        assert body["check_out_at"] is not None

    async def test_check_in_status_returns_false_when_never_checked_in(
        self,
        session_with_caller,
        app_user_engine,
        superuser_engine,
    ):
        """Assigned caller with both timestamps NULL -> checked_in=false."""
        data = session_with_caller

        async with _build_client(
            data, data["assigned_user_id"], app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(self._url(data))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["checked_in"] is False
        assert body["check_in_at"] is None
        assert body["check_out_at"] is None

    async def test_check_in_status_returns_404_when_not_assigned(
        self,
        session_with_caller,
        app_user_engine,
        superuser_engine,
    ):
        """Logged-in user who is NOT an assigned caller -> 404."""
        data = session_with_caller

        async with _build_client(
            data, data["stranger_user_id"], app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(self._url(data))

        assert resp.status_code == 404, resp.text

    async def test_check_in_status_requires_authentication(
        self,
        session_with_caller,
    ):
        """Unauthenticated request -> 401.

        The app's real ``get_current_user`` dependency is left in
        place so the request hits the auth layer without a JWT.
        A custom exception handler surfaces HTTPBearer's auto-error
        as 401 Unauthorized ("Not authenticated").
        """
        from app.main import create_app

        data = session_with_caller
        app = create_app()

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            resp = await client.get(self._url(data))

        assert resp.status_code == 401, resp.text
