"""Schema-level integration tests for Phase 111 dual-identity tables.

Verifies the CHECK constraint and partial unique indexes on
session_callers and walk_list_canvassers behave correctly. Each test
uses raw SQL via the superuser_session so the test is decoupled from
ORM convenience methods.

Markers: integration -- requires the docker compose postgres service.

Also asserts D-16 deferral: cross-identity duplicate (same session/walk-list
appearing once as user_id and once as volunteer_id) is ALLOWED here. That
edge case is closed in Phase 112 by the accept_invite backfill, NOT by
the schema.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.integration


# ---------- shared fixture helpers ----------


async def _make_user(session: AsyncSession, suffix: str) -> str:
    uid = f"dis-user-{suffix}-{uuid.uuid4().hex[:8]}"
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
            "org": f"dis-org-{cid.hex[:8]}",
            "name": f"DIS-{cid.hex[:6]}",
            "creator": creator,
        },
    )
    return cid


async def _make_volunteer(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    creator: str,
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


async def _make_call_list(
    session: AsyncSession, campaign_id: uuid.UUID, creator: str
) -> uuid.UUID:
    clid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO call_lists "
            "(id, campaign_id, name, created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'DIS Call List', :creator, NOW(), NOW())"
        ),
        {"id": clid, "cid": campaign_id, "creator": creator},
    )
    return clid


async def _make_phone_bank_session(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    creator: str,
) -> uuid.UUID:
    sid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO phone_bank_sessions "
            "(id, campaign_id, call_list_id, name, status, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, :clid, 'DIS Session', 'draft', "
            " :creator, NOW(), NOW())"
        ),
        {"id": sid, "cid": campaign_id, "clid": call_list_id, "creator": creator},
    )
    return sid


async def _make_turf(
    session: AsyncSession, campaign_id: uuid.UUID, creator: str
) -> uuid.UUID:
    tid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO turfs "
            "(id, campaign_id, name, status, boundary, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :cid, 'DIS Turf', 'draft', "
            " ST_GeomFromText('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))', 4326), "
            " :creator, NOW(), NOW())"
        ),
        {"id": tid, "cid": campaign_id, "creator": creator},
    )
    return tid


async def _make_walk_list(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID,
    creator: str,
) -> uuid.UUID:
    wlid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO walk_lists "
            "(id, campaign_id, turf_id, name, total_entries, visited_entries, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :tid, 'DIS WL', 0, 0, :creator, NOW())"
        ),
        {"id": wlid, "cid": campaign_id, "tid": turf_id, "creator": creator},
    )
    return wlid


# ---------- session_callers tests ----------


async def test_session_callers_check_rejects_both_null(superuser_session):
    creator = await _make_user(superuser_session, "scbn")
    campaign = await _make_campaign(superuser_session, creator)
    cl = await _make_call_list(superuser_session, campaign, creator)
    sess = await _make_phone_bank_session(superuser_session, campaign, cl, creator)
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO session_callers "
                "(id, session_id, user_id, volunteer_id, created_at) "
                "VALUES (:id, :sid, NULL, NULL, NOW())"
            ),
            {"id": uuid.uuid4(), "sid": sess},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_session_callers_check_rejects_both_set(superuser_session):
    creator = await _make_user(superuser_session, "scbs")
    campaign = await _make_campaign(superuser_session, creator)
    cl = await _make_call_list(superuser_session, campaign, creator)
    sess = await _make_phone_bank_session(superuser_session, campaign, cl, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO session_callers "
                "(id, session_id, user_id, volunteer_id, created_at) "
                "VALUES (:id, :sid, :uid, :vid, NOW())"
            ),
            {
                "id": uuid.uuid4(),
                "sid": sess,
                "uid": creator,
                "vid": vol,
            },
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_session_callers_partial_unique_user(superuser_session):
    creator = await _make_user(superuser_session, "scpu")
    campaign = await _make_campaign(superuser_session, creator)
    cl = await _make_call_list(superuser_session, campaign, creator)
    sess = await _make_phone_bank_session(superuser_session, campaign, cl, creator)
    await superuser_session.execute(
        text(
            "INSERT INTO session_callers "
            "(id, session_id, user_id, volunteer_id, created_at) "
            "VALUES (:id, :sid, :uid, NULL, NOW())"
        ),
        {"id": uuid.uuid4(), "sid": sess, "uid": creator},
    )
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO session_callers "
                "(id, session_id, user_id, volunteer_id, created_at) "
                "VALUES (:id, :sid, :uid, NULL, NOW())"
            ),
            {"id": uuid.uuid4(), "sid": sess, "uid": creator},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_session_callers_partial_unique_volunteer(superuser_session):
    creator = await _make_user(superuser_session, "scpv")
    campaign = await _make_campaign(superuser_session, creator)
    cl = await _make_call_list(superuser_session, campaign, creator)
    sess = await _make_phone_bank_session(superuser_session, campaign, cl, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)
    await superuser_session.execute(
        text(
            "INSERT INTO session_callers "
            "(id, session_id, user_id, volunteer_id, created_at) "
            "VALUES (:id, :sid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "sid": sess, "vid": vol},
    )
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO session_callers "
                "(id, session_id, user_id, volunteer_id, created_at) "
                "VALUES (:id, :sid, NULL, :vid, NOW())"
            ),
            {"id": uuid.uuid4(), "sid": sess, "vid": vol},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_session_callers_cross_identity_allowed(superuser_session):
    """D-16: Cross-identity uniqueness deferred to Phase 112. Schema must
    NOT block one user_id row + one volunteer_id row on the same session."""
    creator = await _make_user(superuser_session, "scxi")
    campaign = await _make_campaign(superuser_session, creator)
    cl = await _make_call_list(superuser_session, campaign, creator)
    sess = await _make_phone_bank_session(superuser_session, campaign, cl, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)

    await superuser_session.execute(
        text(
            "INSERT INTO session_callers "
            "(id, session_id, user_id, volunteer_id, created_at) "
            "VALUES (:id, :sid, :uid, NULL, NOW())"
        ),
        {"id": uuid.uuid4(), "sid": sess, "uid": creator},
    )
    await superuser_session.execute(
        text(
            "INSERT INTO session_callers "
            "(id, session_id, user_id, volunteer_id, created_at) "
            "VALUES (:id, :sid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "sid": sess, "vid": vol},
    )
    await superuser_session.commit()  # both inserts must succeed


# ---------- walk_list_canvassers tests ----------


async def test_walk_list_canvassers_check_rejects_both_null(superuser_session):
    creator = await _make_user(superuser_session, "wcbn")
    campaign = await _make_campaign(superuser_session, creator)
    turf = await _make_turf(superuser_session, campaign, creator)
    wl = await _make_walk_list(superuser_session, campaign, turf, creator)
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO walk_list_canvassers "
                "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
                "VALUES (:id, :wlid, NULL, NULL, NOW())"
            ),
            {"id": uuid.uuid4(), "wlid": wl},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_walk_list_canvassers_check_rejects_both_set(superuser_session):
    creator = await _make_user(superuser_session, "wcbs")
    campaign = await _make_campaign(superuser_session, creator)
    turf = await _make_turf(superuser_session, campaign, creator)
    wl = await _make_walk_list(superuser_session, campaign, turf, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO walk_list_canvassers "
                "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
                "VALUES (:id, :wlid, :uid, :vid, NOW())"
            ),
            {
                "id": uuid.uuid4(),
                "wlid": wl,
                "uid": creator,
                "vid": vol,
            },
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_walk_list_canvassers_partial_unique_user(superuser_session):
    creator = await _make_user(superuser_session, "wcpu")
    campaign = await _make_campaign(superuser_session, creator)
    turf = await _make_turf(superuser_session, campaign, creator)
    wl = await _make_walk_list(superuser_session, campaign, turf, creator)
    await superuser_session.execute(
        text(
            "INSERT INTO walk_list_canvassers "
            "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
            "VALUES (:id, :wlid, :uid, NULL, NOW())"
        ),
        {"id": uuid.uuid4(), "wlid": wl, "uid": creator},
    )
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO walk_list_canvassers "
                "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
                "VALUES (:id, :wlid, :uid, NULL, NOW())"
            ),
            {"id": uuid.uuid4(), "wlid": wl, "uid": creator},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_walk_list_canvassers_partial_unique_volunteer(superuser_session):
    creator = await _make_user(superuser_session, "wcpv")
    campaign = await _make_campaign(superuser_session, creator)
    turf = await _make_turf(superuser_session, campaign, creator)
    wl = await _make_walk_list(superuser_session, campaign, turf, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)
    await superuser_session.execute(
        text(
            "INSERT INTO walk_list_canvassers "
            "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
            "VALUES (:id, :wlid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "wlid": wl, "vid": vol},
    )
    await superuser_session.commit()

    with pytest.raises(IntegrityError):
        await superuser_session.execute(
            text(
                "INSERT INTO walk_list_canvassers "
                "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
                "VALUES (:id, :wlid, NULL, :vid, NOW())"
            ),
            {"id": uuid.uuid4(), "wlid": wl, "vid": vol},
        )
        await superuser_session.flush()
    await superuser_session.rollback()


async def test_walk_list_canvassers_cross_identity_allowed(superuser_session):
    """D-16: Cross-identity uniqueness deferred to Phase 112."""
    creator = await _make_user(superuser_session, "wcxi")
    campaign = await _make_campaign(superuser_session, creator)
    turf = await _make_turf(superuser_session, campaign, creator)
    wl = await _make_walk_list(superuser_session, campaign, turf, creator)
    vol = await _make_volunteer(superuser_session, campaign, creator)

    await superuser_session.execute(
        text(
            "INSERT INTO walk_list_canvassers "
            "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
            "VALUES (:id, :wlid, :uid, NULL, NOW())"
        ),
        {"id": uuid.uuid4(), "wlid": wl, "uid": creator},
    )
    await superuser_session.execute(
        text(
            "INSERT INTO walk_list_canvassers "
            "(id, walk_list_id, user_id, volunteer_id, assigned_at) "
            "VALUES (:id, :wlid, NULL, :vid, NOW())"
        ),
        {"id": uuid.uuid4(), "wlid": wl, "vid": vol},
    )
    await superuser_session.commit()
