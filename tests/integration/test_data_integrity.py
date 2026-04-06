"""Integration tests for Phase 74 data integrity & concurrency.

Covers DATA-01 (shift signup race), DATA-04 (voter_interactions indexes),
DATA-05 (pending-invite partial UQ), DATA-06 (VoterEmail UQ),
DATA-07 (VolunteerTag UQ), and the pre-existing DNC UQ that C10 relies on.

DATA-01 is currently RED (fails until Plan 02 adds with_for_update to
``_get_shift_raw``). The schema tests (DATA-04/05/06/07) pass as soon
as migration 027_data_integrity is applied.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.time import utcnow
from app.models.shift import ShiftVolunteer, SignupStatus
from app.services.shift import ShiftService

pytestmark = pytest.mark.integration


async def _insert_campaign_and_user(session: AsyncSession) -> tuple[uuid.UUID, str]:
    """Seed a campaign + user, returning their IDs. Caller must commit."""
    campaign_id = uuid.uuid4()
    user_id = f"user-di-{uuid.uuid4().hex[:8]}"
    now = utcnow()
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_id,
            "name": "Data Integrity User",
            "email": f"{user_id}@test.com",
            "now": now,
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, 'STATE', 'ACTIVE', :cb, :now, :now)"
        ),
        {
            "id": campaign_id,
            "org_id": f"org-di-{campaign_id.hex[:8]}",
            "name": "Data Integrity Campaign",
            "cb": user_id,
            "now": now,
        },
    )
    return campaign_id, user_id


async def _delete_campaign_and_user(
    session: AsyncSession, campaign_id: uuid.UUID, user_id: str
) -> None:
    """Teardown helper. Deletes dependent rows in FK-safe order."""
    for table, col, val in [
        ("voter_interactions", "campaign_id", campaign_id),
        ("voter_emails", "campaign_id", campaign_id),
        ("voters", "campaign_id", campaign_id),
        ("volunteer_tags", "campaign_id", campaign_id),
        ("shift_volunteers", "shift_id", None),  # handled below
        ("shifts", "campaign_id", campaign_id),
        ("volunteers", "campaign_id", campaign_id),
        ("invites", "campaign_id", campaign_id),
        ("do_not_call", "campaign_id", campaign_id),
        ("campaigns", "id", campaign_id),
    ]:
        if table == "shift_volunteers":
            await session.execute(
                text(
                    "DELETE FROM shift_volunteers WHERE shift_id IN "
                    "(SELECT id FROM shifts WHERE campaign_id = :cid)"
                ),
                {"cid": campaign_id},
            )
            continue
        await session.execute(
            text(f"DELETE FROM {table} WHERE {col} = :val"),
            {"val": val},
        )
    await session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    await session.commit()


# ---------------------------------------------------------------------------
# DATA-01: Shift signup concurrency
# ---------------------------------------------------------------------------


async def test_shift_signup_race_no_overflow(superuser_engine):
    """Two concurrent signups against a capacity-1 shift cannot both succeed.

    Runs N=5 iterations since concurrent tests can be flaky (proves
    presence of lock, not absence of races). Currently RED until
    Plan 02 adds ``with_for_update`` to ``_get_shift_raw``.
    """
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)

    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        await session.commit()

    try:
        for _iteration in range(5):
            # Create fresh shift + 2 volunteers per iteration
            shift_id = uuid.uuid4()
            vol_a = uuid.uuid4()
            vol_b = uuid.uuid4()
            now = utcnow()

            async with factory() as session:
                await session.execute(
                    text(
                        "INSERT INTO shifts "
                        "(id, campaign_id, name, type, status, "
                        "start_at, end_at, max_volunteers, "
                        "created_by, created_at, updated_at) "
                        "VALUES (:id, :cid, 'Race Shift', 'canvassing', "
                        "'scheduled', :start, :end, 1, :cb, :now, :now)"
                    ),
                    {
                        "id": shift_id,
                        "cid": campaign_id,
                        "start": now + timedelta(hours=1),
                        "end": now + timedelta(hours=3),
                        "cb": user_id,
                        "now": now,
                    },
                )
                for vid in (vol_a, vol_b):
                    await session.execute(
                        text(
                            "INSERT INTO volunteers "
                            "(id, campaign_id, first_name, last_name, "
                            "status, skills, created_by, "
                            "created_at, updated_at) "
                            "VALUES (:id, :cid, 'V', :ln, 'active', "
                            "ARRAY[]::varchar[], :cb, :now, :now)"
                        ),
                        {
                            "id": vid,
                            "cid": campaign_id,
                            "ln": vid.hex[:6],
                            "cb": user_id,
                            "now": now,
                        },
                    )
                await session.commit()

            svc = ShiftService()

            async def attempt_signup(
                volunteer_id: uuid.UUID,
                sid: uuid.UUID = shift_id,
                service: ShiftService = svc,
            ) -> str:
                async with factory() as s:
                    try:
                        await s.execute(
                            text(
                                "SELECT set_config('app.current_campaign_id',"
                                " :cid, false)"
                            ),
                            {"cid": str(campaign_id)},
                        )
                        # Force interleaving between SELECT and the count query
                        await asyncio.sleep(0)
                        await service.signup_volunteer(s, sid, volunteer_id)
                        await s.commit()
                        return "signed_up"
                    except Exception as exc:  # noqa: BLE001
                        await s.rollback()
                        return f"failed: {exc}"

            await asyncio.gather(
                attempt_signup(vol_a),
                attempt_signup(vol_b),
                return_exceptions=True,
            )

            async with factory() as session:
                result = await session.execute(
                    select(func.count())
                    .select_from(ShiftVolunteer)
                    .where(
                        ShiftVolunteer.shift_id == shift_id,
                        ShiftVolunteer.status == SignupStatus.SIGNED_UP,
                    )
                )
                signed_up = result.scalar_one()

            assert signed_up <= 1, (
                f"iteration {_iteration}: capacity overflow "
                f"({signed_up} SIGNED_UP for max_volunteers=1)"
            )
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


# ---------------------------------------------------------------------------
# DATA-02: DNC concurrent import (optional, skipped for Wave 0)
# ---------------------------------------------------------------------------


async def test_dnc_concurrent_import(superuser_engine):
    """Two concurrent DNC imports with overlapping numbers don't raise.

    Uses pg_insert().on_conflict_do_nothing on (campaign_id, phone_number)
    so the second transaction's overlapping rows are silently skipped at
    the DB level -- no IntegrityError bubbles up. Combined row count
    equals the union of both input sets.
    """
    from app.services.dnc import DNCService

    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)

    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        await session.commit()

    svc = DNCService()

    # Two CSVs with overlapping phones: 3 shared, 2 unique to each = union of 7
    shared = ["5551110000", "5551110001", "5551110002"]
    only_a = ["5551110010", "5551110011"]
    only_b = ["5551110020", "5551110021"]
    csv_a = "phone_number\n" + "\n".join(shared + only_a) + "\n"
    csv_b = "phone_number\n" + "\n".join(shared + only_b) + "\n"

    async def run_import(csv_content: str) -> object:
        async with factory() as s:
            try:
                res = await svc.bulk_import(s, campaign_id, csv_content, user_id)
                await s.commit()
                return res
            except Exception as exc:  # noqa: BLE001
                await s.rollback()
                return exc

    try:
        results = await asyncio.gather(
            run_import(csv_a), run_import(csv_b), return_exceptions=False
        )

        # Neither call raised an IntegrityError
        for r in results:
            assert not isinstance(r, IntegrityError), f"unexpected IntegrityError: {r}"
            assert not isinstance(r, Exception), f"unexpected exception: {r}"

        # Total rows in DB should equal the union of phone sets (7)
        async with factory() as session:
            count_result = await session.execute(
                text("SELECT COUNT(*) FROM do_not_call WHERE campaign_id = :cid"),
                {"cid": campaign_id},
            )
            total = count_result.scalar_one()
        assert total == len(set(shared + only_a + only_b)), (
            f"expected {len(set(shared + only_a + only_b))} rows, got {total}"
        )
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


# ---------------------------------------------------------------------------
# DATA-04: voter_interactions indexes exist
# ---------------------------------------------------------------------------


async def test_voter_interactions_indexes_exist(superuser_engine):
    """Composite indexes must exist after migration 027."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'voter_interactions' "
                "AND indexname IN ("
                "  'ix_voter_interactions_campaign_voter',"
                "  'ix_voter_interactions_campaign_created'"
                ")"
            )
        )
        names = {row[0] for row in result.all()}
    assert names == {
        "ix_voter_interactions_campaign_voter",
        "ix_voter_interactions_campaign_created",
    }


