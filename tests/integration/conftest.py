"""Integration test fixtures -- real database with RLS verification.

These fixtures create isolated test data using superuser connections
and verify RLS enforcement using the app_user role.
"""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.time import utcnow

# Database URLs for integration tests (port from env, default 5433)
_DB_PORT = os.environ.get("TEST_DB_PORT", "5433")
SUPERUSER_URL = f"postgresql+asyncpg://postgres:postgres@localhost:{_DB_PORT}/run_api"
APP_USER_URL = (
    f"postgresql+asyncpg://app_user:app_password@localhost:{_DB_PORT}/run_api"
)


@pytest.fixture
def superuser_engine():
    """Superuser engine for test setup/teardown."""
    engine = create_async_engine(SUPERUSER_URL, echo=False)
    yield engine


@pytest.fixture
def app_user_engine():
    """App user engine for RLS testing.

    Registers a checkout listener that resets RLS context to a safe
    null-UUID, matching the app's production behavior. Without this,
    the config defaults to empty string which fails ``::uuid`` casts
    in RLS policies.
    """
    engine = create_async_engine(APP_USER_URL, echo=False)

    @event.listens_for(engine.sync_engine, "checkout")
    def _reset_rls(dbapi_conn, rec, proxy):
        cur = dbapi_conn.cursor()
        cur.execute(
            "SELECT set_config('app.current_campaign_id',"
            " '00000000-0000-0000-0000-000000000000', false)"
        )
        cur.close()

    yield engine


