"""Unit tests for dashboard API endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

from httpx import ASGITransport, AsyncClient

from app.api.deps import get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.main import create_app
from app.schemas.dashboard import (
    CanvassingSummary,
    PhoneBankingSummary,
    VolunteerSummary,
)

CAMPAIGN_ID = uuid.uuid4()


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


def _swap_dashboard_services(module, canvassing=None, phone=None, volunteer=None):
    """Swap dashboard services, return originals for cleanup."""
    orig = (module._canvassing, module._phone_banking, module._volunteer)
    if canvassing is not None:
        module._canvassing = canvassing
    if phone is not None:
        module._phone_banking = phone
    if volunteer is not None:
        module._volunteer = volunteer
    return orig


def _restore_dashboard_services(module, orig):
    module._canvassing, module._phone_banking, module._volunteer = orig


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------


async def test_get_overview_success() -> None:
    db = AsyncMock()
    c_svc = AsyncMock()
    p_svc = AsyncMock()
    v_svc = AsyncMock()
    c_svc.get_summary.return_value = CanvassingSummary(doors_knocked=100)
    p_svc.get_summary.return_value = PhoneBankingSummary(calls_made=200)
    v_svc.get_summary.return_value = VolunteerSummary(active_volunteers=15)

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, c_svc, p_svc, v_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["canvassing"]["doors_knocked"] == 100
        assert data["phone_banking"]["calls_made"] == 200
        assert data["volunteers"]["active_volunteers"] == 15
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_overview_requires_manager() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user, db)
    _setup_role_resolution(db, "volunteer")
    _setup_user_sync_queries(db, user)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/overview")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Canvassing endpoints
# ---------------------------------------------------------------------------


async def test_get_canvassing_summary_success() -> None:
    db = AsyncMock()
    c_svc = AsyncMock()
    c_svc.get_summary.return_value = CanvassingSummary(doors_knocked=100)

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, canvassing=c_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/canvassing")
        assert resp.status_code == 200
        assert resp.json()["doors_knocked"] == 100
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_canvassing_canvassers_success() -> None:
    db = AsyncMock()
    c_svc = AsyncMock()
    c_svc.get_canvassers.return_value = []

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, canvassing=c_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/canvassing/canvassers"
            )
        assert resp.status_code == 200
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_canvassing_turfs_success() -> None:
    db = AsyncMock()
    c_svc = AsyncMock()
    c_svc.get_turfs.return_value = []

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, canvassing=c_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/canvassing/turfs"
            )
        assert resp.status_code == 200
    finally:
        _restore_dashboard_services(m, orig)


# ---------------------------------------------------------------------------
# Phone banking endpoints
# ---------------------------------------------------------------------------


async def test_get_phone_banking_summary_success() -> None:
    db = AsyncMock()
    p_svc = AsyncMock()
    p_svc.get_summary.return_value = PhoneBankingSummary(calls_made=200)

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, phone=p_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/phone-banking"
            )
        assert resp.status_code == 200
        assert resp.json()["calls_made"] == 200
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_phone_banking_sessions_success() -> None:
    db = AsyncMock()
    p_svc = AsyncMock()
    p_svc.get_sessions.return_value = []

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, phone=p_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/phone-banking/sessions"
            )
        assert resp.status_code == 200
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_phone_banking_callers_success() -> None:
    db = AsyncMock()
    p_svc = AsyncMock()
    p_svc.get_callers.return_value = []

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, phone=p_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/phone-banking/callers"
            )
        assert resp.status_code == 200
    finally:
        _restore_dashboard_services(m, orig)


# ---------------------------------------------------------------------------
# Volunteer dashboard endpoints
# ---------------------------------------------------------------------------


async def test_get_volunteer_summary_success() -> None:
    db = AsyncMock()
    v_svc = AsyncMock()
    v_svc.get_summary.return_value = VolunteerSummary(total_volunteers=20)

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, volunteer=v_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/volunteers")
        assert resp.status_code == 200
        assert resp.json()["total_volunteers"] == 20
    finally:
        _restore_dashboard_services(m, orig)


async def test_get_volunteers_list_success() -> None:
    db = AsyncMock()
    v_svc = AsyncMock()
    v_svc.get_volunteers.return_value = []

    user = _make_user()
    app = _override_app(user, db)
    _setup_role_resolution(db, "manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.dashboard as m

    orig = _swap_dashboard_services(m, volunteer=v_svc)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/dashboard/volunteers/volunteers"
            )
        assert resp.status_code == 200
    finally:
        _restore_dashboard_services(m, orig)
