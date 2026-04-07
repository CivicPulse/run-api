"""Unit tests for Twilio webhook service.

Covers signature validation, org resolution, and idempotency.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(
    path: str = "/api/v1/webhooks/twilio/voice/status",
    query: str = "",
    headers: dict | None = None,
    form_data: dict | None = None,
) -> MagicMock:
    """Build a mock FastAPI Request."""
    request = MagicMock()
    request.url.path = path
    request.url.query = query
    request.headers = headers or {}

    async def _form():
        return form_data or {}

    request.form = _form
    return request


def _make_org(org_id: uuid.UUID | None = None) -> MagicMock:
    org = MagicMock(spec=Organization)
    org.id = org_id or uuid.uuid4()
    org.twilio_account_sid = "ACtest123"
    org.twilio_auth_token_encrypted = "encrypted"
    org.twilio_auth_token_key_id = "primary"
    return org


# ---------------------------------------------------------------------------
# URL reconstruction
# ---------------------------------------------------------------------------


class TestUrlReconstruction:
    async def test_url_reconstruction_uses_webhook_base_url(self):
        from app.services.twilio_webhook import _reconstruct_public_url

        with patch("app.services.twilio_webhook.settings") as mock_settings:
            mock_settings.webhook_base_url = "https://run.civpulse.org"
            request = _make_request(
                path="/api/v1/webhooks/twilio/voice/status",
                query="",
            )
            url = _reconstruct_public_url(request)
            assert url == "https://run.civpulse.org/api/v1/webhooks/twilio/voice/status"

    async def test_url_reconstruction_with_query_string(self):
        from app.services.twilio_webhook import _reconstruct_public_url

        with patch("app.services.twilio_webhook.settings") as mock_settings:
            mock_settings.webhook_base_url = "https://run.civpulse.org"
            request = _make_request(
                path="/api/v1/webhooks/twilio/voice/status",
                query="foo=bar",
            )
            url = _reconstruct_public_url(request)
            assert "?foo=bar" in url

    async def test_url_reconstruction_strips_trailing_slash(self):
        from app.services.twilio_webhook import _reconstruct_public_url

        with patch("app.services.twilio_webhook.settings") as mock_settings:
            mock_settings.webhook_base_url = "https://run.civpulse.org/"
            request = _make_request(
                path="/api/v1/webhooks/twilio/voice/status",
            )
            url = _reconstruct_public_url(request)
            assert "//" not in url.replace("https://", "")


# ---------------------------------------------------------------------------
# Signature validation
# ---------------------------------------------------------------------------


class TestSignatureValidation:
    async def test_signature_validation_rejects_missing_header(self):
        from app.services.twilio_webhook import verify_twilio_signature

        org = _make_org()
        request = _make_request(headers={})  # no X-Twilio-Signature

        with pytest.raises(HTTPException) as exc_info:
            await verify_twilio_signature(request=request, org=org)
        assert exc_info.value.status_code == 403
        assert "Missing" in exc_info.value.detail

    @patch("app.services.twilio_webhook.RequestValidator")
    @patch("app.services.twilio_webhook.TwilioConfigService")
    @patch("app.services.twilio_webhook.settings")
    async def test_signature_validation_rejects_invalid_signature(
        self, mock_settings, mock_config_cls, mock_validator_cls
    ):
        from app.services.twilio_webhook import verify_twilio_signature

        mock_settings.webhook_base_url = "https://run.civpulse.org"

        creds = MagicMock()
        creds.auth_token = "test_token"
        mock_config_cls.return_value.credentials_for_org.return_value = creds

        validator = MagicMock()
        validator.validate.return_value = False
        mock_validator_cls.return_value = validator

        org = _make_org()
        request = _make_request(
            headers={"x-twilio-signature": "badsig"},
            form_data={"CallSid": "CA123"},
        )

        with pytest.raises(HTTPException) as exc_info:
            await verify_twilio_signature(request=request, org=org)
        assert exc_info.value.status_code == 403
        assert "Invalid" in exc_info.value.detail

    @patch("app.services.twilio_webhook.TwilioConfigService")
    @patch("app.services.twilio_webhook.settings")
    async def test_signature_validation_rejects_unconfigured_org(
        self, mock_settings, mock_config_cls
    ):
        from app.services.twilio_webhook import verify_twilio_signature

        mock_settings.webhook_base_url = "https://run.civpulse.org"
        mock_config_cls.return_value.credentials_for_org.return_value = None

        org = _make_org()
        request = _make_request(
            headers={"x-twilio-signature": "somesig"},
            form_data={"CallSid": "CA123"},
        )

        with pytest.raises(HTTPException) as exc_info:
            await verify_twilio_signature(request=request, org=org)
        assert exc_info.value.status_code == 403
        assert "not configured" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Org resolution
# ---------------------------------------------------------------------------


class TestOrgResolution:
    async def test_org_resolution_finds_org_by_to_number(self):
        from app.services.twilio_webhook import resolve_org_from_phone

        org_id = uuid.uuid4()
        org = _make_org(org_id)

        phone_record = MagicMock(spec=OrgPhoneNumber)
        phone_record.org_id = org_id

        db = AsyncMock()
        scalars_result = MagicMock(first=MagicMock(return_value=phone_record))
        db.scalars = AsyncMock(return_value=scalars_result)
        db.get = AsyncMock(return_value=org)

        request = _make_request(form_data={"To": "+15551234567"})
        result = await resolve_org_from_phone(request=request, db=db)
        assert result.id == org_id

    async def test_org_resolution_finds_org_by_called_number(self):
        from app.services.twilio_webhook import resolve_org_from_phone

        org_id = uuid.uuid4()
        org = _make_org(org_id)

        phone_record = MagicMock(spec=OrgPhoneNumber)
        phone_record.org_id = org_id

        db = AsyncMock()
        scalars_result = MagicMock(first=MagicMock(return_value=phone_record))
        db.scalars = AsyncMock(return_value=scalars_result)
        db.get = AsyncMock(return_value=org)

        request = _make_request(form_data={"Called": "+15551234567"})
        result = await resolve_org_from_phone(request=request, db=db)
        assert result.id == org_id

    async def test_org_resolution_returns_404_for_unknown_number(self):
        from app.services.twilio_webhook import resolve_org_from_phone

        db = AsyncMock()
        scalars_result = MagicMock(first=MagicMock(return_value=None))
        db.scalars = AsyncMock(return_value=scalars_result)

        request = _make_request(form_data={"To": "+10000000000"})
        with pytest.raises(HTTPException) as exc_info:
            await resolve_org_from_phone(request=request, db=db)
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


class TestIdempotency:
    @patch("app.services.twilio_webhook.pg_insert")
    async def test_idempotency_first_event_returns_false(self, mock_pg_insert):
        from app.services.twilio_webhook import check_idempotency

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.rowcount = 1  # row inserted = new event
        db.execute = AsyncMock(return_value=result_mock)

        # Make pg_insert return a chainable mock
        stmt = MagicMock()
        stmt.values.return_value = stmt
        stmt.on_conflict_do_nothing.return_value = stmt
        mock_pg_insert.return_value = stmt

        is_dup = await check_idempotency(
            db=db,
            provider_sid="CA123",
            event_type="voice.status",
            org_id=uuid.uuid4(),
        )
        assert is_dup is False

    @patch("app.services.twilio_webhook.pg_insert")
    async def test_idempotency_duplicate_event_returns_true(self, mock_pg_insert):
        from app.services.twilio_webhook import check_idempotency

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.rowcount = 0  # conflict = duplicate
        db.execute = AsyncMock(return_value=result_mock)

        stmt = MagicMock()
        stmt.values.return_value = stmt
        stmt.on_conflict_do_nothing.return_value = stmt
        mock_pg_insert.return_value = stmt

        is_dup = await check_idempotency(
            db=db,
            provider_sid="CA123",
            event_type="voice.status",
            org_id=uuid.uuid4(),
        )
        assert is_dup is True

    @patch("app.services.twilio_webhook.pg_insert")
    async def test_idempotency_same_sid_different_type_is_not_duplicate(
        self, mock_pg_insert
    ):
        from app.services.twilio_webhook import check_idempotency

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.rowcount = 1  # new row inserted
        db.execute = AsyncMock(return_value=result_mock)

        stmt = MagicMock()
        stmt.values.return_value = stmt
        stmt.on_conflict_do_nothing.return_value = stmt
        mock_pg_insert.return_value = stmt

        is_dup = await check_idempotency(
            db=db,
            provider_sid="CA123",
            event_type="sms.inbound",
            org_id=uuid.uuid4(),
        )
        assert is_dup is False