@pytest.fixture
async def superuser_session(superuser_engine):
    """Superuser session (bypasses RLS)."""
    session_factory = async_sessionmaker(
        superuser_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
async def app_user_session(app_user_engine):
    """App user session (RLS enforced)."""
    session_factory = async_sessionmaker(
        app_user_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
async def two_campaigns(superuser_session):
    """Create two campaigns with separate data for RLS testing.

    Returns dict with campaign_a and campaign_b UUIDs and test data IDs.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-b-{uuid.uuid4().hex[:8]}"

    # Create users
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_a_id,
            "name": "User A",
            "email": "usera@test.com",
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_b_id,
            "name": "User B",
            "email": "userb@test.com",
            "now": utcnow(),
        },
    )

    # Create campaigns
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_a_id,
            "org_id": f"org-a-{campaign_a_id.hex[:8]}",
            "name": "Campaign A",
            "type": "STATE",
            "status": "ACTIVE",
            "created_by": user_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_b_id,
            "org_id": f"org-b-{campaign_b_id.hex[:8]}",
            "name": "Campaign B",
            "type": "FEDERAL",
            "status": "ACTIVE",
            "created_by": user_b_id,
            "now": utcnow(),
        },
    )

    # Create campaign members
    await session.execute(
        text(
            "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_a_id,
            "campaign_id": campaign_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_b_id,
            "campaign_id": campaign_b_id,
            "now": utcnow(),
        },
    )

    # Create invites
    await session.execute(
        text(
            "INSERT INTO invites "
            "(id, campaign_id, email, role, token, expires_at, created_by, created_at) "
            "VALUES (:id, :campaign_id, :email, :role, "
            ":token, :expires_at, :created_by, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "campaign_id": campaign_a_id,
            "email": "invite-a@test.com",
            "role": "manager",
            "token": uuid.uuid4(),
            "expires_at": utcnow() + timedelta(days=7),
            "created_by": user_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO invites "
            "(id, campaign_id, email, role, token, expires_at, created_by, created_at) "
            "VALUES (:id, :campaign_id, :email, :role, "
            ":token, :expires_at, :created_by, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "campaign_id": campaign_b_id,
            "email": "invite-b@test.com",
            "role": "admin",
            "token": uuid.uuid4(),
            "expires_at": utcnow() + timedelta(days=7),
            "created_by": user_b_id,
            "now": utcnow(),
        },
    )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
    }

    # Cleanup
    await session.execute(
        text("DELETE FROM invites WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
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


@pytest.fixture
async def two_campaigns_with_resources(superuser_session):
    """Two campaigns each with a full resource set for tenant-isolation tests.

    Extends ``two_campaigns`` by seeding one row per campaign for each of:
    VoterList, ImportJob, VoterTag, Voter, SurveyScript, SurveyQuestion,
    plus an Invite (already present from the existing two_campaigns pattern).

    All inserts use the superuser session (bypasses RLS). Enum columns use
    the lowercase string values enforced by the app's StrEnum models.

    Yields a dict with every resource id needed by Phase 71 IDOR tests.
    """
    session = superuser_session
    now = utcnow()

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-res-a-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-res-b-{uuid.uuid4().hex[:8]}"
    org_a_id = f"org-res-a-{campaign_a_id.hex[:8]}"
    org_b_id = f"org-res-b-{campaign_b_id.hex[:8]}"

    voter_list_a_id = uuid.uuid4()
    voter_list_b_id = uuid.uuid4()
    import_job_a_id = uuid.uuid4()
    import_job_b_id = uuid.uuid4()
    voter_tag_a_id = uuid.uuid4()
    voter_tag_b_id = uuid.uuid4()
    voter_a_id = uuid.uuid4()
    voter_b_id = uuid.uuid4()
    survey_script_a_id = uuid.uuid4()
    survey_script_b_id = uuid.uuid4()
    survey_question_a_id = uuid.uuid4()
    survey_question_b_id = uuid.uuid4()
    invite_a_id = uuid.uuid4()
    invite_b_id = uuid.uuid4()

    # Users
    for uid, name, email in [
        (user_a_id, "Res User A", "res-usera@test.com"),
        (user_b_id, "Res User B", "res-userb@test.com"),
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
        (campaign_a_id, org_a_id, "Res Campaign A", "STATE", user_a_id),
        (campaign_b_id, org_b_id, "Res Campaign B", "FEDERAL", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaigns "
                "(id, zitadel_org_id, name, type, status, "
                "created_by, created_at, updated_at) "
                "VALUES (:id, :org_id, :name, :type, 'ACTIVE', "
                ":created_by, :now, :now)"
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

    # Campaign members (admin role so role-gated endpoints permit access)
    for uid, cid in [
        (user_a_id, campaign_a_id),
        (user_b_id, campaign_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO campaign_members "
                "(id, user_id, campaign_id, role, synced_at) "
                "VALUES (:id, :user_id, :campaign_id, 'admin', :now)"
            ),
            {
                "id": uuid.uuid4(),
                "user_id": uid,
                "campaign_id": cid,
                "now": now,
            },
        )

    # Invites
    for inv_id, cid, email, created_by in [
        (invite_a_id, campaign_a_id, "res-invite-a@test.com", user_a_id),
        (invite_b_id, campaign_b_id, "res-invite-b@test.com", user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO invites "
                "(id, campaign_id, email, role, token, expires_at, "
                "created_by, created_at) "
                "VALUES (:id, :cid, :email, 'manager', :token, "
                ":expires, :created_by, :now)"
            ),
            {
                "id": inv_id,
                "cid": cid,
                "email": email,
                "token": uuid.uuid4(),
                "expires": now + timedelta(days=7),
                "created_by": created_by,
                "now": now,
            },
        )

    # Voter lists (static)
    for vl_id, cid, created_by in [
        (voter_list_a_id, campaign_a_id, user_a_id),
        (voter_list_b_id, campaign_b_id, user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO voter_lists "
                "(id, campaign_id, name, list_type, created_by, "
                "created_at, updated_at) "
                "VALUES (:id, :cid, :name, 'static', :created_by, "
                ":now, :now)"
            ),
            {
                "id": vl_id,
                "cid": cid,
                "name": f"List {cid.hex[:6]}",
                "created_by": created_by,
                "now": now,
            },
        )

    # Import jobs (uploaded)
    for ij_id, cid, created_by in [
        (import_job_a_id, campaign_a_id, user_a_id),
        (import_job_b_id, campaign_b_id, user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO import_jobs "
                "(id, campaign_id, status, file_key, original_filename, "
                "source_type, created_by, created_at, updated_at) "
                "VALUES (:id, :cid, 'uploaded', :fk, :fn, 'csv', "
                ":created_by, :now, :now)"
            ),
            {
                "id": ij_id,
                "cid": cid,
                "fk": f"imports/{ij_id}.csv",
                "fn": f"{ij_id}.csv",
                "created_by": created_by,
                "now": now,
            },
        )

    # Voter tags
    for vt_id, cid, name in [
        (voter_tag_a_id, campaign_a_id, f"tag-a-{voter_tag_a_id.hex[:6]}"),
        (voter_tag_b_id, campaign_b_id, f"tag-b-{voter_tag_b_id.hex[:6]}"),
    ]:
        await session.execute(
            text(
                "INSERT INTO voter_tags (id, campaign_id, name) "
                "VALUES (:id, :cid, :name)"
            ),
            {"id": vt_id, "cid": cid, "name": name},
        )

    # Voters
    for v_id, cid in [
        (voter_a_id, campaign_a_id),
        (voter_b_id, campaign_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO voters "
                "(id, campaign_id, source_type, first_name, last_name, "
                "created_at, updated_at) "
                "VALUES (:id, :cid, 'manual', 'Res', 'Voter', :now, :now)"
            ),
            {"id": v_id, "cid": cid, "now": now},
        )

    # Survey scripts (draft) + one question each
    for sc_id, cid, created_by in [
        (survey_script_a_id, campaign_a_id, user_a_id),
        (survey_script_b_id, campaign_b_id, user_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO survey_scripts "
                "(id, campaign_id, title, status, created_by, "
                "created_at, updated_at) "
                "VALUES (:id, :cid, :title, 'draft', :created_by, "
                ":now, :now)"
            ),
            {
                "id": sc_id,
                "cid": cid,
                "title": f"Script {sc_id.hex[:6]}",
                "created_by": created_by,
                "now": now,
            },
        )

    for q_id, script_id in [
        (survey_question_a_id, survey_script_a_id),
        (survey_question_b_id, survey_script_b_id),
    ]:
        await session.execute(
            text(
                "INSERT INTO survey_questions "
                "(id, script_id, position, question_text, question_type) "
                "VALUES (:id, :sid, 1, :txt, 'free_text')"
            ),
            {
                "id": q_id,
                "sid": script_id,
                "txt": f"Question {q_id.hex[:6]}?",
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
        "voter_list_a_id": voter_list_a_id,
        "voter_list_b_id": voter_list_b_id,
        "import_job_a_id": import_job_a_id,
        "import_job_b_id": import_job_b_id,
        "voter_tag_a_id": voter_tag_a_id,
        "voter_tag_b_id": voter_tag_b_id,
        "voter_a_id": voter_a_id,
        "voter_b_id": voter_b_id,
        "survey_script_a_id": survey_script_a_id,
        "survey_script_b_id": survey_script_b_id,
        "survey_question_a_id": survey_question_a_id,
        "survey_question_b_id": survey_question_b_id,
        "invite_a_id": invite_a_id,
        "invite_b_id": invite_b_id,
    }

    # Teardown -- reverse FK order
    for table in [
        "survey_questions",
        "survey_scripts",
        "voter_tag_members",
        "voter_tags",
        "voter_list_members",
        "voter_lists",
        "import_chunks",
        "import_jobs",
        "voters",
        "invites",
        "campaign_members",
    ]:
        if table == "survey_questions":
            await session.execute(
                text("DELETE FROM survey_questions WHERE script_id IN (:a, :b)"),
                {"a": survey_script_a_id, "b": survey_script_b_id},
            )
        elif table == "voter_tag_members":
            await session.execute(
                text("DELETE FROM voter_tag_members WHERE tag_id IN (:a, :b)"),
                {"a": voter_tag_a_id, "b": voter_tag_b_id},
            )
        elif table == "voter_list_members":
            await session.execute(
                text("DELETE FROM voter_list_members WHERE voter_list_id IN (:a, :b)"),
                {"a": voter_list_a_id, "b": voter_list_b_id},
            )
        else:
            await session.execute(
                text(f"DELETE FROM {table} WHERE campaign_id IN (:a, :b)"),
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
