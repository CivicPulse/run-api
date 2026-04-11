"""Integration tests locking the CANV-03 optional-notes contract for door knocks.

Phase 107 D-10/D-16: The door-knock POST must accept ``notes=None``,
``notes=""``, an omitted ``notes`` field, and a real notes string. These
tests prevent future regressions from re-introducing a NOT NULL or
min-length constraint on the notes column.

Per RESEARCH.md §3, ``DoorKnockCreate.notes`` is already
``str | None = None`` and ``CanvassService.record_door_knock`` passes
``data.notes`` through unchanged. These tests lock that contract.
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
async def door_knock_fixture(superuser_session):
    """Seed a campaign + walk list + entry + voter for door-knock tests.

    Yields a dict with the IDs the tests need to POST a door knock.
    Cleans up in reverse FK order on teardown.
    """
    session = superuser_session
    now = utcnow()

    campaign_id = uuid.uuid4()
    user_id = f"user-dk-{uuid.uuid4().hex[:8]}"
    org_id = f"org-dk-{campaign_id.hex[:8]}"
    voter_id = uuid.uuid4()
    turf_id = uuid.uuid4()
    walk_list_id = uuid.uuid4()
    entry_id = uuid.uuid4()

    # User
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_id,
            "name": "Door Knock User",
            "email": f"dk-{user_id}@test.com",
            "now": now,
        },
    )

    # Campaign
    await session.execute(
        text(
            "INSERT INTO campaigns (id, zitadel_org_id, name,"
            " type, status, created_by, created_at,"
            " updated_at) "
            "VALUES (:id, :org_id, 'DK Campaign', 'STATE',"
            " 'ACTIVE', :created_by, :now, :now)"
        ),
        {
            "id": campaign_id,
            "org_id": org_id,
            "created_by": user_id,
            "now": now,
        },
    )

    # Campaign member (volunteer role -- endpoint requires volunteer+)
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

    # Voter
    await session.execute(
        text(
            "INSERT INTO voters (id, campaign_id, source_type,"
            " first_name, last_name, created_at, updated_at) "
            "VALUES (:id, :cid, 'manual', 'Test', 'Voter', :now, :now)"
        ),
        {"id": voter_id, "cid": campaign_id, "now": now},
    )

    # Turf (PostGIS polygon -- simple square)
    polygon_wkt = "SRID=4326;POLYGON((-90 40, -90 41, -89 41, -89 40, -90 40))"
    await session.execute(
        text(
            "INSERT INTO turfs (id, campaign_id, name, status, boundary,"
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'DK Turf', 'active',"
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

    # Walk list
    await session.execute(
        text(
            "INSERT INTO walk_lists (id, campaign_id, turf_id, name,"
            " created_by, created_at) "
            "VALUES (:id, :cid, :tid, 'DK Walk List', :uid, :now)"
        ),
        {
            "id": walk_list_id,
            "cid": campaign_id,
            "tid": turf_id,
            "uid": user_id,
            "now": now,
        },
    )

    # Walk list entry
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

    # Teardown -- reverse FK order. voter_interactions are created by the
    # door-knock POST and reference voter_id + campaign_id, so wipe them
    # before voters/campaigns.
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
    """Build an ASGI AsyncClient acting as the seeded volunteer user."""
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


def _base_payload(data: dict) -> dict:
    # Plan 110-02 / OFFLINE-01: ``client_uuid`` is a required field on
    # ``DoorKnockCreate`` for end-to-end idempotency. A fresh UUID per
    # call keeps these tests independent of the idempotency contract —
    # duplicate-detection semantics are covered in
    # ``test_walk_list_door_knock_idempotency.py``.
    return {
        "voter_id": str(data["voter_id"]),
        "walk_list_entry_id": str(data["entry_id"]),
        "result_code": "not_home",
        "client_uuid": str(uuid.uuid4()),
    }


@pytest.mark.integration
class TestDoorKnockEmptyNotesContract:
    """Lock the CANV-03 contract: notes is genuinely optional on door knocks.

    Per D-10/D-16: ``POST /api/v1/campaigns/{id}/walk-lists/{id}/door-knocks``
    must accept all four notes shapes (real string, empty string, ``None``,
    omitted) and respond 201 in every case.
    """

    async def test_post_door_knock_with_real_notes_echoes_back(
        self,
        door_knock_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Happy-path baseline: a real notes string round-trips intact."""
        data = door_knock_fixture
        payload = _base_payload(data)
        payload["notes"] = "Left a flyer at the door."

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            resp = await client.post(_door_knock_url(data), json=payload)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["notes"] == "Left a flyer at the door."
        assert body["result_code"] == "not_home"
        assert body["voter_id"] == str(data["voter_id"])

    async def test_post_door_knock_with_empty_string_notes_returns_201(
        self,
        door_knock_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Empty-string notes must be accepted (no min-length constraint)."""
        data = door_knock_fixture
        payload = _base_payload(data)
        payload["notes"] = ""

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            resp = await client.post(_door_knock_url(data), json=payload)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        # Observed contract: empty string may be preserved as "" or normalized
        # to None. Both are acceptable so long as no validation error fires.
        assert body["notes"] in ("", None)

    async def test_post_door_knock_with_null_notes_returns_201(
        self,
        door_knock_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Explicit ``notes=None`` must be accepted (no NOT NULL constraint)."""
        data = door_knock_fixture
        payload = _base_payload(data)
        payload["notes"] = None

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            resp = await client.post(_door_knock_url(data), json=payload)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["notes"] is None

    async def test_post_door_knock_omitting_notes_field_returns_201(
        self,
        door_knock_fixture,
        app_user_engine,
        superuser_engine,
    ):
        """Omitting the notes field entirely must succeed (truly optional)."""
        data = door_knock_fixture
        payload = _base_payload(data)
        # Deliberately do NOT add a "notes" key.

        async with _build_client(data, app_user_engine, superuser_engine) as client:
            resp = await client.post(_door_knock_url(data), json=payload)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["notes"] is None