# ---------------------------------------------------------------------------
# DATA-05: Invite partial unique index
# ---------------------------------------------------------------------------


async def test_reinvite_after_accept_allowed(superuser_engine):
    """Once an invite is accepted, a new pending invite may be created."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        await session.commit()

    try:
        email = f"reinvite-{uuid.uuid4().hex[:6]}@test.com"
        now = utcnow()

        async with factory() as session:
            # First pending invite
            await session.execute(
                text(
                    "INSERT INTO invites "
                    "(id, campaign_id, email, role, token, expires_at, "
                    "created_by, created_at) "
                    "VALUES (:id, :cid, :email, 'manager', :tok, "
                    ":exp, :cb, :now)"
                ),
                {
                    "id": uuid.uuid4(),
                    "cid": campaign_id,
                    "email": email,
                    "tok": uuid.uuid4(),
                    "exp": now + timedelta(days=7),
                    "cb": user_id,
                    "now": now,
                },
            )
            # Mark it accepted
            await session.execute(
                text(
                    "UPDATE invites SET accepted_at = :ts "
                    "WHERE email = :email AND campaign_id = :cid"
                ),
                {"ts": now, "email": email, "cid": campaign_id},
            )
            # New pending invite for same email+campaign should succeed
            await session.execute(
                text(
                    "INSERT INTO invites "
                    "(id, campaign_id, email, role, token, expires_at, "
                    "created_by, created_at) "
                    "VALUES (:id, :cid, :email, 'manager', :tok, "
                    ":exp, :cb, :now)"
                ),
                {
                    "id": uuid.uuid4(),
                    "cid": campaign_id,
                    "email": email,
                    "tok": uuid.uuid4(),
                    "exp": now + timedelta(days=7),
                    "cb": user_id,
                    "now": now,
                },
            )
            await session.commit()
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


async def test_duplicate_pending_invite_blocked(superuser_engine):
    """Two pending invites for same (campaign, email) must violate UQ."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        await session.commit()

    try:
        email = f"dup-{uuid.uuid4().hex[:6]}@test.com"
        now = utcnow()
        async with factory() as session:
            await session.execute(
                text(
                    "INSERT INTO invites "
                    "(id, campaign_id, email, role, token, expires_at, "
                    "created_by, created_at) "
                    "VALUES (:id, :cid, :email, 'manager', :tok, "
                    ":exp, :cb, :now)"
                ),
                {
                    "id": uuid.uuid4(),
                    "cid": campaign_id,
                    "email": email,
                    "tok": uuid.uuid4(),
                    "exp": now + timedelta(days=7),
                    "cb": user_id,
                    "now": now,
                },
            )
            await session.commit()

        with pytest.raises(IntegrityError):
            async with factory() as session:
                await session.execute(
                    text(
                        "INSERT INTO invites "
                        "(id, campaign_id, email, role, token, expires_at, "
                        "created_by, created_at) "
                        "VALUES (:id, :cid, :email, 'manager', :tok, "
                        ":exp, :cb, :now)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "cid": campaign_id,
                        "email": email,
                        "tok": uuid.uuid4(),
                        "exp": now + timedelta(days=7),
                        "cb": user_id,
                        "now": now,
                    },
                )
                await session.commit()
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


