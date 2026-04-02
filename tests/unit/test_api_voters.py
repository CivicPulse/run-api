"""Unit tests for voter API endpoints."""

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
VOTER_ID = uuid.uuid4()
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


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
    member = MagicMock()
    member.role = role
    campaign = MagicMock()
    campaign.organization_id = None
    campaign.zitadel_org_id = "org-test-123"
    db.scalar = AsyncMock(side_effect=[member, campaign])


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

    db.execute = AsyncMock(
        side_effect=[
            user_row, org_row, campaigns_row,
            user_row, org_row, campaigns_row,
        ]
    )


def _make_voter():
    """Create a voter-like object with all VoterResponse fields."""
    return SimpleNamespace(
        id=VOTER_ID,
        campaign_id=CAMPAIGN_ID,
        source_type="manual",
        source_id=None,
        first_name="Jane",
        middle_name=None,
        last_name="Doe",
        suffix=None,
        date_of_birth=None,
        gender=None,
        registration_line1=None,
        registration_line2=None,
        registration_city="Macon",
        registration_state="GA",
        registration_zip="31201",
        registration_zip4=None,
        registration_county="Bibb",
        registration_apartment_type=None,
        mailing_line1=None,
        mailing_line2=None,
        mailing_city=None,
        mailing_state=None,
        mailing_zip=None,
        mailing_zip4=None,
        mailing_country=None,
        mailing_type=None,
        party="Democrat",
        precinct="P01",
        congressional_district=None,
        state_senate_district=None,
        state_house_district=None,
        registration_date=None,
        voting_history=None,
        propensity_general=None,
        propensity_primary=None,
        propensity_combined=None,
        ethnicity=None,
        age=None,
        spoken_language=None,
        marital_status=None,
        military_status=None,
        party_change_indicator=None,
        cell_phone_confidence=None,
        latitude=None,
        longitude=None,
        household_id=None,
        household_party_registration=None,
        household_size=None,
        family_id=None,
        extra_data=None,
        created_at=NOW,
        updated_at=NOW,
    )


def _swap_service(module, service_mock):
    """Context-manager-like helper. Returns original for cleanup."""
    original = module._service
    module._service = service_mock
    return original


# ---------------------------------------------------------------------------
# list_voters
# ---------------------------------------------------------------------------


async def test_list_voters_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.search_voters.return_value = {
        "items": [_make_voter()],
        "pagination": {"next_cursor": None, "has_more": False},
    }

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/voters")
        assert resp.status_code == 200
        assert "items" in resp.json()
    finally:
        m._service = orig


# ---------------------------------------------------------------------------
# get_voter
# ---------------------------------------------------------------------------


async def test_get_voter_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.get_voter.return_value = _make_voter()

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}"
            )
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Jane"
    finally:
        m._service = orig


async def test_get_voter_not_found() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.get_voter.side_effect = ValueError("Voter not found")

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}"
            )
        assert resp.status_code == 404
    finally:
        m._service = orig


# ---------------------------------------------------------------------------
# create_voter
# ---------------------------------------------------------------------------


async def test_create_voter_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.create_voter.return_value = _make_voter()

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters",
                json={"first_name": "Jane", "last_name": "Doe"},
            )
        assert resp.status_code == 201
        assert resp.json()["first_name"] == "Jane"
    finally:
        m._service = orig


async def test_create_voter_requires_manager() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/voters",
            json={"first_name": "Jane", "last_name": "Doe"},
        )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# update_voter
# ---------------------------------------------------------------------------


async def test_update_voter_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    voter = _make_voter()
    voter.first_name = "Janet"
    service_mock.update_voter.return_value = voter

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}",
                json={"first_name": "Janet"},
            )
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Janet"
    finally:
        m._service = orig


async def test_update_voter_not_found() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.update_voter.side_effect = ValueError("Voter not found")

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}",
                json={"first_name": "Janet"},
            )
        assert resp.status_code == 404
    finally:
        m._service = orig


# ---------------------------------------------------------------------------
# delete_voter
# ---------------------------------------------------------------------------


async def test_delete_voter_success() -> None:
    db = AsyncMock()
    db.commit = AsyncMock()
    service_mock = AsyncMock()
    service_mock.delete_voter.return_value = None

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}"
            )
        assert resp.status_code == 204
    finally:
        m._service = orig


async def test_delete_voter_not_found() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.delete_voter.side_effect = ValueError("Voter not found")

    user = _make_user()
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="manager")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/{VOTER_ID}"
            )
        assert resp.status_code == 404
    finally:
        m._service = orig


# ---------------------------------------------------------------------------
# search_voters (POST)
# ---------------------------------------------------------------------------


async def test_search_voters_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.search_voters.return_value = {
        "items": [_make_voter()],
        "pagination": {"next_cursor": None, "has_more": False},
    }

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/search",
                json={"filters": {"search": "Jane"}},
            )
        assert resp.status_code == 200
    finally:
        m._service = orig


# ---------------------------------------------------------------------------
# distinct_values
# ---------------------------------------------------------------------------


async def test_distinct_values_success() -> None:
    db = AsyncMock()
    service_mock = AsyncMock()
    service_mock.distinct_values.return_value = {"ethnicity": {"White": 30}}

    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    import app.api.v1.voters as m

    orig = _swap_service(m, service_mock)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.get(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/distinct-values",
                params={"fields": "ethnicity"},
            )
        assert resp.status_code == 200
    finally:
        m._service = orig


async def test_distinct_values_invalid_field() -> None:
    db = AsyncMock()
    user = _make_user(role=CampaignRole.VOLUNTEER)
    app = _override_app(user=user, db=db)
    _setup_role_resolution(db, role="volunteer")
    _setup_user_sync_queries(db, user)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.get(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/voters/distinct-values",
            params={"fields": "ssn"},
        )
    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"]
