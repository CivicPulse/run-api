"""Unit tests for org phone numbers API endpoints.

Tests cover all 5 endpoints, role gates, Twilio error mapping, and
org isolation. Service methods are patched to isolate the API layer.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization
from app.schemas.org_phone_number import OrgPhoneNumberResponse

# Patch ensure_user_synced for all org API tests
pytestmark = pytest.mark.usefixtures("_patch_user_sync")


@pytest.fixture(autouse=True)
def _patch_user_sync():
    with patch("app.api.deps.ensure_user_synced", new_callable=AsyncMock) as mock:
        mock.return_value = MagicMock()
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_UUID = uuid.uuid4()
ZITADEL_ORG_ID = "zitadel-org-numbers-test"
NUMBER_UUID = uuid.uuid4()


def _make_user(
    user_id: str = "user-1",
    org_id: str = ZITADEL_ORG_ID,
    role: CampaignRole = CampaignRole.ADMIN,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )


def _make_org(
    org_id: uuid.UUID = ORG_UUID,
    zitadel_org_id: str = ZITADEL_ORG_ID,
    default_voice_number_id: uuid.UUID | None = None,
    default_sms_number_id: uuid.UUID | None = None,
) -> Organization:
    now = utcnow()
    return Organization(
        id=org_id,
        zitadel_org_id=zitadel_org_id,
        name="Test Organization",
        twilio_account_sid="AC1234567890",
        twilio_auth_token_encrypted="encrypted-token",
        twilio_auth_token_key_id="primary",
        twilio_auth_token_last4="7890",
        default_voice_number_id=default_voice_number_id,
        default_sms_number_id=default_sms_number_id,
        created_by="user-1",
        created_at=now,
        updated_at=now,
    )


def _make_phone_number(
    number_id: uuid.UUID | None = None,
    org_id: uuid.UUID = ORG_UUID,
    phone_number: str = "+15551234567",
    voice_capable: bool = True,
    sms_capable: bool = True,
    mms_capable: bool = False,
) -> OrgPhoneNumber:
    return OrgPhoneNumber(
        id=number_id or uuid.uuid4(),
        org_id=org_id,
        phone_number=phone_number,
        friendly_name="Main Line",
        phone_type="local",
        voice_capable=voice_capable,
        sms_capable=sms_capable,
        mms_capable=mms_capable,
        twilio_sid="PN1234567890abcdef1234567890abcdef",
        capabilities_synced_at=utcnow(),
    )


def _make_response(
    number: OrgPhoneNumber,
    is_default_voice: bool = False,
    is_default_sms: bool = False,
) -> OrgPhoneNumberResponse:
    return OrgPhoneNumberResponse(
        id=number.id,
        phone_number=number.phone_number,
        friendly_name=number.friendly_name,
        phone_type=number.phone_type,
        voice_capable=number.voice_capable,
        sms_capable=number.sms_capable,
        mms_capable=number.mms_capable,
        twilio_sid=number.twilio_sid,
        capabilities_synced_at=number.capabilities_synced_at,
        created_at=number.capabilities_synced_at,  # use synced_at as stand-in
        is_default_voice=is_default_voice,
        is_default_sms=is_default_sms,
    )


def _setup_app(
    user: AuthenticatedUser,
    org: Organization,
    role_str: str = "org_owner",
):
    """Create app with dependency overrides for auth and db.

    The mock_db.scalar side_effect handles the require_org_role sequence:
      1. org lookup
      2. member role string
      3. org lookup again (_resolve_org in the endpoint)
    """
    app = create_app()
    mock_db = AsyncMock()
    mock_db.scalar = AsyncMock(side_effect=[org, role_str, org])
    mock_db.refresh = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    return app, mock_db


_SVC = "app.api.v1.org_numbers._number_service"


# ---------------------------------------------------------------------------
# TestListNumbers
# ---------------------------------------------------------------------------


class TestListNumbers:
    """Tests for GET /api/v1/org/numbers."""

    @pytest.mark.asyncio
    async def test_list_returns_org_numbers(self) -> None:
        """GET /org/numbers returns registered numbers for the org."""
        user = _make_user()
        org = _make_org()
        num = _make_phone_number(number_id=NUMBER_UUID)
        resp_obj = _make_response(num)

        app, mock_db = _setup_app(user, org, "org_admin")

        with (
            patch(f"{_SVC}.list_numbers", new_callable=AsyncMock) as mock_list,
            patch(f"{_SVC}.enrich_response") as mock_enrich,
        ):
            mock_list.return_value = [num]
            mock_enrich.return_value = resp_obj

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get(
                    "/api/v1/org/numbers",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["phone_number"] == "+15551234567"

    @pytest.mark.asyncio
    async def test_list_empty_when_no_numbers(self) -> None:
        """GET /org/numbers returns empty list for org with no numbers."""
        user = _make_user()
        org = _make_org()
        app, mock_db = _setup_app(user, org, "org_admin")

        with patch(f"{_SVC}.list_numbers", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = []

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get(
                    "/api/v1/org/numbers",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_enriches_defaults(self) -> None:
        """GET /org/numbers marks default numbers correctly."""
        num_id = uuid.uuid4()
        user = _make_user()
        org = _make_org(default_voice_number_id=num_id)
        num = _make_phone_number(number_id=num_id)
        resp_obj = _make_response(num, is_default_voice=True)

        app, mock_db = _setup_app(user, org, "org_admin")

        with (
            patch(f"{_SVC}.list_numbers", new_callable=AsyncMock) as mock_list,
            patch(f"{_SVC}.enrich_response") as mock_enrich,
        ):
            mock_list.return_value = [num]
            mock_enrich.return_value = resp_obj

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get(
                    "/api/v1/org/numbers",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["is_default_voice"] is True


# ---------------------------------------------------------------------------
# TestRegisterNumber
# ---------------------------------------------------------------------------


class TestRegisterNumber:
    """Tests for POST /api/v1/org/numbers."""

    @pytest.mark.asyncio
    async def test_register_creates_number(self) -> None:
        """POST /org/numbers validates via Twilio and creates row."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num = _make_phone_number()
        resp_obj = _make_response(num)

        app, mock_db = _setup_app(user, org)

        with (
            patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register,
            patch(f"{_SVC}.enrich_response") as mock_enrich,
        ):
            mock_register.return_value = num
            mock_enrich.return_value = resp_obj

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 201
        data = resp.json()
        assert data["phone_number"] == "+15551234567"
        mock_register.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_register_rejects_invalid_e164(self) -> None:
        """POST /org/numbers rejects non-E.164 phone numbers (422)."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/org/numbers",
                json={"phone_number": "5551234567"},  # no + prefix
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_register_409_on_duplicate(self) -> None:
        """POST /org/numbers returns 409 when number already registered."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register:
            mock_register.side_effect = HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number already registered for this organization",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_register_404_number_not_in_twilio(self) -> None:
        """POST /org/numbers returns 404 when not found in Twilio account."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register:
            mock_register.side_effect = HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found in your Twilio account",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestDeleteNumber
# ---------------------------------------------------------------------------


class TestDeleteNumber:
    """Tests for DELETE /api/v1/org/numbers/{id}."""

    @pytest.mark.asyncio
    async def test_delete_removes_number(self) -> None:
        """DELETE /org/numbers/{id} removes the number row."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num_id = uuid.uuid4()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.delete_number", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = None

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.delete(
                    f"/api/v1/org/numbers/{num_id}",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 204
        mock_delete.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_clears_default_fks(self) -> None:
        """DELETE clears default FKs if deleted number was default."""

        user = _make_user(role=CampaignRole.OWNER)
        num_id = uuid.uuid4()
        org = _make_org(
            default_voice_number_id=num_id,
            default_sms_number_id=num_id,
        )
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.delete_number", new_callable=AsyncMock) as mock_delete:
            # Service handles clearing defaults internally
            mock_delete.return_value = None

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.delete(
                    f"/api/v1/org/numbers/{num_id}",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 204
        # Verify service was called with the org that has defaults set
        call_args = mock_delete.call_args
        called_org = call_args.args[1]
        assert called_org.default_voice_number_id == num_id

    @pytest.mark.asyncio
    async def test_delete_404_when_not_found(self) -> None:
        """DELETE /org/numbers/{id} returns 404 for unknown id."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.delete_number", new_callable=AsyncMock) as mock_delete:
            mock_delete.side_effect = HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.delete(
                    f"/api/v1/org/numbers/{uuid.uuid4()}",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestSyncNumber
# ---------------------------------------------------------------------------


class TestSyncNumber:
    """Tests for POST /api/v1/org/numbers/{id}/sync."""

    @pytest.mark.asyncio
    async def test_sync_updates_capabilities(self) -> None:
        """POST /org/numbers/{id}/sync re-fetches capabilities from Twilio."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num = _make_phone_number()
        resp_obj = _make_response(num)

        app, mock_db = _setup_app(user, org)

        with (
            patch(f"{_SVC}.sync_number", new_callable=AsyncMock) as mock_sync,
            patch(f"{_SVC}.enrich_response") as mock_enrich,
        ):
            mock_sync.return_value = num
            mock_enrich.return_value = resp_obj

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    f"/api/v1/org/numbers/{num.id}/sync",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["phone_number"] == "+15551234567"
        mock_sync.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_sync_404_when_not_found(self) -> None:
        """POST /org/numbers/{id}/sync returns 404 for unknown id."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.sync_number", new_callable=AsyncMock) as mock_sync:
            mock_sync.side_effect = HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    f"/api/v1/org/numbers/{uuid.uuid4()}/sync",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestSetDefault
# ---------------------------------------------------------------------------


class TestSetDefault:
    """Tests for PATCH /api/v1/org/numbers/{id}/set-default."""

    @pytest.mark.asyncio
    async def test_set_default_voice(self) -> None:
        """PATCH set-default with capability=voice returns 200."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num_id = uuid.uuid4()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.set_default", new_callable=AsyncMock) as mock_set:
            mock_set.return_value = None

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.patch(
                    f"/api/v1/org/numbers/{num_id}/set-default",
                    json={"capability": "voice"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        mock_set.assert_awaited_once()
        # Verify capability arg
        call_args = mock_set.call_args
        assert call_args.args[3] == "voice"

    @pytest.mark.asyncio
    async def test_set_default_sms(self) -> None:
        """PATCH set-default with capability=sms returns 200."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num_id = uuid.uuid4()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.set_default", new_callable=AsyncMock) as mock_set:
            mock_set.return_value = None

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.patch(
                    f"/api/v1/org/numbers/{num_id}/set-default",
                    json={"capability": "sms"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200
        call_args = mock_set.call_args
        assert call_args.args[3] == "sms"

    @pytest.mark.asyncio
    async def test_set_default_rejects_incapable(self) -> None:
        """PATCH set-default returns 400 if number lacks capability."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num_id = uuid.uuid4()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.set_default", new_callable=AsyncMock) as mock_set:
            mock_set.side_effect = HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number does not support voice",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.patch(
                    f"/api/v1/org/numbers/{num_id}/set-default",
                    json={"capability": "voice"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_set_default_rejects_invalid_capability(self) -> None:
        """PATCH set-default with invalid capability returns 422."""
        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        num_id = uuid.uuid4()
        app, mock_db = _setup_app(user, org)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/org/numbers/{num_id}/set-default",
                json={"capability": "fax"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# TestRoleGates
# ---------------------------------------------------------------------------


class TestRoleGates:
    """Tests for role-based access control on number endpoints."""

    @pytest.mark.asyncio
    async def test_org_admin_can_list(self) -> None:
        """org_admin role can read number list."""
        user = _make_user(role=CampaignRole.ADMIN)
        org = _make_org()
        app, mock_db = _setup_app(user, org, "org_admin")

        with patch(f"{_SVC}.list_numbers", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = []

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get(
                    "/api/v1/org/numbers",
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_org_admin_forbidden_for_register(self) -> None:
        """org_admin cannot POST /org/numbers (requires org_owner)."""
        user = _make_user(role=CampaignRole.ADMIN)
        org = _make_org()

        app = create_app()
        mock_db = AsyncMock()
        # require_org_role("org_owner"): org found, role = org_admin (< org_owner)
        mock_db.scalar = AsyncMock(side_effect=[org, "org_admin"])

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/org/numbers",
                json={"phone_number": "+15551234567"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_org_admin_forbidden_for_delete(self) -> None:
        """org_admin cannot DELETE /org/numbers/{id} (requires org_owner)."""
        user = _make_user(role=CampaignRole.ADMIN)
        org = _make_org()

        app = create_app()
        mock_db = AsyncMock()
        mock_db.scalar = AsyncMock(side_effect=[org, "org_admin"])

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/org/numbers/{uuid.uuid4()}",
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TestTwilioErrors
# ---------------------------------------------------------------------------


class TestTwilioErrors:
    """Tests for Twilio API error mapping."""

    @pytest.mark.asyncio
    async def test_twilio_auth_error_maps_to_502(self) -> None:
        """Twilio 401/403 maps to HTTP 502 with credential error message."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register:
            mock_register.side_effect = HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Twilio credential error -- verify your Account SID and Auth Token"
                ),
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 502
        assert "credential error" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_twilio_api_error_maps_to_502(self) -> None:
        """Other Twilio errors map to HTTP 502 with sanitized message."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register:
            mock_register.side_effect = HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Twilio API error",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 502

    @pytest.mark.asyncio
    async def test_no_twilio_credentials_maps_to_502(self) -> None:
        """Missing Twilio credentials returns 502."""
        from fastapi import HTTPException, status

        user = _make_user(role=CampaignRole.OWNER)
        org = _make_org()
        app, mock_db = _setup_app(user, org)

        with patch(f"{_SVC}.register_number", new_callable=AsyncMock) as mock_register:
            mock_register.side_effect = HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Twilio credentials not configured",
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/org/numbers",
                    json={"phone_number": "+15551234567"},
                    headers={"Authorization": "Bearer fake"},
                )

        assert resp.status_code == 502
