"""Unit tests for phone bank API endpoints."""

from __future__ import annotations

import uuid
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
SESSION_ID = uuid.uuid4()


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
    app.dependency_overrides[get_current_user_dual] = lambda: user

    async def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_db
    return app


def _setup_role_resolution(db: AsyncMock, role: str = "manager") -> None:
    member = MagicMock()
    member.role = role
    campaign = MagicMock()
    campaign.organization_id = None
    campaign.zitadel_org_id = "org-test-123"
    db.scalar = AsyncMock(side_effect=["", member, campaign, ""])


def _setup_user_sync_queries(db: AsyncMock, user: AuthenticatedUser) -> None:
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

    # require_role() and route handler both call ensure_user_synced().
    # Provide enough mocked execute results for both invocations.
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


async def test_delete_session_returns_204_on_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    service_mock = AsyncMock()
    service_mock.delete_session.return_value = None

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)
    import app.api.v1.phone_banks as phone_banks_module

    original_service = phone_banks_module._phone_bank_service
    phone_banks_module._phone_bank_service = service_mock
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/phone-bank-sessions/{SESSION_ID}"
            )
    finally:
        phone_banks_module._phone_bank_service = original_service

    assert resp.status_code == 204
    service_mock.delete_session.assert_awaited_once_with(db, SESSION_ID)
    db.commit.assert_awaited_once()


async def test_create_session_returns_404_when_call_list_missing() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    service_mock = AsyncMock()
    service_mock.create_session.side_effect = ValueError("Call list missing not found")

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)
    import app.api.v1.phone_banks as phone_banks_module

    original_service = phone_banks_module._phone_bank_service
    phone_banks_module._phone_bank_service = service_mock
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/phone-bank-sessions",
                json={"name": "PB Session", "call_list_id": str(uuid.uuid4())},
            )
    finally:
        phone_banks_module._phone_bank_service = original_service

    assert resp.status_code == 404
    assert resp.json()["title"] == "Call List Not Found"
    db.commit.assert_not_awaited()


async def test_record_call_rejects_invalid_result_code() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/phone-bank-sessions/{SESSION_ID}/calls",
            json={
                "call_list_entry_id": str(uuid.uuid4()),
                "result_code": "BOGUS",
                "phone_number_used": "4785551212",
                "call_started_at": "2026-04-05T09:00:00Z",
                "call_ended_at": "2026-04-05T09:05:00Z",
            },
        )

    assert resp.status_code == 422


async def test_delete_session_returns_422_when_active() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    service_mock = AsyncMock()
    service_mock.delete_session.side_effect = ValueError(
        f"Session {SESSION_ID} is active and cannot be deleted"
    )

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.phone_banks as phone_banks_module

    original_service = phone_banks_module._phone_bank_service
    phone_banks_module._phone_bank_service = service_mock
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/phone-bank-sessions/{SESSION_ID}"
            )
    finally:
        phone_banks_module._phone_bank_service = original_service

    assert resp.status_code == 422
    body = resp.json()
    assert body["title"] == "Session Delete Failed"
    assert "active" in body["detail"].lower()
    db.commit.assert_not_awaited()


async def test_delete_session_returns_404_when_missing() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    service_mock = AsyncMock()
    service_mock.delete_session.side_effect = ValueError(
        f"Session {SESSION_ID} not found"
    )

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.phone_banks as phone_banks_module

    original_service = phone_banks_module._phone_bank_service
    phone_banks_module._phone_bank_service = service_mock
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/phone-bank-sessions/{SESSION_ID}"
            )
    finally:
        phone_banks_module._phone_bank_service = original_service

    assert resp.status_code == 404
    body = resp.json()
    assert body["title"] == "Session Not Found"
    assert "not found" in body["detail"].lower()
    db.commit.assert_not_awaited()
