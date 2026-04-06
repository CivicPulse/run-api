"""Integration tests for the full critical path (R001).

Proves the entire product loop works against real DB constraints:
users → organizations → campaigns → campaign_members → import_jobs →
voters → voter_lists → voter_list_members → call_lists →
phone_bank_sessions → turfs → walk_lists.

Requires: PostgreSQL running via docker compose on port 5433, migrations applied.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.time import utcnow


@pytest.fixture
async def critical_path_data(superuser_session):
    """Insert records across the full FK dependency chain and yield IDs.

    Insert order follows FK dependencies:
    1. users (owner)
    2. organizations (FK → users)
    3. campaigns (FK → organizations, users)
    4. campaign_members (FK → users, campaigns)
    5. import_jobs (FK → campaigns, users)
    6. voters (FK → campaigns)
    7. voter_lists (FK → campaigns, users)
    8. voter_list_members (FK → voter_lists, voters)
    9. call_lists (FK → campaigns, voter_lists, users)
    10. phone_bank_sessions (FK → campaigns, call_lists, users)
    11. turfs (FK → campaigns, users) — needs PostGIS
    12. walk_lists (FK → campaigns, turfs, users)
    """
    session = superuser_session
    now = utcnow()

    # Generate IDs up front
    user_id = f"cp-user-{uuid.uuid4().hex[:8]}"
    org_id = uuid.uuid4()
    campaign_id = uuid.uuid4()
    member_id = uuid.uuid4()
    import_job_id = uuid.uuid4()
    voter_id = uuid.uuid4()
    voter_list_id = uuid.uuid4()
    call_list_id = uuid.uuid4()
    pb_session_id = uuid.uuid4()
    turf_id = uuid.uuid4()
    walk_list_id = uuid.uuid4()

    # 1. User
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_id,
            "name": "Critical Path User",
            "email": f"cp-{uuid.uuid4().hex[:6]}@test.com",
            "now": now,
        },
    )

    # 2. Organization
    await session.execute(
        text(
            "INSERT INTO organizations (id, zitadel_org_id, name, created_by, created_at, updated_at) "
            "VALUES (:id, :zitadel_org_id, :name, :created_by, :now, :now)"
        ),
        {
            "id": org_id,
            "zitadel_org_id": f"zorg-cp-{org_id.hex[:8]}",
            "name": "Critical Path Org",
            "created_by": user_id,
            "now": now,
        },
    )

    # 3. Campaign (linked to organization)
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, organization_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :zitadel_org_id, :organization_id, :name, :type, :status, "
            ":created_by, :now, :now)"
        ),
        {
            "id": campaign_id,
            "zitadel_org_id": f"zorg-cp-{org_id.hex[:8]}",
            "organization_id": org_id,
            "name": "Critical Path Campaign",
            "type": "STATE",
            "status": "ACTIVE",
            "created_by": user_id,
            "now": now,
        },
    )

    # 4. Campaign member
    await session.execute(
        text(
            "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, :now)"
        ),
        {
            "id": member_id,
            "user_id": user_id,
            "campaign_id": campaign_id,
            "now": now,
        },
    )

    # 5. Import job
    await session.execute(
        text(
            "INSERT INTO import_jobs "
            "(id, campaign_id, status, file_key, original_filename, source_type, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :campaign_id, :status, :file_key, :original_filename, "
            ":source_type, :created_by, :now, :now)"
        ),
        {
            "id": import_job_id,
            "campaign_id": campaign_id,
            "status": "pending",
            "file_key": "uploads/test/critical-path.csv",
            "original_filename": "critical-path.csv",
            "source_type": "csv",
            "created_by": user_id,
            "now": now,
        },
    )

    # 6. Voter
    await session.execute(
        text(
            "INSERT INTO voters "
            "(id, campaign_id, source_type, source_id, first_name, last_name, "
            "created_at, updated_at) "
            "VALUES (:id, :campaign_id, :source_type, :source_id, :first_name, "
            ":last_name, :now, :now)"
        ),
        {
            "id": voter_id,
            "campaign_id": campaign_id,
            "source_type": "csv",
            "source_id": f"cp-voter-{voter_id.hex[:8]}",
            "first_name": "Jane",
            "last_name": "Doe",
            "now": now,
        },
    )

    # 7. Voter list
    await session.execute(
        text(
            "INSERT INTO voter_lists "
            "(id, campaign_id, name, list_type, created_by, created_at, updated_at) "
            "VALUES (:id, :campaign_id, :name, :list_type, :created_by, :now, :now)"
        ),
        {
            "id": voter_list_id,
            "campaign_id": campaign_id,
            "name": "Critical Path Voter List",
            "list_type": "static",
            "created_by": user_id,
            "now": now,
        },
    )

    # 8. Voter list member
    await session.execute(
        text(
            "INSERT INTO voter_list_members (voter_list_id, voter_id) "
            "VALUES (:voter_list_id, :voter_id)"
        ),
        {"voter_list_id": voter_list_id, "voter_id": voter_id},
    )

    # 9. Call list (linked to voter_list)
    await session.execute(
        text(
            "INSERT INTO call_lists "
            "(id, campaign_id, voter_list_id, name, status, total_entries, "
            "completed_entries, max_attempts, created_by, created_at) "
            "VALUES (:id, :campaign_id, :voter_list_id, :name, :status, 0, 0, 3, "
            ":created_by, :now)"
        ),
        {
            "id": call_list_id,
            "campaign_id": campaign_id,
            "voter_list_id": voter_list_id,
            "name": "Critical Path Call List",
            "status": "ACTIVE",
            "created_by": user_id,
            "now": now,
        },
    )

    # 10. Phone bank session
    await session.execute(
        text(
            "INSERT INTO phone_bank_sessions "
            "(id, campaign_id, call_list_id, name, status, created_by, "
            "created_at, updated_at) "
            "VALUES (:id, :campaign_id, :call_list_id, :name, :status, "
            ":created_by, :now, :now)"
        ),
        {
            "id": pb_session_id,
            "campaign_id": campaign_id,
            "call_list_id": call_list_id,
            "name": "Critical Path Session",
            "status": "draft",
            "created_by": user_id,
            "now": now,
        },
    )

    # 11. Turf (PostGIS geometry required for walk list FK)
    await session.execute(
        text(
            "INSERT INTO turfs "
            "(id, campaign_id, name, boundary, created_by, created_at) "
            "VALUES (:id, :campaign_id, :name, "
            "ST_GeomFromText('POLYGON((-77.0 38.9, -77.0 39.0, -76.9 39.0, "
            "-76.9 38.9, -77.0 38.9))', 4326), :created_by, :now)"
        ),
        {
            "id": turf_id,
            "campaign_id": campaign_id,
            "name": "Critical Path Turf",
            "created_by": user_id,
            "now": now,
        },
    )

    # 12. Walk list
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
            "name": "Critical Path Walk List",
            "created_by": user_id,
            "now": now,
        },
    )

    await session.commit()

    yield {
        "user_id": user_id,
        "org_id": org_id,
        "campaign_id": campaign_id,
        "member_id": member_id,
        "import_job_id": import_job_id,
        "voter_id": voter_id,
        "voter_list_id": voter_list_id,
        "call_list_id": call_list_id,
        "pb_session_id": pb_session_id,
        "turf_id": turf_id,
        "walk_list_id": walk_list_id,
    }

    # Cleanup in reverse FK order
    await session.execute(
        text("DELETE FROM walk_lists WHERE id = :id"), {"id": walk_list_id}
    )
    await session.execute(text("DELETE FROM turfs WHERE id = :id"), {"id": turf_id})
    await session.execute(
        text("DELETE FROM phone_bank_sessions WHERE id = :id"), {"id": pb_session_id}
    )
    await session.execute(
        text("DELETE FROM call_lists WHERE id = :id"), {"id": call_list_id}
    )
    await session.execute(
        text(
            "DELETE FROM voter_list_members WHERE voter_list_id = :vlid AND voter_id = :vid"
        ),
        {"vlid": voter_list_id, "vid": voter_id},
    )
    await session.execute(
        text("DELETE FROM voter_lists WHERE id = :id"), {"id": voter_list_id}
    )
    await session.execute(text("DELETE FROM voters WHERE id = :id"), {"id": voter_id})
    await session.execute(
        text("DELETE FROM import_jobs WHERE id = :id"), {"id": import_job_id}
    )
    await session.execute(
        text("DELETE FROM campaign_members WHERE id = :id"), {"id": member_id}
    )
    await session.execute(
        text("DELETE FROM campaigns WHERE id = :id"), {"id": campaign_id}
    )
    await session.execute(
        text("DELETE FROM organizations WHERE id = :id"), {"id": org_id}
    )
    await session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    await session.commit()


# ---------------------------------------------------------------------------
# Test 1: Every entity in the critical path was created successfully
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_critical_path_all_entities_created(
    superuser_session, critical_path_data
):
    """Every INSERT across the 12-table critical path succeeds and each record exists."""
    session = superuser_session
    ids = critical_path_data

    # Verify each table has exactly the record we inserted
    queries = [
        ("users", "id = :id", {"id": ids["user_id"]}),
        ("organizations", "id = :id", {"id": ids["org_id"]}),
        ("campaigns", "id = :id", {"id": ids["campaign_id"]}),
        ("campaign_members", "id = :id", {"id": ids["member_id"]}),
        ("import_jobs", "id = :id", {"id": ids["import_job_id"]}),
        ("voters", "id = :id", {"id": ids["voter_id"]}),
        ("voter_lists", "id = :id", {"id": ids["voter_list_id"]}),
        (
            "voter_list_members",
            "voter_list_id = :vlid AND voter_id = :vid",
            {"vlid": ids["voter_list_id"], "vid": ids["voter_id"]},
        ),
        ("call_lists", "id = :id", {"id": ids["call_list_id"]}),
        ("phone_bank_sessions", "id = :id", {"id": ids["pb_session_id"]}),
        ("turfs", "id = :id", {"id": ids["turf_id"]}),
        ("walk_lists", "id = :id", {"id": ids["walk_list_id"]}),
    ]

    for table, where, params in queries:
        result = await session.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE {where}"), params
        )
        count = result.scalar()
        assert count == 1, f"Expected 1 row in {table}, got {count}"


# ---------------------------------------------------------------------------
# Test 2: FK integrity — cross-table references are correct
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_critical_path_cascade_integrity(superuser_session, critical_path_data):
    """Cross-table FK references are consistent across the full chain."""
    session = superuser_session
    ids = critical_path_data

    # Organization.created_by → user
    row = (
        await session.execute(
            text("SELECT created_by FROM organizations WHERE id = :id"),
            {"id": ids["org_id"]},
        )
    ).one()
    assert row.created_by == ids["user_id"]

    # Campaign.organization_id → organization
    row = (
        await session.execute(
            text("SELECT organization_id, created_by FROM campaigns WHERE id = :id"),
            {"id": ids["campaign_id"]},
        )
    ).one()
    assert row.organization_id == ids["org_id"]
    assert row.created_by == ids["user_id"]

    # Campaign member → campaign + user
    row = (
        await session.execute(
            text("SELECT user_id, campaign_id FROM campaign_members WHERE id = :id"),
            {"id": ids["member_id"]},
        )
    ).one()
    assert row.user_id == ids["user_id"]
    assert row.campaign_id == ids["campaign_id"]

    # Import job → campaign
    row = (
        await session.execute(
            text("SELECT campaign_id, created_by FROM import_jobs WHERE id = :id"),
            {"id": ids["import_job_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.created_by == ids["user_id"]

    # Voter → campaign
    row = (
        await session.execute(
            text("SELECT campaign_id FROM voters WHERE id = :id"),
            {"id": ids["voter_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]

    # Voter list → campaign
    row = (
        await session.execute(
            text("SELECT campaign_id, created_by FROM voter_lists WHERE id = :id"),
            {"id": ids["voter_list_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.created_by == ids["user_id"]

    # Voter list member → voter list + voter
    row = (
        await session.execute(
            text(
                "SELECT voter_list_id, voter_id FROM voter_list_members "
                "WHERE voter_list_id = :vlid AND voter_id = :vid"
            ),
            {"vlid": ids["voter_list_id"], "vid": ids["voter_id"]},
        )
    ).one()
    assert row.voter_list_id == ids["voter_list_id"]
    assert row.voter_id == ids["voter_id"]

    # Call list → campaign + voter list
    row = (
        await session.execute(
            text(
                "SELECT campaign_id, voter_list_id, created_by "
                "FROM call_lists WHERE id = :id"
            ),
            {"id": ids["call_list_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.voter_list_id == ids["voter_list_id"]
    assert row.created_by == ids["user_id"]

    # Phone bank session → campaign + call list
    row = (
        await session.execute(
            text(
                "SELECT campaign_id, call_list_id, created_by "
                "FROM phone_bank_sessions WHERE id = :id"
            ),
            {"id": ids["pb_session_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.call_list_id == ids["call_list_id"]
    assert row.created_by == ids["user_id"]

    # Turf → campaign
    row = (
        await session.execute(
            text("SELECT campaign_id, created_by FROM turfs WHERE id = :id"),
            {"id": ids["turf_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.created_by == ids["user_id"]

    # Walk list → campaign + turf
    row = (
        await session.execute(
            text(
                "SELECT campaign_id, turf_id, created_by FROM walk_lists WHERE id = :id"
            ),
            {"id": ids["walk_list_id"]},
        )
    ).one()
    assert row.campaign_id == ids["campaign_id"]
    assert row.turf_id == ids["turf_id"]
    assert row.created_by == ids["user_id"]
