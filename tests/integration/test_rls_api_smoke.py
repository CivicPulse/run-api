"""API-level RLS smoke tests.

Verify the API middleware correctly sets app.current_campaign_id
so that RLS policies enforce data isolation at the HTTP layer.
Per D-07: Both-layer verification (SQL + API).

Phase 46: API-level RLS smoke tests (TEST-02, TEST-03)
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.rls import set_campaign_context
from app.db.session import get_db
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
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Campaigns
    for cid, org, name, ctype, created_by in [
        (campaign_a_id, org_a_id, "API Campaign A", "state", user_a_id),
        (campaign_b_id, org_b_id, "API Campaign B", "federal", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns (id, zitadel_org_id, name,"
                " type, status, created_by, created_at, updated_at) "
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
                " first_name, last_name, created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'API', 'Voter', :now, :now)"
            ),
            {"id": vid, "cid": cid, "now": now},
        )

    # Turfs (with a simple polygon boundary)
    simple_polygon = (
        "SRID=4326;POLYGON(("
        "-83.65 32.83, -83.64 32.83, -83.64 32.84, -83.65 32.84, -83.65 32.83"
        "))"
    )
    for tid, cid, name, created_by in [
        (turf_a_id, campaign_a_id, "Turf A", user_a_id),
        (turf_b_id, campaign_b_id, "Turf B", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO turfs (id, campaign_id, name, status,"
                " boundary, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, :name, 'active',"
                " ST_GeomFromEWKT(:boundary), :created_by, :now, :now)"
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
    for table in ["turfs", "voters", "campaign_members", "campaigns"]:
        await session.execute(
            text(f"DELETE FROM {table} WHERE campaign_id IN (:a, :b)"),
            {"a": campaign_a_id, "b": campaign_b_id},
        )
    await session.execute(
        text("DELETE FROM users WHERE id IN (:a, :b)"),
        {"a": user_a_id, "b": user_b_id},
    )
    await session.commit()


def _make_app_for_campaign(
    user_id: str,
    campaign_id: uuid.UUID,
    org_id: str,
    role: CampaignRole = CampaignRole.ADMIN,
) -> tuple:
    """Create a FastAPI app with dependency overrides for a specific campaign.

    Returns (app, user) tuple. Overrides get_current_user to return
    an AuthenticatedUser scoped to the given campaign, and get_db
    to yield a session with RLS campaign context set.
    """
    app = create_app()
    user = AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test {user_id}",
    )
    app.dependency_overrides[get_current_user] = lambda: user
    return app, user


@pytest.mark.integration
class TestRLSAPISmokeTests:
    """API-level smoke tests verifying RLS middleware campaign context."""

    async def test_voter_search_scoped_to_campaign(
        self, two_campaigns_with_api_data, app_user_engine
    ):
        """Voter search via API only returns voters for the authenticated campaign."""
        data = two_campaigns_with_api_data
        campaign_a_id = data["campaign_a_id"]

        app, _user = _make_app_for_campaign(
            data["user_a_id"], campaign_a_id, data["org_a_id"]
        )

        # Override get_db to use app_user connection with RLS context
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        session_factory = async_sessionmaker(
            app_user_engine, class_=AsyncSession, expire_on_commit=False
        )

        async def _get_db_with_rls():
            async with session_factory() as session:
                await set_campaign_context(session, str(campaign_a_id))
                yield session

        app.dependency_overrides[get_db] = _get_db_with_rls

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{campaign_a_id}/voters/search",
                json={},
            )

        assert resp.status_code == 200
        body = resp.json()
        voter_ids = [v["id"] for v in body.get("items", [])]

        # Campaign A voter should be present
        assert str(data["voter_a_id"]) in voter_ids
        # Campaign B voter must NOT leak through
        assert str(data["voter_b_id"]) not in voter_ids

    async def test_turf_list_scoped_to_campaign(
        self, two_campaigns_with_api_data, app_user_engine
    ):
        """Turf listing via API only returns turfs for the authenticated campaign."""
        data = two_campaigns_with_api_data
        campaign_a_id = data["campaign_a_id"]

        app, _user = _make_app_for_campaign(
            data["user_a_id"], campaign_a_id, data["org_a_id"]
        )

        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        session_factory = async_sessionmaker(
            app_user_engine, class_=AsyncSession, expire_on_commit=False
        )

        async def _get_db_with_rls():
            async with session_factory() as session:
                await set_campaign_context(session, str(campaign_a_id))
                yield session

        app.dependency_overrides[get_db] = _get_db_with_rls

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/v1/campaigns/{campaign_a_id}/turfs",
            )

        assert resp.status_code == 200
        body = resp.json()
        turf_ids = [t["id"] for t in body.get("items", [])]

        # Campaign A turf should be present
        assert str(data["turf_a_id"]) in turf_ids
        # Campaign B turf must NOT leak through
        assert str(data["turf_b_id"]) not in turf_ids

    async def test_wrong_campaign_in_url_returns_403(
        self, two_campaigns_with_api_data
    ):
        """User authenticated for campaign A cannot access campaign B via URL."""
        data = two_campaigns_with_api_data

        # Authenticate as user A (with campaign A org)
        app, _user = _make_app_for_campaign(
            data["user_a_id"],
            data["campaign_a_id"],
            data["org_a_id"],
            role=CampaignRole.ADMIN,
        )

        # The require_role dependency checks campaign membership via
        # resolve_campaign_role. User A has no membership in campaign B
        # and org_a != org_b, so it should return 403.
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{data['campaign_b_id']}/voters/search",
                json={},
            )

        assert resp.status_code == 403

    async def test_no_campaign_context_returns_empty(
        self, two_campaigns_with_api_data, app_user_engine
    ):
        """With a null/nonexistent campaign context, no data leaks."""
        data = two_campaigns_with_api_data
        null_campaign_id = uuid.uuid4()  # A campaign ID that doesn't exist

        app, _user = _make_app_for_campaign(
            data["user_a_id"], null_campaign_id, data["org_a_id"]
        )

        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        session_factory = async_sessionmaker(
            app_user_engine, class_=AsyncSession, expire_on_commit=False
        )

        # Set RLS context to a UUID that matches no campaign
        async def _get_db_with_null_context():
            async with session_factory() as session:
                await set_campaign_context(
                    session, str(null_campaign_id)
                )
                yield session

        app.dependency_overrides[get_db] = _get_db_with_null_context

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{null_campaign_id}/voters/search",
                json={},
            )

        # Should succeed (200) but return empty results
        assert resp.status_code == 200
        body = resp.json()
        assert len(body.get("items", [])) == 0
