"""Integration tests for assignment idempotency (R011).

Verifies that assigning a caller to a phone bank session or a canvasser
to a walk list is idempotent — duplicate calls return success with the
same assignment data, not 409 Conflict.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.time import utcnow
from app.services.phone_bank import PhoneBankService
from app.services.walk_list import WalkListService


@pytest.fixture
async def phone_bank_data(superuser_session):
    """Create a campaign, user, call list, and phone bank session for testing."""
    session = superuser_session
    now = utcnow()

    campaign_id = uuid.uuid4()
    user_id = f"user-idem-{uuid.uuid4().hex[:8]}"
    caller_id = f"caller-idem-{uuid.uuid4().hex[:8]}"
    call_list_id = uuid.uuid4()
    pb_session_id = uuid.uuid4()

    # Create users
    for uid, name, email in [
        (user_id, "Idempotent Owner", f"idem-owner-{uuid.uuid4().hex[:6]}@test.com"),
        (caller_id, "Idempotent Caller", f"idem-caller-{uuid.uuid4().hex[:6]}@test.com"),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Create campaign
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_id,
            "org_id": f"org-idem-{campaign_id.hex[:8]}",
            "name": "Idempotency Test Campaign",
            "type": "STATE",
            "status": "ACTIVE",
            "created_by": user_id,
            "now": now,
        },
    )

    # Create call list
    await session.execute(
        text(
            "INSERT INTO call_lists "
            "(id, campaign_id, name, status, total_entries, completed_entries, "
            "max_attempts, created_by, created_at) "
            "VALUES (:id, :campaign_id, :name, :status, 0, 0, 3, :created_by, :now)"
        ),
        {
            "id": call_list_id,
            "campaign_id": campaign_id,
            "name": "Test Call List",
            "status": "ACTIVE",
            "created_by": user_id,
            "now": now,
        },
    )

    # Create phone bank session
    await session.execute(
        text(
            "INSERT INTO phone_bank_sessions "
            "(id, campaign_id, call_list_id, name, status, created_by, created_at, updated_at) "
            "VALUES (:id, :campaign_id, :call_list_id, :name, :status, :created_by, :now, :now)"
        ),
        {
            "id": pb_session_id,
            "campaign_id": campaign_id,
            "call_list_id": call_list_id,
            "name": "Test Session",
            "status": "draft",
            "created_by": user_id,
            "now": now,
        },
    )

    await session.commit()

    yield {
        "campaign_id": campaign_id,
        "user_id": user_id,
        "caller_id": caller_id,
        "call_list_id": call_list_id,
        "session_id": pb_session_id,
    }

    # Cleanup
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
        text("DELETE FROM campaigns WHERE id = :id"),
        {"id": campaign_id},
    )
    for uid in [user_id, caller_id]:
        await session.execute(
            text("DELETE FROM users WHERE id = :id"),
            {"id": uid},
        )
    await session.commit()


@pytest.fixture
async def walk_list_data(superuser_session):
    """Create a campaign, user, turf, voter, and walk list for testing."""
    session = superuser_session
    now = utcnow()

    campaign_id = uuid.uuid4()
    user_id = f"user-wl-{uuid.uuid4().hex[:8]}"
    canvasser_id = f"canv-wl-{uuid.uuid4().hex[:8]}"
    walk_list_id = uuid.uuid4()
    turf_id = uuid.uuid4()

    # Create users
    for uid, name, email in [
        (user_id, "WL Owner", f"wl-owner-{uuid.uuid4().hex[:6]}@test.com"),
        (canvasser_id, "WL Canvasser", f"wl-canv-{uuid.uuid4().hex[:6]}@test.com"),
    ]:
        await session.execute(
            text(
                "INSERT INTO users (id, display_name, email, created_at, updated_at) "
                "VALUES (:id, :name, :email, :now, :now)"
            ),
            {"id": uid, "name": name, "email": email, "now": now},
        )

    # Create campaign
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_id,
            "org_id": f"org-wl-{campaign_id.hex[:8]}",
            "name": "Walk List Idempotency Campaign",
            "type": "STATE",
            "status": "ACTIVE",
            "created_by": user_id,
            "now": now,
        },
    )

    # Create turf (needed for walk_list FK)
    await session.execute(
        text(
            "INSERT INTO turfs "
            "(id, campaign_id, name, boundary, created_by, created_at) "
            "VALUES (:id, :campaign_id, :name, "
            "ST_GeomFromText('POLYGON((-77.0 38.9, -77.0 39.0, -76.9 39.0, -76.9 38.9, -77.0 38.9))', 4326), "
            ":created_by, :now)"
        ),
        {
            "id": turf_id,
            "campaign_id": campaign_id,
            "name": "Test Turf",
            "created_by": user_id,
            "now": now,
        },
    )

    # Create walk list
    await session.execute(
        text(
            "INSERT INTO walk_lists "
            "(id, campaign_id, turf_id, name, total_entries, visited_entries, "
            "created_by, created_at) "
            "VALUES (:id, :campaign_id, :turf_id, :name, 0, 0, :created_by, :now)"
        ),
        {
            "id": walk_list_id,
            "campaign_id": campaign_id,
            "turf_id": turf_id,
            "name": "Test Walk List",
            "created_by": user_id,
            "now": now,
        },
    )

    await session.commit()

    yield {
        "campaign_id": campaign_id,
        "user_id": user_id,
        "canvasser_id": canvasser_id,
        "walk_list_id": walk_list_id,
        "turf_id": turf_id,
    }

    # Cleanup
    await session.execute(
        text("DELETE FROM walk_list_canvassers WHERE walk_list_id = :wlid"),
        {"wlid": walk_list_id},
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
        text("DELETE FROM campaigns WHERE id = :id"),
        {"id": campaign_id},
    )
    for uid in [user_id, canvasser_id]:
        await session.execute(
            text("DELETE FROM users WHERE id = :id"),
            {"id": uid},
        )
    await session.commit()


# ---------------------------------------------------------------------------
# Phone bank caller assignment idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_phone_bank_assign_caller_idempotent(superuser_session, phone_bank_data):
    """Assigning the same caller twice returns success both times with same data."""
    service = PhoneBankService()
    session_id = phone_bank_data["session_id"]
    caller_id = phone_bank_data["caller_id"]

    # First assignment
    caller1 = await service.assign_caller(superuser_session, session_id, caller_id)
    await superuser_session.commit()

    assert caller1.session_id == session_id
    assert caller1.user_id == caller_id

    # Second assignment — same caller, same session — should succeed
    caller2 = await service.assign_caller(superuser_session, session_id, caller_id)
    await superuser_session.commit()

    assert caller2.session_id == session_id
    assert caller2.user_id == caller_id

    # Same underlying record
    assert caller2.id == caller1.id
    assert caller2.created_at == caller1.created_at


@pytest.mark.asyncio
async def test_phone_bank_assign_different_callers(superuser_session, phone_bank_data):
    """Assigning different callers still creates distinct assignments."""
    service = PhoneBankService()
    session_id = phone_bank_data["session_id"]
    caller_id = phone_bank_data["caller_id"]
    user_id = phone_bank_data["user_id"]

    caller1 = await service.assign_caller(superuser_session, session_id, caller_id)
    caller2 = await service.assign_caller(superuser_session, session_id, user_id)
    await superuser_session.commit()

    assert caller1.id != caller2.id
    assert caller1.user_id != caller2.user_id


@pytest.mark.asyncio
async def test_phone_bank_assign_caller_not_found_session(superuser_session, phone_bank_data):
    """Assigning to a nonexistent session raises ValueError."""
    service = PhoneBankService()
    with pytest.raises(ValueError, match="not found"):
        await service.assign_caller(superuser_session, uuid.uuid4(), "some-user")


# ---------------------------------------------------------------------------
# Walk list canvasser assignment idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_walk_list_assign_canvasser_idempotent(superuser_session, walk_list_data):
    """Assigning the same canvasser twice returns success both times with same data."""
    service = WalkListService()
    walk_list_id = walk_list_data["walk_list_id"]
    canvasser_id = walk_list_data["canvasser_id"]

    # First assignment
    canv1 = await service.assign_canvasser(superuser_session, walk_list_id, canvasser_id)
    await superuser_session.commit()

    assert canv1.walk_list_id == walk_list_id
    assert canv1.user_id == canvasser_id

    # Second assignment — same canvasser, same walk list — should succeed
    canv2 = await service.assign_canvasser(superuser_session, walk_list_id, canvasser_id)
    await superuser_session.commit()

    assert canv2.walk_list_id == walk_list_id
    assert canv2.user_id == canvasser_id

    # Same underlying record
    assert canv2.assigned_at == canv1.assigned_at


@pytest.mark.asyncio
async def test_walk_list_assign_different_canvassers(superuser_session, walk_list_data):
    """Assigning different canvassers still creates distinct assignments."""
    service = WalkListService()
    walk_list_id = walk_list_data["walk_list_id"]
    canvasser_id = walk_list_data["canvasser_id"]
    user_id = walk_list_data["user_id"]

    canv1 = await service.assign_canvasser(superuser_session, walk_list_id, canvasser_id)
    canv2 = await service.assign_canvasser(superuser_session, walk_list_id, user_id)
    await superuser_session.commit()

    assert canv1.user_id != canv2.user_id
