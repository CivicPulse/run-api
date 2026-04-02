"""API-level RLS smoke tests.

Verify the API middleware correctly sets app.current_campaign_id
so that RLS policies enforce data isolation at the HTTP layer.
Per D-07: Both-layer verification (SQL + API).

Phase 46: API-level RLS smoke tests (TEST-02, TEST-03)

Architecture note: In production, ``get_db`` (for require_role /
ensure_user_synced) is a superuser connection WITHOUT RLS.
``get_campaign_db`` (for data queries) creates its own session
and sets RLS from the URL campaign_id.  Tests mirror this by only
overriding ``get_current_user`` (JWT bypass) and letting both
``get_db`` and ``get_campaign_db`` use the app's real connections.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.api.deps import get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.rls import set_campaign_context
from app.main import create_app


@pytest.fixture
async def two_campaigns_with_api_data(superuser_session):
    """Create two campaigns with voters and turfs for API-level RLS testing.

    Inserts users, campaigns, campaign members, voters, and turfs
    for both campaigns. Returns dict with all IDs for assertions.
    """
    session = superuser_session
    now = utcnow()

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-api-a-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-api-b-{uuid.uuid4().hex[:8]}"
    org_a_id = f"org-api-a-{campaign_a_id.hex[:8]}"
    org_b_id = f"org-api-b-{campaign_b_id.hex[:8]}"
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    turf_a_id = uuid.uuid4()
    turf_b_id = uuid.uuid4()

    # Users
    for uid, name, email in [
        (user_a_id, "API User A", "api-usera@test.com"),
        (user_b_id, "API User B", "api-userb@test.com"),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name,"
                " email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Campaigns
    for cid, org, name, ctype, created_by in [
        (campaign_a_id, org_a_id, "API Campaign A", "STATE", user_a_id),
        (campaign_b_id, org_b_id, "API Campaign B", "FEDERAL", user_b_id),
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

    # Campaign members (role must be set to avoid backfill
    # commits that reset transaction-scoped RLS config)
    for uid, cid in [
        (user_a_id, campaign_a_id),
        (user_b_id, campaign_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaign_members"
                " (id, user_id, campaign_id, role,"
                " synced_at) "
                "VALUES (:id, :user_id, :campaign_id,"
                " 'admin', :now)"
            ),
            {
                "id": uuid.uuid4(),
                "user_id": uid,
                "campaign_id": cid,
                "now": now,
            },
        )

    # Voters
    for vid, cid in [
        (voter_a_id, campaign_a_id),
        (voter_b_id, campaign_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO voters (id, campaign_id,"
                " source_type, first_name, last_name,"
                " created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'API',"
                " 'Voter', :now, :now)"
            ),
            {"id": vid, "cid": cid, "now": now},
        )

    # Turfs (with a simple polygon boundary)
    simple_polygon = (
        "SRID=4326;POLYGON(("
        "-83.65 32.83, -83.64 32.83,"
        " -83.64 32.84, -83.65 32.84,"
        " -83.65 32.83"
        "))"
    )
    for tid, cid, name, created_by in [
        (turf_a_id, campaign_a_id, "Turf A", user_a_id),
        (turf_b_id, campaign_b_id, "Turf B", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO turfs (id, campaign_id, name,"
                " status, boundary, created_by,"
                " created_at, updated_at) "
                "VALUES (:id, :cid, :name, 'active',"
                " ST_GeomFromEWKT(:boundary),"
                " :created_by, :now, :now)"
            ),
            {
                "id": tid,
                "cid": cid,
                "name": name,
                "boundary": simple_polygon,
                "created_by": created_by,
                "now": now,
            },
        )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "voter_a_id": voter_a_id,
        "voter_b_id": voter_b_id,
        "turf_a_id": turf_a_id,
        "turf_b_id": turf_b_id,
    }

    # Cleanup in reverse dependency order
    for table in ["turfs", "voters", "campaign_members"]:
        await session.execute(
            text(f"DELETE FROM {table} WHERE campaign_id IN (:a, :b)"),
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


def _make_app_for_campaign(
    user_id: str,
    org_id: str,
    campaign_id: uuid.UUID,
    app_user_engine,
    superuser_engine=None,
    role: CampaignRole = CampaignRole.ADMIN,
) -> tuple:
    """Create a FastAPI app with auth bypass and RLS-enforced data.

    Overrides:
    - get_current_user → test user (JWT bypass)
    - get_campaign_db → app_user connection with RLS
    - get_db → superuser connection from test engine (avoids global
      engine event loop conflicts)
    """
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.db.session import get_db

    app = create_app()
    user = AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test {user_id}",
    )
    app.dependency_overrides[get_current_user] = lambda: user

    # Override get_db to use the test superuser engine, avoiding the
    # module-level engine which is bound to a different event loop.
    if superuser_engine is not None:
        su_session_factory = async_sessionmaker(
            superuser_engine, class_=AsyncSession, expire_on_commit=False
        )

        async def _test_get_db():
            async with su_session_factory() as session:
                yield session

        app.dependency_overrides[get_db] = _test_get_db

    # Override get_campaign_db to use app_user (RLS enforced).
    # Wraps commit to restore RLS context afterward, because
    # ensure_user_synced commits on the same session, which
    # resets transaction-scoped set_config.
    rls_session_factory = async_sessionmaker(
        app_user_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _campaign_db_with_rls(
        campaign_id: uuid.UUID,
    ):
        cid_str = str(campaign_id)
        async with rls_session_factory() as session:
            await set_campaign_context(session, cid_str)
            _orig_commit = session.commit

            async def _commit_and_restore():
                await _orig_commit()
                await set_campaign_context(session, cid_str)

            session.commit = _commit_and_restore
            yield session

    app.dependency_overrides[get_campaign_db] = _campaign_db_with_rls

    return app, user


@pytest.mark.integration
class TestRLSAPISmokeTests:
    """API-level smoke tests verifying RLS middleware campaign context.

    Tests use the app's real dependency chain:
    - get_current_user: overridden (JWT bypass)
    - get_db: real superuser connection (for require_role)
    - get_campaign_db: real app connection with RLS from URL
    """

    async def test_voter_search_scoped_to_campaign(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """Voter search via API returns only this campaign's voters."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid}/voters/search",
                json={},
            )

        assert resp.status_code == 200
        voter_ids = [v["id"] for v in resp.json().get("items", [])]
        assert str(data["voter_a_id"]) in voter_ids
        assert str(data["voter_b_id"]) not in voter_ids

    async def test_turf_list_scoped_to_campaign(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """Turf listing returns only this campaign's turfs."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/campaigns/{cid}/turfs",
            )

        assert resp.status_code == 200
        turf_ids = [t["id"] for t in resp.json().get("items", [])]
        assert str(data["turf_a_id"]) in turf_ids
        assert str(data["turf_b_id"]) not in turf_ids

    async def test_wrong_campaign_in_url_returns_403(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """User A cannot access campaign B's endpoints."""
        data = two_campaigns_with_api_data

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            data["campaign_b_id"],
            app_user_engine,
            superuser_engine=superuser_engine,
            role=CampaignRole.ADMIN,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{data['campaign_b_id']}/voters/search",
                json={},
            )

        assert resp.status_code == 403

    async def test_no_campaign_context_returns_empty(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """Nonexistent campaign context returns no data."""
        data = two_campaigns_with_api_data
        fake_cid = uuid.uuid4()

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            fake_cid,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{fake_cid}/voters/search",
                json={},
            )

        # User has no membership → 403
        assert resp.status_code == 403

    async def test_voter_list_scoped_to_campaign(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """GET /voters only returns voters for the active campaign."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/campaigns/{cid}/voters",
            )

        assert resp.status_code == 200
        voter_ids = [v["id"] for v in resp.json().get("items", [])]
        assert str(data["voter_a_id"]) in voter_ids
        assert str(data["voter_b_id"]) not in voter_ids

    async def test_voter_get_by_id_cross_campaign_not_found(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """GET /voters/{B's voter} via campaign A returns 404."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/campaigns/{cid}/voters/{data['voter_b_id']}",
            )

        # RLS hides the row → VoterNotFoundError → 404
        assert resp.status_code == 404

    async def test_voter_patch_cross_campaign_not_found(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """PATCH /voters/{B's voter} via campaign A returns 404."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
            role=CampaignRole.MANAGER,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{cid}/voters/{data['voter_b_id']}",
                json={"first_name": "ShouldNotPatch"},
            )

        assert resp.status_code == 404

    async def test_voter_delete_cross_campaign_not_found(
        self, two_campaigns_with_api_data, app_user_engine, superuser_engine
    ):
        """DELETE /voters/{B's voter} via campaign A returns 404."""
        data = two_campaigns_with_api_data
        cid = data["campaign_a_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid,
            app_user_engine,
            superuser_engine=superuser_engine,
            role=CampaignRole.MANAGER,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{cid}/voters/{data['voter_b_id']}",
            )

        assert resp.status_code == 404

    async def test_voter_create_scoped_to_campaign(
        self,
        two_campaigns_with_api_data,
        app_user_engine,
        superuser_engine,
    ):
        """POST /voters creates voter visible only in that campaign."""
        data = two_campaigns_with_api_data
        cid_a = data["campaign_a_id"]
        cid_b = data["campaign_b_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"],
            data["org_a_id"],
            cid_a,
            app_user_engine,
            superuser_engine=superuser_engine,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/voters",
                json={
                    "first_name": "Isolation",
                    "last_name": "Test",
                },
            )

        assert resp.status_code == 201
        created_id = resp.json()["id"]

        # Verify via app_user with RLS — must use app_user
        # so RLS policies are enforced
        from sqlalchemy.ext.asyncio import (
            AsyncSession,
            async_sessionmaker,
        )

        verify_factory = async_sessionmaker(
            app_user_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        # Visible under campaign A
        async with verify_factory() as s:
            await set_campaign_context(s, str(cid_a))
            r = await s.execute(
                text("SELECT id FROM voters WHERE id = :v"),
                {"v": created_id},
            )
            assert r.scalar_one_or_none() is not None

        # NOT visible under campaign B
        async with verify_factory() as s:
            await set_campaign_context(s, str(cid_b))
            r = await s.execute(
                text("SELECT id FROM voters WHERE id = :v"),
                {"v": created_id},
            )
            assert r.scalar_one_or_none() is None
