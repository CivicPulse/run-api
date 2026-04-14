"""Integration tests for volunteer→user reconciliation (Phase 111 / MIGRATE-02).

These tests exercise app.services.volunteer_reconciliation against a real
postgres database via the superuser_session fixture. Each test seeds its
own minimal fixture (campaign + users + campaign_members + volunteers),
runs the reconciliation helper via run_sync(), and asserts the resulting
report counts and post-update row state.

Markers: integration -- requires the docker compose postgres service.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.volunteer_reconciliation import (
    ReconciliationReport,
    reconcile_volunteers,
)

pytestmark = pytest.mark.integration


# ---------- helpers ----------


async def _insert_user(session: AsyncSession, email: str) -> str:
    uid = f"recon-user-{uuid.uuid4().hex[:12]}"
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, NOW(), NOW())"
        ),
        {"id": uid, "name": f"User {email}", "email": email},
    )
    return uid


async def _insert_campaign(
    session: AsyncSession, name: str, created_by: str
) -> uuid.UUID:
    cid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            " created_by, created_at, updated_at) "
            "VALUES (:id, :org, :name, 'STATE', 'ACTIVE', "
            " :created_by, NOW(), NOW())"
        ),
        {
            "id": cid,
            "org": f"recon-org-{cid.hex[:8]}",
            "name": name,
            "created_by": created_by,
        },
    )
    return cid


async def _insert_campaign_member(
    session: AsyncSession, user_id: str, campaign_id: uuid.UUID
) -> None:
    await session.execute(
        text(
            "INSERT INTO campaign_members "
            "(id, user_id, campaign_id, role, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, 'volunteer', NOW())"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_id,
            "campaign_id": campaign_id,
        },
    )


async def _insert_volunteer(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    email: str | None,
    creator_user_id: str,
) -> uuid.UUID:
    vid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO volunteers "
            "(id, campaign_id, first_name, last_name, email, status, "
            " skills, created_by, created_at, updated_at) "
            "VALUES (:id, :campaign_id, 'Test', 'Volunteer', :email, "
            " 'pending', '{}'::varchar[], :created_by, NOW(), NOW())"
        ),
        {
            "id": vid,
            "campaign_id": campaign_id,
            "email": email,
            "created_by": creator_user_id,
        },
    )
    return vid


async def _get_volunteer_user_id(
    session: AsyncSession, volunteer_id: uuid.UUID
) -> str | None:
    row = await session.execute(
        text("SELECT user_id FROM volunteers WHERE id = :id"),
        {"id": volunteer_id},
    )
    return row.scalar_one_or_none()


async def _cleanup(
    session: AsyncSession,
    *,
    campaign_ids: list[uuid.UUID],
    user_ids: list[str],
) -> None:
    """Tear down per-test rows in FK-safe order."""
    if campaign_ids:
        await session.execute(
            text("DELETE FROM volunteers WHERE campaign_id = ANY(:cids)"),
            {"cids": campaign_ids},
        )
        await session.execute(
            text("DELETE FROM campaign_members WHERE campaign_id = ANY(:cids)"),
            {"cids": campaign_ids},
        )
        await session.execute(
            text("DELETE FROM campaigns WHERE id = ANY(:cids)"),
            {"cids": campaign_ids},
        )
    if user_ids:
        await session.execute(
            text("DELETE FROM users WHERE id = ANY(:uids)"),
            {"uids": user_ids},
        )
    await session.commit()


async def _run_reconcile(
    session: AsyncSession, artifact_path: Path
) -> ReconciliationReport:
    """Bridge async session to the sync helper via run_sync."""
    conn = await session.connection()
    return await conn.run_sync(
        lambda sync_conn: reconcile_volunteers(
            sync_conn, artifact_path=artifact_path
        )
    )


# ---------- tests ----------


async def test_link_case(superuser_session, tmp_path):
    """One volunteer + one matching user in same campaign -> linked."""
    artifact = tmp_path / "recon-link.jsonl"
    creator = await _insert_user(superuser_session, "creator-link@example.com")
    matched_user = await _insert_user(
        superuser_session, "Julia.Callahan@example.com"
    )
    campaign = await _insert_campaign(superuser_session, "Link Case", creator)
    await _insert_campaign_member(superuser_session, matched_user, campaign)
    volunteer = await _insert_volunteer(
        superuser_session,
        campaign,
        email="julia.callahan@example.com",  # different case on purpose
        creator_user_id=creator,
    )
    await superuser_session.commit()

    try:
        report = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()

        assert report.linked == 1, f"expected 1 link, got {report.linked}"
        assert report.ambiguous == 0
        assert (
            await _get_volunteer_user_id(superuser_session, volunteer)
        ) == matched_user
        assert artifact.exists()
        assert artifact.read_text() == ""  # no ambiguous rows
    finally:
        await _cleanup(
            superuser_session,
            campaign_ids=[campaign],
            user_ids=[creator, matched_user],
        )


async def test_ambiguous_case(superuser_session, tmp_path):
    """One volunteer + two matching users in same campaign -> ambiguous."""
    artifact = tmp_path / "recon-ambig.jsonl"
    creator = await _insert_user(superuser_session, "creator-ambig@example.com")
    user_a = await _insert_user(superuser_session, "dup@example.com")
    user_b = await _insert_user(superuser_session, "DUP@example.com")
    campaign = await _insert_campaign(superuser_session, "Ambig Case", creator)
    await _insert_campaign_member(superuser_session, user_a, campaign)
    await _insert_campaign_member(superuser_session, user_b, campaign)
    volunteer = await _insert_volunteer(
        superuser_session,
        campaign,
        email="dup@example.com",
        creator_user_id=creator,
    )
    await superuser_session.commit()

    try:
        report = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()

        assert report.linked == 0
        assert report.ambiguous == 1
        assert (
            await _get_volunteer_user_id(superuser_session, volunteer)
        ) is None  # left untouched
        artifact_lines = artifact.read_text().strip().splitlines()
        assert len(artifact_lines) == 1
        assert "dup@example.com" in artifact_lines[0]
        assert user_a in artifact_lines[0]
        assert user_b in artifact_lines[0]
    finally:
        await _cleanup(
            superuser_session,
            campaign_ids=[campaign],
            user_ids=[creator, user_a, user_b],
        )


async def test_no_match_case(superuser_session, tmp_path):
    """One volunteer + zero matching users -> unchanged."""
    artifact = tmp_path / "recon-nomatch.jsonl"
    creator = await _insert_user(superuser_session, "creator-nm@example.com")
    campaign = await _insert_campaign(superuser_session, "NoMatch Case", creator)
    volunteer = await _insert_volunteer(
        superuser_session,
        campaign,
        email="nobody-recon@example.com",
        creator_user_id=creator,
    )
    await superuser_session.commit()

    try:
        report = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()

        assert report.linked == 0
        assert report.ambiguous == 0
        assert report.unchanged >= 1
        assert (
            await _get_volunteer_user_id(superuser_session, volunteer)
        ) is None
    finally:
        await _cleanup(
            superuser_session, campaign_ids=[campaign], user_ids=[creator]
        )


async def test_idempotent_rerun(superuser_session, tmp_path):
    """Re-running reconciliation produces zero new links."""
    artifact = tmp_path / "recon-idem.jsonl"
    creator = await _insert_user(superuser_session, "creator-idem@example.com")
    matched = await _insert_user(superuser_session, "alex-recon@example.com")
    campaign = await _insert_campaign(superuser_session, "Idempotent Case", creator)
    await _insert_campaign_member(superuser_session, matched, campaign)
    volunteer = await _insert_volunteer(
        superuser_session,
        campaign,
        email="alex-recon@example.com",
        creator_user_id=creator,
    )
    await superuser_session.commit()

    try:
        first = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()
        assert first.linked == 1

        second = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()
        assert second.linked == 0, "second run must produce zero new links"
        assert second.ambiguous == 0
        # Volunteer is now linked, so it's no longer in the user_id IS NULL
        # candidate set on the second run.
        assert (
            await _get_volunteer_user_id(superuser_session, volunteer)
        ) == matched
    finally:
        await _cleanup(
            superuser_session,
            campaign_ids=[campaign],
            user_ids=[creator, matched],
        )


async def test_cross_campaign_match_rejected(superuser_session, tmp_path):
    """Volunteer in campaign A and user-with-same-email only a member of
    campaign B -> NOT linked (D-02 multi-tenant isolation)."""
    artifact = tmp_path / "recon-cross.jsonl"
    creator = await _insert_user(superuser_session, "creator-cross@example.com")
    user = await _insert_user(superuser_session, "shared-recon@example.com")
    campaign_a = await _insert_campaign(superuser_session, "Cross A", creator)
    campaign_b = await _insert_campaign(superuser_session, "Cross B", creator)
    # user is a campaign_member of B only, NOT A
    await _insert_campaign_member(superuser_session, user, campaign_b)
    volunteer = await _insert_volunteer(
        superuser_session,
        campaign_a,
        email="shared-recon@example.com",
        creator_user_id=creator,
    )
    await superuser_session.commit()

    try:
        report = await _run_reconcile(superuser_session, artifact)
        await superuser_session.commit()

        assert report.linked == 0
        assert (
            await _get_volunteer_user_id(superuser_session, volunteer)
        ) is None
    finally:
        await _cleanup(
            superuser_session,
            campaign_ids=[campaign_a, campaign_b],
            user_ids=[creator, user],
        )
