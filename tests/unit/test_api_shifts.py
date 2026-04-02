"""Unit tests for shift API endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from httpx import ASGITransport, AsyncClient

from app.api.deps import get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.main import create_app

CAMPAIGN_ID = uuid.uuid4()
SHIFT_ID = uuid.uuid4()
VOLUNTEER_ID = uuid.uuid4()
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
START = datetime(2026, 4, 5, 9, 0, 0, tzinfo=timezone.utc)
END = datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc)


def _make_user(
    user_id: str = "manager-1",
    org_id: str = "org-test-123",
    role: CampaignRole = CampaignRole.MANAGER,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id, org_id=org_id, role=role,
        email=f"{user_id}@test.com", display_name=f"User {user_id}",
    )


def _override_app(user, db):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user

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
    db.scalar = AsyncMock(side_effect=[member, campaign])


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
    db.execute = AsyncMock(side_effect=[
        user_row, org_row, campaigns_row,
        user_row, org_row, campaigns_row,
    ])


def _make_shift():
    return SimpleNamespace(
        id=SHIFT_ID, campaign_id=CAMPAIGN_ID,
        name="Morning Canvass", description="Door-to-door canvassing",
        type="canvassing", status="scheduled",
        start_at=START, end_at=END,
        max_volunteers=10, location_name="HQ",
        street="123 Main St", city="Macon", state="GA", zip_code="31201",
        latitude=None, longitude=None,
        turf_id=None, phone_bank_session_id=None,
        created_by="manager-1", created_at=NOW, updated_at=NOW,
    )


def _make_shift_data():
    return {"shift": _make_shift(), "signed_up_count": 5, "waitlist_count": 0}


def _make_shift_for_list():
    """Make a shift with __table__.columns for list serialization."""
    shift = _make_shift()
    col_keys = [
        "id", "campaign_id", "name", "description", "type", "status",
        "start_at", "end_at", "max_volunteers", "location_name",
        "street", "city", "state", "zip_code", "latitude", "longitude",
        "turf_id", "phone_bank_session_id", "created_by", "created_at",
        "updated_at",
    ]
    table = MagicMock()
    cols = []
    for key in col_keys:
        col = MagicMock()
        col.key = key
        cols.append(col)
    table.columns = cols
    shift.__table__ = table
    # SimpleNamespace doesn't support __getattr__ on table mock,
    # but we need getattr(s, col.key) to work — it does for SimpleNamespace
    return shift


# ---------------------------------------------------------------------------
# Shift CRUD
# ---------------------------------------------------------------------------


async def test_create_shift_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    svc.create_shift.return_value = _make_shift()
    svc.get_shift.return_value = _make_shift_data()

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts",
                json={
                    "name": "Morning Canvass", "type": "general", "max_volunteers": 10,
                    "start_at": "2026-04-05T09:00:00Z", "end_at": "2026-04-05T12:00:00Z",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Morning Canvass"
    finally:
        m._shift_service = orig


async def test_create_shift_requires_manager() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts",
            json={
                "name": "Shift", "type": "canvassing",
                "start_at": "2026-04-05T09:00:00Z", "end_at": "2026-04-05T12:00:00Z",
            },
        )
    assert resp.status_code == 403


async def test_list_shifts_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.list_shifts.return_value = [_make_shift_for_list()]

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts")
        assert resp.status_code == 200
        assert "items" in resp.json()
    finally:
        m._shift_service = orig


async def test_get_shift_success() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_shift.return_value = _make_shift_data()

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts/{SHIFT_ID}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Morning Canvass"
    finally:
        m._shift_service = orig


async def test_get_shift_not_found() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.get_shift.return_value = None

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts/{SHIFT_ID}")
        assert resp.status_code == 404
    finally:
        m._shift_service = orig


async def test_delete_shift_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    svc = AsyncMock()
    svc.delete_shift.return_value = None

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts/{SHIFT_ID}")
        assert resp.status_code == 204
    finally:
        m._shift_service = orig


async def test_delete_shift_error() -> None:
    db = AsyncMock()
    svc = AsyncMock()
    svc.delete_shift.side_effect = ValueError("Cannot delete active shift")

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.shifts as m

    orig = m._shift_service
    m._shift_service = svc
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}/shifts/{SHIFT_ID}")
        assert resp.status_code == 422
    finally:
        m._shift_service = orig
