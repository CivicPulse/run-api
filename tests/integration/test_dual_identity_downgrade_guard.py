"""Test the Phase 111 downgrade guard queries (D-13).

The 042_dual_identity_assignment_schema downgrade() function refuses to
roll back if any row in either dual-identity table has volunteer_id IS
NOT NULL -- this prevents silent data loss of pre-signup volunteer
assignments. We verify the SAME guard query the downgrade uses correctly
returns nonzero when such rows exist.

We do NOT run the full alembic downgrade in this test -- it would
require an isolated test DB and is out of scope for Phase 111. Manual
downgrade testing is documented in the migration docstring.

Markers: integration -- requires the docker compose postgres service.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.integration


async def _make_user(session: AsyncSession, suffix: str) -> str:
    uid = f"dwn-{suffix}-{uuid.uuid4().hex[:8]}"
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, NOW(), NOW())"
        ),
        {"id": uid, "name": uid, "email": f"{uid}@example.com"},
    )
    return uid


async def _make_campaign(session: AsyncSession, creator: str) -> uuid.UUID:
    cid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :org, :name, 'STATE', 'ACTIVE', "
            " :creator, NOW(), NOW())"
        ),
        {
            "id": cid,
            "org": f"dwn-org-{cid.hex[:8]}",
            "name": f"DWN-{cid.hex[:6]}",
            "creator": creator,
        },
    )
    return cid


async def _make_volunteer(
    session: AsyncSession, campaign_id: uuid.UUID, creator: str
) -> uuid.UUID:
    vid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO volunteers "
            "(id, campaign_id, first_name, last_name, status, "
            " skills, created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'Test', 'Vol', 'pending', "
            " '{}'::varchar[], :creator, NOW(), NOW())"
        ),
        {"id": vid, "cid": campaign_id, "creator": creator},
    )
    return vid


async def test_downgrade_guard_detects_session_callers_volunteer_rows(
    superuser_session,
):
    creator = await _make_user(superuser_session, "sc")
    campaign = await _make_campaign(superuser_session, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)

    # Seed minimum scaffolding for a session_callers row.
    cl_id = uuid.uuid4()
    await superuser_session.execute(
        text(
            "INSERT INTO call_lists "
            "(id, campaign_id, name, created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'DWN CL', :creator, NOW(), NOW())"
        ),
        {"id": cl_id, "cid": campaign, "creator": creator},
    )
    sess_id = uuid.uuid4()
    await superuser_session.execute(
        text(
            "INSERT INTO phone_bank_sessions "
            "(id, campaign_id, call_list_id, name, status, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, :clid, 'DWN Sess', 'draft', "
            " :creator, NOW(), NOW())"
        ),
        {
            "id": sess_id,
            "cid": campaign,
            "clid": cl_id,
            "creator": creator,
        },
    )
    await superuser_session.execute(
        text(
            "INSERT INTO session_callers "
            "(id, session_id, user_id, volunteer_id, created_at) "
            "VALUES (:id, :sid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "sid": sess_id, "vid": vol},
    )
    await superuser_session.commit()

    # The exact guard query 042's downgrade() runs.
    count = (
        await superuser_session.execute(
            text("SELECT COUNT(*) FROM session_callers WHERE volunteer_id IS NOT NULL")
        )
    ).scalar_one()
    assert count >= 1, "downgrade guard must detect pre-signup rows"


async def test_downgrade_guard_detects_walk_list_canvassers_volunteer_rows(
    superuser_session,
):
    creator = await _make_user(superuser_session, "wl")
    campaign = await _make_campaign(superuser_session, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)

    turf_id = uuid.uuid4()
    await superuser_session.execute(
        text(
            "INSERT INTO turfs "
            "(id, campaign_id, name, status, boundary, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'DWN Turf', 'draft', "
            " ST_GeomFromText('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))', 4326), "
            " :creator, NOW(), NOW())"
        ),
        {"id": turf_id, "cid": campaign, "creator": creator},
    )
    wl_id = uuid.uuid4()
    await superuser_session.execute(
        text(
            "INSERT INTO walk_lists "
            "(id, campaign_id, turf_id, name, total_entries, visited_entries, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :tid, 'DWN WL', 0, 0, :creator, NOW())"
        ),
        {"id": wl_id, "cid": campaign, "tid": turf_id, "creator": creator},
    )
    await superuser_session.execute(
        text(
            "INSERT INTO walk_list_canvassers "
            "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
            "VALUES (:id, :wlid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "wlid": wl_id, "vid": vol},
    )
    await superuser_session.commit()

    count = (
        await superuser_session.execute(
            text(
                "SELECT COUNT(*) FROM walk_list_canvassers "
                "WHERE volunteer_id IS NOT NULL"
            )
        )
    ).scalar_one()
    assert count >= 1, "downgrade guard must detect pre-signup rows"
