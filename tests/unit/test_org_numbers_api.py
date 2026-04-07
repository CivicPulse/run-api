"""Unit tests for org phone numbers API endpoints.

Wave 0 stubs -- test structure and fixtures established; test bodies
will be implemented in Plan 02 when the API endpoints exist.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.security import AuthenticatedUser, CampaignRole
from app.core.time import utcnow
from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization

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
        created_by="user-1",
        created_at=now,
        updated_at=now,
    )


def _make_phone_number(
    number_id: uuid.UUID = NUMBER_UUID,
    org_id: uuid.UUID = ORG_UUID,
    phone_number: str = "+15551234567",
) -> OrgPhoneNumber:
    return OrgPhoneNumber(
        id=number_id,
        org_id=org_id,
        phone_number=phone_number,
        friendly_name="Main Line",
        phone_type="local",
        voice_capable=True,
        sms_capable=True,
        mms_capable=False,
        twilio_sid="PN1234567890abcdef1234567890abcdef",
        capabilities_synced_at=utcnow(),
    )


# ---------------------------------------------------------------------------
# Test classes -- Wave 0 stubs (to be filled in Plan 02)
# ---------------------------------------------------------------------------


class TestListNumbers:
    """Tests for GET /api/v1/org/numbers."""

    def test_list_returns_org_numbers(self) -> None:
        """GET /org/numbers returns registered numbers for the org."""
        pass  # Plan 02

    def test_list_empty_when_no_numbers(self) -> None:
        """GET /org/numbers returns empty list for org with no numbers."""
        pass  # Plan 02


class TestRegisterNumber:
    """Tests for POST /api/v1/org/numbers."""

    def test_register_creates_number(self) -> None:
        """POST /org/numbers validates via Twilio and creates row."""
        pass  # Plan 02

    def test_register_rejects_invalid_e164(self) -> None:
        """POST /org/numbers rejects non-E.164 phone numbers."""
        pass  # Plan 02

    def test_register_409_on_duplicate(self) -> None:
        """POST /org/numbers returns 409 when number already registered."""
        pass  # Plan 02

    def test_register_404_number_not_in_twilio(self) -> None:
        """POST /org/numbers returns 404 when not found in Twilio account."""
        pass  # Plan 02


class TestDeleteNumber:
    """Tests for DELETE /api/v1/org/numbers/{id}."""

    def test_delete_removes_number(self) -> None:
        """DELETE /org/numbers/{id} removes the number row."""
        pass  # Plan 02

    def test_delete_clears_default_fks(self) -> None:
        """DELETE clears default_voice/sms_number_id if deleted number was default."""
        pass  # Plan 02

    def test_delete_404_when_not_found(self) -> None:
        """DELETE /org/numbers/{id} returns 404 for unknown id."""
        pass  # Plan 02


class TestSyncNumber:
    """Tests for POST /api/v1/org/numbers/{id}/sync."""

    def test_sync_updates_capabilities(self) -> None:
        """POST /org/numbers/{id}/sync re-fetches capabilities from Twilio."""
        pass  # Plan 02

    def test_sync_404_when_not_found(self) -> None:
        """POST /org/numbers/{id}/sync returns 404 for unknown id."""
        pass  # Plan 02


class TestSetDefault:
    """Tests for PATCH /api/v1/org/numbers/{id}/set-default."""

    def test_set_default_voice(self) -> None:
        """PATCH set-default with capability=voice sets default_voice_number_id."""
        pass  # Plan 02

    def test_set_default_sms(self) -> None:
        """PATCH set-default with capability=sms sets default_sms_number_id."""
        pass  # Plan 02

    def test_set_default_rejects_incapable(self) -> None:
        """PATCH set-default returns 400 if number lacks requested capability."""
        pass  # Plan 02


class TestRoleGates:
    """Tests for role-based access control on number endpoints."""

    def test_org_admin_can_list(self) -> None:
        """org_admin role can read number list."""
        pass  # Plan 02

    def test_org_owner_required_for_register(self) -> None:
        """org_owner role required for POST /org/numbers."""
        pass  # Plan 02

    def test_org_owner_required_for_delete(self) -> None:
        """org_owner role required for DELETE /org/numbers/{id}."""
        pass  # Plan 02


class TestTwilioErrors:
    """Tests for Twilio API error mapping."""

    def test_twilio_auth_error_maps_to_502(self) -> None:
        """Twilio 401/403 maps to HTTP 502 with credential error message."""
        pass  # Plan 02

    def test_twilio_api_error_maps_to_502(self) -> None:
        """Other Twilio errors map to HTTP 502 with sanitized message."""
        pass  # Plan 02

    def test_no_twilio_credentials_maps_to_502(self) -> None:
        """Missing Twilio credentials returns 502."""
        pass  # Plan 02
