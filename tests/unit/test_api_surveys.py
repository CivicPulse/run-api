"""Unit tests for survey API endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.api.deps import get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.main import create_app

CAMPAIGN_ID = uuid.uuid4()
SCRIPT_ID = uuid.uuid4()
QUESTION_ID = uuid.uuid4()
VOTER_ID = uuid.uuid4()
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_user(
    user_id: str = "manager-1",
    org_id: str = "org-test-123",
    role: CampaignRole = CampaignRole.MANAGER,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"User {user_id}",
    )


def _override_app(user: AuthenticatedUser, db: AsyncMock):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user

    async def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_db
    return app


def _setup_role_resolution(db: AsyncMock, role: str = "manager") -> None:
    role_member = SimpleNamespace(role=role)
    campaign = SimpleNamespace(
        id=CAMPAIGN_ID,
        organization_id=uuid.uuid4(),
        zitadel_org_id="org-test-123",
    )
    previous_scalar = getattr(db, "scalar", None)

    async def _scalar_side_effect(*args, **kwargs):
        statement = args[0] if args else None
        text = str(statement)
        if "FROM campaign_members" in text:
            return role_member
        if "FROM campaigns" in text:
            return campaign
        if "SELECT organizations.zitadel_org_id" in text:
            return campaign.zitadel_org_id
        if "SELECT organization_members.role" in text:
            return None
        if previous_scalar is not None:
            return await previous_scalar(*args, **kwargs)
        return None

    db.scalar = AsyncMock(side_effect=_scalar_side_effect)


def _setup_user_sync_queries(db: AsyncMock, user: AuthenticatedUser) -> None:
    local_user = SimpleNamespace(display_name=user.display_name, email=user.email)

    async def _default_scalar(*args, **kwargs):
        return ""

    execute_result = SimpleNamespace(
        scalar_one_or_none=lambda: local_user,
        scalars=lambda: SimpleNamespace(all=lambda: []),
    )

    db.scalar = AsyncMock(side_effect=_default_scalar)
    db.execute = AsyncMock(return_value=execute_result)
    db.commit = AsyncMock()
    db.add = AsyncMock()


def _sync_patches():
    return patch(
        "app.api.deps.ensure_user_synced", new=AsyncMock(return_value=SimpleNamespace())
    )


def _make_script():
    return SimpleNamespace(
        id=SCRIPT_ID,
        campaign_id=CAMPAIGN_ID,
        title="Door Knock Script",
        description="Standard canvassing script",
        status="draft",
        created_by="manager-1",
        created_at=NOW,
        updated_at=NOW,
    )


def _make_question():
    return SimpleNamespace(
        id=QUESTION_ID,
        script_id=SCRIPT_ID,
        question_text="Will you vote for our candidate?",
        question_type="multiple_choice",
        options={"choices": ["Yes", "No", "Undecided"]},
        position=1,
    )


async def test_create_script_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.create_script.return_value = _make_script()

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys",
                    json={"title": "Door Knock Script"},
                )
        assert resp.status_code == 201
        assert resp.json()["title"] == "Door Knock Script"
    finally:
        m._service = orig


async def test_create_script_requires_manager() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    sync_patch = _sync_patches()
    with sync_patch:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys",
                json={"title": "Script"},
            )
    assert resp.status_code == 403


async def test_list_scripts_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.list_scripts.return_value = ([_make_script()], None, False)

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1
    finally:
        m._service = orig


async def test_list_scripts_invalid_status() -> None:
    db = AsyncMock()
    svc = AsyncMock()

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys",
                    params={"status_filter": "bogus"},
                )
        assert resp.status_code == 400
        assert "Invalid status filter" in resp.json()["detail"]
    finally:
        m._service = orig


async def test_get_script_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_script.return_value = _make_script()
    svc.list_questions.return_value = [_make_question()]

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Door Knock Script"
        assert len(data["questions"]) == 1
    finally:
        m._service = orig


async def test_get_script_not_found() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_script.return_value = None

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}")
        assert resp.status_code == 404
    finally:
        m._service = orig


async def test_update_script_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    updated = _make_script()
    updated.title = "Updated Script"
    svc.update_script.return_value = updated

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}",
                    json={"title": "Updated Script"},
                )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Script"
    finally:
        m._service = orig


async def test_update_script_bad_transition() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.update_script.side_effect = ValueError("Invalid transition")

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}",
                    json={"status": "active"},
                )
        assert resp.status_code == 400
    finally:
        m._service = orig


async def test_delete_script_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.delete_script.return_value = None

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}")
        assert resp.status_code == 204
    finally:
        m._service = orig


async def test_delete_script_not_draft() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.delete_script.side_effect = ValueError("Only draft scripts")

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}")
        assert resp.status_code == 400
    finally:
        m._service = orig


async def test_add_question_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.add_question.return_value = _make_question()

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}/questions",
                    json={
                        "question_text": "Will you vote?",
                        "question_type": "multiple_choice",
                        "options": {"choices": ["Yes", "No"]},
                    },
                )
        assert resp.status_code == 201
    finally:
        m._service = orig


async def test_delete_question_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.delete_question.return_value = None

    user = _make_user()
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "manager")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}/questions/{QUESTION_ID}"
                )
        assert resp.status_code == 204
    finally:
        m._service = orig


async def test_get_voter_responses_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_voter_responses.return_value = []

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_user_sync_queries(db, user)
    _setup_role_resolution(db, "volunteer")

    import app.api.v1.surveys as m

    orig = m._service
    m._service = svc
    try:
        sync_patch = _sync_patches()
        with sync_patch:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(
                    f"/api/v1/campaigns/{CAMPAIGN_ID}/surveys/{SCRIPT_ID}/voters/{VOTER_ID}/responses"
                )
        assert resp.status_code == 200
        assert resp.json() == []
        svc.get_voter_responses.assert_awaited_once_with(
            session=db,
            campaign_id=CAMPAIGN_ID,
            voter_id=VOTER_ID,
            script_id=SCRIPT_ID,
        )
    finally:
        m._service = orig
