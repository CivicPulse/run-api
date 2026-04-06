"""Phase 78 regression coverage for production shakedown tenant leaks."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.security import CampaignRole
from app.core.time import utcnow
from tests.integration.test_rls_api_smoke import _make_app_for_campaign


@pytest.fixture
async def phase78_isolation_data(superuser_session):
    """Create cross-campaign resources for the Phase 78 containment tests."""

    session = superuser_session
    now = utcnow()

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    org_a_id = f"phase78-org-a-{campaign_a_id.hex[:8]}"
    org_b_id = f"phase78-org-b-{campaign_b_id.hex[:8]}"
    user_a_id = f"phase78-user-a-{uuid.uuid4().hex[:8]}"
    user_b_id = f"phase78-user-b-{uuid.uuid4().hex[:8]}"
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    list_a_id = uuid.uuid4()
    list_b_id = uuid.uuid4()
    turf_a_id = uuid.uuid4()
    volunteer_a_id = uuid.uuid4()
    volunteer_b_id = uuid.uuid4()
    availability_b_id = uuid.uuid4()
    shift_b_id = uuid.uuid4()
    shift_volunteer_b_id = uuid.uuid4()

    for uid, name, email in [
        (user_a_id, "Phase78 User A", "phase78-a@test.com"),
        (user_b_id, "Phase78 User B", "phase78-b@test.com"),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    for cid, org_id, name, campaign_type, created_by in [
        (campaign_a_id, org_a_id, "Phase78 Campaign A", "STATE", user_a_id),
        (campaign_b_id, org_b_id, "Phase78 Campaign B", "FEDERAL", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns "
                "(id, zitadel_org_id, name, type, status, created_by, created_at, updated_at) "
                "VALUES (:id, :org_id, :name, :type, 'ACTIVE', :created_by, :now, :now)"
            ),
            {
                "id": cid,
                "org_id": org_id,
                "name": name,
                "type": campaign_type,
                "created_by": created_by,
                "now": now,
            },
        )

    for uid, cid, role in [
        (user_a_id, campaign_a_id, "admin"),
        (user_b_id, campaign_b_id, "admin"),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaign_members (id, user_id, campaign_id, role, synced_at) "
                "VALUES (:id, :user_id, :campaign_id, :role, :now)"
            ),
            {
                "id": uuid.uuid4(),
                "user_id": uid,
                "campaign_id": cid,
                "role": role,
                "now": now,
            },
        )

    for voter_id, cid, first_name, lon, lat in [
        (voter_a_id, campaign_a_id, "Alice", -83.645, 32.835),
        (voter_b_id, campaign_b_id, "Bob", -83.6455, 32.8355),
    ]:
        await session.execute(
            text(
                "INSERT INTO voters "
                "(id, campaign_id, source_type, first_name, last_name, latitude, longitude, geom, created_at, updated_at) "
                "VALUES ("
                ":id, :campaign_id, 'manual', :first_name, 'Tenant', :lat, :lon, "
                "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :now, :now)"
            ),
            {
                "id": voter_id,
                "campaign_id": cid,
                "first_name": first_name,
                "lat": lat,
                "lon": lon,
                "now": now,
            },
        )

    for list_id, cid, created_by, name in [
        (list_a_id, campaign_a_id, user_a_id, "Phase78 List A"),
        (list_b_id, campaign_b_id, user_b_id, "Phase78 List B"),
    ]:
        await session.execute(
            text(
                "INSERT INTO voter_lists "
                "(id, campaign_id, name, list_type, created_by, created_at, updated_at) "
                "VALUES (:id, :campaign_id, :name, 'STATIC', :created_by, :now, :now)"
            ),
            {
                "id": list_id,
                "campaign_id": cid,
                "name": name,
                "created_by": created_by,
                "now": now,
            },
        )

    await session.execute(
        text(
            "INSERT INTO turfs "
            "(id, campaign_id, name, status, boundary, created_by, created_at, updated_at) "
            "VALUES ("
            ":id, :campaign_id, :name, 'active', "
            "ST_GeomFromEWKT(:boundary), :created_by, :now, :now)"
        ),
        {
            "id": turf_a_id,
            "campaign_id": campaign_a_id,
            "name": "Phase78 Turf A",
            "boundary": (
                "SRID=4326;POLYGON(("
                "-83.6500 32.8300, -83.6400 32.8300, "
                "-83.6400 32.8400, -83.6500 32.8400, "
                "-83.6500 32.8300"
                "))"
            ),
            "created_by": user_a_id,
            "now": now,
        },
    )

    for volunteer_id, cid, first_name, uid in [
        (volunteer_a_id, campaign_a_id, "VolunteerA", user_a_id),
        (volunteer_b_id, campaign_b_id, "VolunteerB", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO volunteers "
                "(id, campaign_id, user_id, first_name, last_name, status, skills, created_by, created_at, updated_at) "
                "VALUES ("
                ":id, :campaign_id, :user_id, :first_name, 'Tenant', 'active', "
                "'{}'::varchar[], :created_by, :now, :now)"
            ),
            {
                "id": volunteer_id,
                "campaign_id": cid,
                "user_id": uid,
                "first_name": first_name,
                "created_by": uid,
                "now": now,
            },
        )

    await session.execute(
        text(
            "INSERT INTO volunteer_availability (id, volunteer_id, start_at, end_at) "
            "VALUES (:id, :volunteer_id, :start_at, :end_at)"
        ),
        {
            "id": availability_b_id,
            "volunteer_id": volunteer_b_id,
            "start_at": now,
            "end_at": now + timedelta(hours=2),
        },
    )

    await session.execute(
        text(
            "INSERT INTO shifts "
            "(id, campaign_id, name, type, status, start_at, end_at, max_volunteers, created_by, created_at, updated_at) "
            "VALUES ("
            ":id, :campaign_id, 'Phase78 Shift B', 'general', 'completed', "
            ":start_at, :end_at, 5, :created_by, :now, :now)"
        ),
        {
            "id": shift_b_id,
            "campaign_id": campaign_b_id,
            "start_at": now - timedelta(hours=4),
            "end_at": now - timedelta(hours=2),
            "created_by": user_b_id,
            "now": now,
        },
    )

    await session.execute(
        text(
            "INSERT INTO shift_volunteers "
            "(id, shift_id, volunteer_id, status, signed_up_at, check_in_at, check_out_at) "
            "VALUES ("
            ":id, :shift_id, :volunteer_id, 'checked_out', :signed_up_at, :check_in_at, :check_out_at)"
        ),
        {
            "id": shift_volunteer_b_id,
            "shift_id": shift_b_id,
            "volunteer_id": volunteer_b_id,
            "signed_up_at": now - timedelta(hours=5),
            "check_in_at": now - timedelta(hours=4),
            "check_out_at": now - timedelta(hours=2),
        },
    )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "org_a_id": org_a_id,
        "user_a_id": user_a_id,
        "voter_a_id": voter_a_id,
        "voter_b_id": voter_b_id,
        "list_a_id": list_a_id,
        "list_b_id": list_b_id,
        "turf_a_id": turf_a_id,
        "volunteer_b_id": volunteer_b_id,
    }

    await session.execute(
        text("DELETE FROM shift_volunteers WHERE id = :id"),
        {"id": shift_volunteer_b_id},
    )
    await session.execute(text("DELETE FROM shifts WHERE id = :id"), {"id": shift_b_id})
    await session.execute(
        text("DELETE FROM volunteer_availability WHERE id = :id"),
        {"id": availability_b_id},
    )
    await session.execute(
        text("DELETE FROM volunteers WHERE id IN (:a, :b)"),
        {"a": volunteer_a_id, "b": volunteer_b_id},
    )
    await session.execute(text("DELETE FROM turfs WHERE id = :id"), {"id": turf_a_id})
    await session.execute(
        text("DELETE FROM voter_interactions WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM call_lists WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM voter_list_members WHERE voter_list_id IN (:a, :b)"),
        {"a": list_a_id, "b": list_b_id},
    )
    await session.execute(
        text("DELETE FROM voter_lists WHERE id IN (:a, :b)"),
        {"a": list_a_id, "b": list_b_id},
    )
    await session.execute(
        text("DELETE FROM voters WHERE id IN (:a, :b)"),
        {"a": voter_a_id, "b": voter_b_id},
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


def _client_for_campaign_a(data, app_user_engine, superuser_engine):
    app, _ = _make_app_for_campaign(
        data["user_a_id"],
        data["org_a_id"],
        data["campaign_a_id"],
        app_user_engine,
        superuser_engine=superuser_engine,
        role=CampaignRole.ADMIN,
    )
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    )


@pytest.mark.integration
class TestPhase78TenantContainment:
    async def test_list_member_body_injection_returns_404_and_writes_nothing(
        self,
        phase78_isolation_data,
        app_user_engine,
        superuser_engine,
        superuser_session,
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{data['campaign_a_id']}/lists/{data['list_a_id']}/members",
                json={"voter_ids": [str(data["voter_b_id"])]},
            )

        assert resp.status_code == 404

        count = await superuser_session.scalar(
            text(
                "SELECT count(*) FROM voter_list_members "
                "WHERE voter_list_id = :list_id AND voter_id = :voter_id"
            ),
            {"list_id": data["list_a_id"], "voter_id": data["voter_b_id"]},
        )
        assert count == 0

    async def test_call_list_foreign_voter_list_returns_422_and_writes_nothing(
        self,
        phase78_isolation_data,
        app_user_engine,
        superuser_engine,
        superuser_session,
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{data['campaign_a_id']}/call-lists",
                json={
                    "name": "foreign-list-smuggle",
                    "voter_list_id": str(data["list_b_id"]),
                },
            )

        assert resp.status_code == 422

        count = await superuser_session.scalar(
            text(
                "SELECT count(*) FROM call_lists "
                "WHERE campaign_id = :campaign_id AND name = :name"
            ),
            {"campaign_id": data["campaign_a_id"], "name": "foreign-list-smuggle"},
        )
        assert count == 0

    async def test_voter_interaction_foreign_voter_returns_404_and_writes_nothing(
        self,
        phase78_isolation_data,
        app_user_engine,
        superuser_engine,
        superuser_session,
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{data['campaign_a_id']}/voters/{data['voter_b_id']}/interactions",
                json={"type": "note", "payload": {"text": "cross-tenant"}},
            )

        assert resp.status_code == 404

        count = await superuser_session.scalar(
            text(
                "SELECT count(*) FROM voter_interactions "
                "WHERE campaign_id = :campaign_id AND voter_id = :voter_id"
            ),
            {"campaign_id": data["campaign_a_id"], "voter_id": data["voter_b_id"]},
        )
        assert count == 0

    async def test_turf_voters_only_returns_path_campaign_voters(
        self, phase78_isolation_data, app_user_engine, superuser_engine
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(
                f"/api/v1/campaigns/{data['campaign_a_id']}/turfs/{data['turf_a_id']}/voters"
            )

        assert resp.status_code == 200
        returned_ids = {item["id"] for item in resp.json()}
        assert str(data["voter_a_id"]) in returned_ids
        assert str(data["voter_b_id"]) not in returned_ids

    async def test_volunteer_cross_campaign_endpoints_return_not_found(
        self, phase78_isolation_data, app_user_engine, superuser_engine
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            detail = await client.get(
                f"/api/v1/campaigns/{data['campaign_a_id']}/volunteers/{data['volunteer_b_id']}"
            )
            status_update = await client.patch(
                f"/api/v1/campaigns/{data['campaign_a_id']}/volunteers/{data['volunteer_b_id']}/status",
                json={"status": "inactive"},
            )
            availability = await client.get(
                f"/api/v1/campaigns/{data['campaign_a_id']}/volunteers/{data['volunteer_b_id']}/availability"
            )
            hours = await client.get(
                f"/api/v1/campaigns/{data['campaign_a_id']}/volunteers/{data['volunteer_b_id']}/hours"
            )

        assert detail.status_code == 404
        assert status_update.status_code == 404
        assert availability.status_code == 404
        assert hours.status_code == 404

    async def test_field_me_requires_membership_on_foreign_campaign_path(
        self, phase78_isolation_data, app_user_engine, superuser_engine
    ):
        data = phase78_isolation_data
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(
                f"/api/v1/campaigns/{data['campaign_b_id']}/field/me"
            )

        assert resp.status_code == 403
