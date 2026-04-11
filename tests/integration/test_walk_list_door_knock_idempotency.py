"""Integration tests locking OFFLINE-01 client_uuid idempotency contract.

Plan 110-02: POST /door-knocks must accept a required ``client_uuid`` field
and dedupe on ``(campaign_id, client_uuid)`` so that a replayed offline-
queue item produces a 409 Conflict instead of a duplicate row. Race safety
is provided by a DB UNIQUE index, not an app-level check-then-insert.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.security import CampaignRole
from app.core.time import utcnow
from tests.integration.test_rls_api_smoke import _make_app_for_campaign


@pytest.fixture
async def idempotency_fixture(superuser_session):
    """Seed a campaign + walk list + entry + voter for idempotency tests."""
    session = superuser_session
    now = utcnow()

    campaign_id = uuid.uuid4()
    user_id = f"user-idem-{uuid.uuid4().hex[:8]}"
    org_id = f"org-idem-{campaign_id.hex[:8]}"
    voter_id = uuid.uuid4()
    turf_id = uuid.uuid4()
    walk_list_id = uuid.uuid4()
    entry_id = uuid.uuid4()

    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_id,
            "name": "Idem User",
            "email": f"idem-{user_id}@test.com",
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaigns (id, zitadel_org_id, name,"
            " type, status, created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, 'Idem Campaign', 'STATE',"
            " 'ACTIVE', :created_by, :now, :now)"
        ),
        {
            "id": campaign_id,
            "org_id": org_id,
            "created_by": user_id,
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaign_members"
            " (id, user_id, campaign_id, role, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, 'volunteer', :now)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_id,
            "campaign_id": campaign_id,
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO voters (id, campaign_id, source_type,"
            " first_name, last_name, created_at, updated_at) "
            "VALUES (:id, :cid, 'manual', 'Idem', 'Voter', :now, :now)"
        ),
        {"id": voter_id, "cid": campaign_id, "now": now},
    )
    polygon_wkt = "SRID=4326;POLYGON((-90 40, -90 41, -89 41, -89 40, -90 40))"
    await session.execute(
        text(
            "INSERT INTO turfs (id, campaign_id, name, status, boundary,"
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'Idem Turf', 'active',"
            " ST_GeomFromEWKT(:geom), :uid, :now, :now)"
        ),
        {
            "id": turf_id,
            "cid": campaign_id,
            "geom": polygon_wkt,
            "uid": user_id,
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO walk_lists (id, campaign_id, turf_id, name,"
            " created_by, created_at) "
            "VALUES (:id, :cid, :tid, 'Idem Walk List', :uid, :now)"
        ),
        {
            "id": walk_list_id,
            "cid": campaign_id,
            "tid": turf_id,
            "uid": user_id,
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO walk_list_entries"
            " (id, walk_list_id, voter_id, sequence, status) "
            "VALUES (:id, :wid, :vid, 1, 'pending')"
        ),
        {"id": entry_id, "wid": walk_list_id, "vid": voter_id},
    )
    await session.commit()

    yield {
        "campaign_id": campaign_id,
        "org_id": org_id,
        "user_id": user_id,
        "voter_id": voter_id,
        "turf_id": turf_id,
        "walk_list_id": walk_list_id,
        "entry_id": entry_id,
    }

    await session.execute(
        text("DELETE FROM voter_interactions WHERE campaign_id = :cid"),
        {"cid": campaign_id},
    )
    await session.execute(
        text("DELETE FROM walk_list_entries WHERE walk_list_id = :wid"),
        {"wid": walk_list_id},
    )
    await session.execute(
        text("DELETE FROM walk_lists WHERE id = :id"),
        {"id": walk_list_id},
    )
    await session.execute(
        text("DELETE FROM turfs WHERE id = :id"),
        {"id": turf_id},
    )
    await session.execute(
        text("DELETE FROM voters WHERE id = :id"),
        {"id": voter_id},
    )
    await session.execute(
        text("DELETE FROM campaign_members WHERE campaign_id = :cid"),
        {"cid": campaign_id},
    )
    await session.execute(
        text("DELETE FROM campaigns WHERE id = :id"),
        {"id": campaign_id},
    )
    await session.execute(
        text("DELETE FROM users WHERE id = :id"),
        {"id": user_id},
    )
    await session.commit()


def _build_client(
    data: dict,
    app_user_engine,
    superuser_engine,
) -> AsyncClient:
    app, _ = _make_app_for_campaign(
        data["user_id"],
        data["org_id"],
        data["campaign_id"],
        app_user_engine,
        superuser_engine=superuser_engine,
        role=CampaignRole.VOLUNTEER,
    )
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver")


def _door_knock_url(data: dict) -> str:
    return (
        f"/api/v1/campaigns/{data['campaign_id']}"
        f"/walk-lists/{data['walk_list_id']}/door-knocks"
    )


def _payload(data: dict, client_uuid: str) -> dict:
    return {
        "voter_id": str(data["voter_id"]),
        "walk_list_entry_id": str(data["entry_id"]),
        "result_code": "not_home",
        "client_uuid": client_uuid,
    }


@pytest.mark.integration
class TestDoorKnockClientUuidIdempotency:
    """Lock OFFLINE-01: client_uuid-based exactly-once POST contract."""

    async def test_duplicate_client_uuid_returns_409(
        self,
        idempotency_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Second POST with same client_uuid → 409 Conflict."""
        data = idempotency_fixture
        client_uuid = str(uuid.uuid4())

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            first = await client.post(
                _door_knock_url(data), json=_payload(data, client_uuid)
            )
            assert first.status_code == 201, first.text

            second = await client.post(
                _door_knock_url(data), json=_payload(data, client_uuid)
            )

        assert second.status_code == 409, second.text
        body = second.json()
        # fastapi_problem_details returns RFC 7807 "type" as a URI; our slug
        # is embedded at the tail.
        assert "door-knock-duplicate" in (body.get("type") or "")

    async def test_different_client_uuids_both_succeed(
        self,
        idempotency_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Two different client_uuids → both 201 (no false dedup)."""
        data = idempotency_fixture

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            r1 = await client.post(
                _door_knock_url(data), json=_payload(data, str(uuid.uuid4()))
            )
            r2 = await client.post(
                _door_knock_url(data), json=_payload(data, str(uuid.uuid4()))
            )

        assert r1.status_code == 201, r1.text
        assert r2.status_code == 201, r2.text

    async def test_missing_client_uuid_returns_422(
        self,
        idempotency_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Missing client_uuid → 422 Unprocessable (Pydantic required)."""
        data = idempotency_fixture
        payload = {
            "voter_id": str(data["voter_id"]),
            "walk_list_entry_id": str(data["entry_id"]),
            "result_code": "not_home",
        }

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            resp = await client.post(_door_knock_url(data), json=payload)

        assert resp.status_code == 422, resp.text

    async def test_concurrent_duplicate_posts_exactly_one_201(
        self,
        idempotency_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Concurrent POSTs with same client_uuid → one 201, one 409.

        The DB unique index is the single source of truth. App-level
        check-then-insert would race; this test locks the DB-level fix.
        """
        data = idempotency_fixture
        client_uuid = str(uuid.uuid4())

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            r1, r2 = await asyncio.gather(
                client.post(_door_knock_url(data), json=_payload(data, client_uuid)),
                client.post(_door_knock_url(data), json=_payload(data, client_uuid)),
            )

        statuses = sorted([r1.status_code, r2.status_code])
        assert statuses == [201, 409], f"got {statuses}: {r1.text} | {r2.text}"