# ---------------------------------------------------------------------------
# DATA-06: VoterEmail uniqueness
# ---------------------------------------------------------------------------


async def test_voter_email_unique_violation(superuser_engine):
    """Duplicate (campaign_id, voter_id, value) on voter_emails is rejected."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        voter_id = uuid.uuid4()
        now = utcnow()
        await session.execute(
            text(
                "INSERT INTO voters "
                "(id, campaign_id, source_type, first_name, last_name, "
                "created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'Test', 'Voter', :now, :now)"
            ),
            {"id": voter_id, "cid": campaign_id, "now": now},
        )
        await session.commit()

    try:
        value = f"voter-{uuid.uuid4().hex[:6]}@test.com"
        async with factory() as session:
            await session.execute(
                text(
                    "INSERT INTO voter_emails "
                    "(id, campaign_id, voter_id, value, type, "
                    "is_primary, source, created_at, updated_at) "
                    "VALUES (:id, :cid, :vid, :val, 'home', true, 'manual', "
                    ":now, :now)"
                ),
                {
                    "id": uuid.uuid4(),
                    "cid": campaign_id,
                    "vid": voter_id,
                    "val": value,
                    "now": utcnow(),
                },
            )
            await session.commit()

        with pytest.raises(IntegrityError):
            async with factory() as session:
                await session.execute(
                    text(
                        "INSERT INTO voter_emails "
                        "(id, campaign_id, voter_id, value, type, "
                        "is_primary, source, created_at, updated_at) "
                        "VALUES (:id, :cid, :vid, :val, 'work', false, "
                        "'manual', :now, :now)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "cid": campaign_id,
                        "vid": voter_id,
                        "val": value,
                        "now": utcnow(),
                    },
                )
                await session.commit()
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


# ---------------------------------------------------------------------------
# DATA-07: VolunteerTag uniqueness
# ---------------------------------------------------------------------------


async def test_volunteer_tag_unique_violation(superuser_engine):
    """Duplicate (campaign_id, name) on volunteer_tags is rejected."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        campaign_id, user_id = await _insert_campaign_and_user(session)
        await session.commit()

    try:
        name = f"tag-{uuid.uuid4().hex[:6]}"
        async with factory() as session:
            await session.execute(
                text(
                    "INSERT INTO volunteer_tags (id, campaign_id, name) "
                    "VALUES (:id, :cid, :name)"
                ),
                {"id": uuid.uuid4(), "cid": campaign_id, "name": name},
            )
            await session.commit()

        with pytest.raises(IntegrityError):
            async with factory() as session:
                await session.execute(
                    text(
                        "INSERT INTO volunteer_tags (id, campaign_id, name) "
                        "VALUES (:id, :cid, :name)"
                    ),
                    {"id": uuid.uuid4(), "cid": campaign_id, "name": name},
                )
                await session.commit()
    finally:
        async with factory() as session:
            await _delete_campaign_and_user(session, campaign_id, user_id)


# ---------------------------------------------------------------------------
# Pre-existing DNC unique constraint (prerequisite for C10 ON CONFLICT fix)
# ---------------------------------------------------------------------------


async def test_dnc_has_unique_constraint(superuser_engine):
    """Verify ``uq_dnc_campaign_phone`` exists (C10 ON CONFLICT prereq)."""
    factory = async_sessionmaker(superuser_engine, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conname = 'uq_dnc_campaign_phone'"
            )
        )
        names = {row[0] for row in result.all()}
    assert "uq_dnc_campaign_phone" in names, (
        "DNC unique constraint missing -- Plan 02 C10 fix depends on it"
    )
