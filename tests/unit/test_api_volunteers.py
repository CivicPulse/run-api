"""Unit tests for volunteer API endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from httpx import ASGITransport, AsyncClient

from app.api.deps import get_campaign_db
from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    get_current_user,
    get_current_user_dual,
)
from app.db.session import get_db
from app.main import create_app

CAMPAIGN_ID = uuid.uuid4()
VOLUNTEER_ID = uuid.uuid4()
TAG_ID = uuid.uuid4()
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


def _override_app(user, db):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_user_dual] = lambda: user

    async def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_db
    return app


def _setup_role_resolution(db, role="manager"):
    member = MagicMock()
    member.role = role
    campaign = MagicMock()
    campaign.organization_id = None
    campaign.zitadel_org_id = "org-test-123"
    db.scalar = AsyncMock(side_effect=["", member, campaign, ""])


def _setup_user_sync_queries(db, user):
    local_user = MagicMock()
    local_user.id = user.id
    local_user.display_name = user.display_name or ""
    local_user.email = user.email or ""
    user_row = MagicMock()
    user_row.scalar_one_or_none.return_value = local_user
    org_row = MagicMock()
    org_row.scalars.return_value.all.return_value = []
    campaigns_row = MagicMock()
    campaigns_row.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(
        side_effect=[
            user_row,
            org_row,
            campaigns_row,
            user_row,
            org_row,
            campaigns_row,
        ]
    )


def _make_volunteer():
    return SimpleNamespace(
        id=VOLUNTEER_ID,
        campaign_id=CAMPAIGN_ID,
        user_id="manager-1",
        first_name="Alice",
        last_name="Smith",
        phone="555-1234",
        email="alice@test.com",
        street=None,
        city=None,
        state=None,
        zip_code=None,
        emergency_contact_name=None,
        emergency_contact_phone=None,
        notes=None,
        status="active",
        skills=[],
        created_by="manager-1",
        created_at=NOW,
        updated_at=NOW,
    )


def _make_tag():
    return SimpleNamespace(
        id=TAG_ID,
        campaign_id=CAMPAIGN_ID,
        name="Bilingual",
        created_at=NOW,
        updated_at=NOW,
    )


# ---------------------------------------------------------------------------
# Volunteer CRUD
# ---------------------------------------------------------------------------


async def test_create_volunteer_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    svc.create_volunteer.return_value = _make_volunteer()

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers",
                json={
                    "first_name": "Alice",
                    "last_name": "Smith",
                    "email": "alice@test.com",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["first_name"] == "Alice"
    finally:
        m._volunteer_service = orig


async def test_create_volunteer_requires_manager() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers",
            json={
                "first_name": "Alice",
                "last_name": "Smith",
                "email": "alice@test.com",
            },
        )
    assert resp.status_code == 403


async def test_list_volunteers_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.list_volunteers.return_value = [_make_volunteer()]

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers")
        assert resp.status_code == 200
        assert "items" in resp.json()
    finally:
        m._volunteer_service = orig


async def test_get_volunteer_detail_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_volunteer_detail.return_value = {
        "volunteer": _make_volunteer(),
        "tags": [],
        "availability": [],
        "total_hours": 12.5,
        "shift_count": 3,
    }

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers/{VOLUNTEER_ID}"
            )
        assert resp.status_code == 200
    finally:
        m._volunteer_service = orig


async def test_get_volunteer_detail_not_found() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_volunteer_detail.return_value = None

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers/{VOLUNTEER_ID}"
            )
        assert resp.status_code == 404
    finally:
        m._volunteer_service = orig


async def test_update_volunteer_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    vol = _make_volunteer()
    vol.first_name = "Alicia"
    svc.update_volunteer.return_value = vol

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteers/{VOLUNTEER_ID}",
                json={"first_name": "Alicia"},
            )
        assert resp.status_code == 200
    finally:
        m._volunteer_service = orig


# ---------------------------------------------------------------------------
# Tag endpoints
# ---------------------------------------------------------------------------


async def test_create_tag_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    svc.create_tag.return_value = _make_tag()

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteer-tags",
                json={"name": "Bilingual"},
            )
        assert resp.status_code == 201
    finally:
        m._volunteer_service = orig


async def test_list_tags_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.list_tags.return_value = [_make_tag()]

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteer-tags")
        assert resp.status_code == 200
    finally:
        m._volunteer_service = orig


async def test_delete_tag_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    svc.delete_tag.return_value = None

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.volunteers as m

    orig = m._volunteer_service
    m._volunteer_service = svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/volunteer-tags/{TAG_ID}"
            )
        assert resp.status_code == 204
    finally:
        m._volunteer_service = orig
