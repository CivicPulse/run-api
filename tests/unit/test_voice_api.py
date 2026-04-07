"""Unit tests for voice API endpoints — token, TwiML, capability, compliance."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.schemas.voice import (
    CallingHoursCheck,
    DNCCheckResult,
    VoiceCapabilityResponse,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()
USER_ID = "user-abc-123"


def _make_org(*, configured: bool = True):
    if configured:
        return SimpleNamespace(
            id=uuid.uuid4(),
            twilio_account_sid="ACtest123",
            twilio_api_key_sid="SKtest456",
            twilio_api_key_secret_encrypted="encrypted-secret",
            twilio_api_key_secret_key_id="k1",
            twilio_twiml_app_sid="APtest789",
            twilio_auth_token_encrypted="enc",
            twilio_auth_token_key_id="k1",
            default_voice_number_id=uuid.uuid4(),
        )
    return SimpleNamespace(
        id=uuid.uuid4(),
        twilio_account_sid=None,
        twilio_api_key_sid=None,
        twilio_api_key_secret_encrypted=None,
        twilio_api_key_secret_key_id=None,
        twilio_twiml_app_sid=None,
        twilio_auth_token_encrypted=None,
        twilio_auth_token_key_id=None,
        default_voice_number_id=None,
    )


def _mock_user():
    return SimpleNamespace(
        id=USER_ID,
        org_id="org-zitadel-123",
        sub=USER_ID,
    )


def _mock_campaign():
    return SimpleNamespace(
        id=CAMPAIGN_ID,
        organization_id=uuid.uuid4(),
    )


@pytest.fixture()
def app_client():
    """Build a test app with voice routes and mocked dependencies."""
    from app.api.v1 import voice

    app = FastAPI()
    app.include_router(voice.campaign_router, prefix="/api/v1/campaigns")
    app.include_router(voice.twiml_router, prefix="/api/v1/voice")

    return TestClient(app)


# ---------------------------------------------------------------------------
# Test 1: Token returns 200 with token when configured + hours OK
# ---------------------------------------------------------------------------


def test_voice_token_returns_200_when_configured(app_client):
    """POST /campaigns/{id}/voice/token returns 200 with token."""
    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    with (
        patch(
            "app.api.v1.voice.require_role",
            return_value=lambda: _mock_user(),
        ),
        patch(
            "app.api.v1.voice.get_campaign_db",
        ) as mock_get_db,
        patch(
            "app.api.v1.voice._voice_service.generate_voice_token",
            return_value="fake.jwt.token",
        ),
        patch(
            "app.api.v1.voice._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
    ):
        mock_get_db.return_value = mock_db

        resp = app_client.post(f"/api/v1/campaigns/{CAMPAIGN_ID}/voice/token")

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["token"] == "fake.jwt.token"


# ---------------------------------------------------------------------------
# Test 2: Token returns 404 when org has no voice credentials
# ---------------------------------------------------------------------------


def test_voice_token_returns_404_when_unconfigured(app_client):
    """POST /campaigns/{id}/voice/token returns 404 when not configured."""
    from app.services.twilio_config import TwilioConfigError

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _make_org(configured=False)

    with (
        patch(
            "app.api.v1.voice.require_role",
            return_value=lambda: _mock_user(),
        ),
        patch("app.api.v1.voice.get_campaign_db") as mock_get_db,
        patch(
            "app.api.v1.voice._voice_service.generate_voice_token",
            side_effect=TwilioConfigError("Not configured"),
        ),
        patch(
            "app.api.v1.voice._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
    ):
        mock_get_db.return_value = mock_db

        resp = app_client.post(f"/api/v1/campaigns/{CAMPAIGN_ID}/voice/token")

    assert resp.status_code == 404
    assert "not configured" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 3: Capability endpoint returns correct boolean
# ---------------------------------------------------------------------------


def test_voice_capability_returns_available(app_client):
    """GET /campaigns/{id}/voice/capability returns browser_call_available."""
    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _make_org(configured=True)

    with (
        patch(
            "app.api.v1.voice.require_role",
            return_value=lambda: _mock_user(),
        ),
        patch("app.api.v1.voice.get_campaign_db") as mock_get_db,
        patch(
            "app.api.v1.voice._voice_service.check_voice_capability",
            new_callable=AsyncMock,
            return_value=VoiceCapabilityResponse(
                browser_call_available=True, reason=None
            ),
        ),
        patch(
            "app.api.v1.voice._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
    ):
        mock_get_db.return_value = mock_db

        resp = app_client.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/voice/capability")

    assert resp.status_code == 200
    data = resp.json()
    assert data["browser_call_available"] is True


# ---------------------------------------------------------------------------
# Test 4: TwiML returns valid XML with Dial+Number when To provided
# ---------------------------------------------------------------------------


def test_twiml_returns_dial_xml_when_to_provided(app_client):
    """POST /voice/twiml returns TwiML XML with Dial element."""
    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    # Mock the phone number lookup for caller ID
    mock_phone = SimpleNamespace(phone_number="+15551111111")

    with (
        patch(
            "app.api.v1.voice.verify_twilio_signature",
            return_value=mock_org,
        ),
        patch("app.api.v1.voice.get_db") as mock_get_db_dep,
        patch(
            "app.api.v1.voice._resolve_twiml_context",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.voice._voice_service.check_calling_hours",
            return_value=CallingHoursCheck(allowed=True),
        ),
        patch(
            "app.api.v1.voice._voice_service.check_dnc",
            new_callable=AsyncMock,
            return_value=DNCCheckResult(blocked=False),
        ),
        patch(
            "app.api.v1.voice._voice_service.create_call_record",
            new_callable=AsyncMock,
        ),
        patch(
            "app.api.v1.voice._get_caller_id",
            new_callable=AsyncMock,
            return_value="+15551111111",
        ),
    ):
        mock_get_db_dep.return_value = mock_db

        resp = app_client.post(
            "/api/v1/voice/twiml",
            data={
                "To": "+15552222222",
                "From": "client:user_abc_123",
                "CallSid": "CA12345",
                "CampaignId": str(CAMPAIGN_ID),
            },
        )

    assert resp.status_code == 200
    assert "text/xml" in resp.headers.get("content-type", "")
    body = resp.text
    assert "<Dial" in body
    assert "+15552222222" in body


# ---------------------------------------------------------------------------
# Test 5: TwiML returns hangup when To param missing
# ---------------------------------------------------------------------------


def test_twiml_returns_hangup_when_no_to(app_client):
    """POST /voice/twiml returns hangup TwiML when To param missing."""
    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)

    with (
        patch(
            "app.api.v1.voice.verify_twilio_signature",
            return_value=mock_org,
        ),
        patch("app.api.v1.voice.get_db") as mock_get_db_dep,
    ):
        mock_get_db_dep.return_value = mock_db

        resp = app_client.post(
            "/api/v1/voice/twiml",
            data={
                "From": "client:user_abc_123",
                "CallSid": "CA12345",
            },
        )

    assert resp.status_code == 200
    assert "text/xml" in resp.headers.get("content-type", "")
    body = resp.text
    assert "<Hangup" in body or "<Say" in body


# ---------------------------------------------------------------------------
# Test 6: TwiML rejects when destination is on DNC
# ---------------------------------------------------------------------------


def test_twiml_rejects_dnc_number(app_client):
    """POST /voice/twiml rejects call when destination is on DNC."""
    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    with (
        patch(
            "app.api.v1.voice.verify_twilio_signature",
            return_value=mock_org,
        ),
        patch("app.api.v1.voice.get_db") as mock_get_db_dep,
        patch(
            "app.api.v1.voice._resolve_twiml_context",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.voice._voice_service.check_calling_hours",
            return_value=CallingHoursCheck(allowed=True),
        ),
        patch(
            "app.api.v1.voice._voice_service.check_dnc",
            new_callable=AsyncMock,
            return_value=DNCCheckResult(
                blocked=True, message="Number is on DNC list"
            ),
        ),
    ):
        mock_get_db_dep.return_value = mock_db

        resp = app_client.post(
            "/api/v1/voice/twiml",
            data={
                "To": "+15552222222",
                "From": "client:user_abc_123",
                "CallSid": "CA12345",
                "CampaignId": str(CAMPAIGN_ID),
            },
        )

    assert resp.status_code == 200
    body = resp.text
    # Should contain rejection/hangup, not Dial
    assert "<Dial" not in body
    assert "<Hangup" in body or "blocked" in body.lower() or "<Say" in body


# ---------------------------------------------------------------------------
# Test 7: TwiML rejects when outside calling hours
# ---------------------------------------------------------------------------


def test_twiml_rejects_outside_calling_hours(app_client):
    """POST /voice/twiml rejects call when outside calling hours."""
    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    with (
        patch(
            "app.api.v1.voice.verify_twilio_signature",
            return_value=mock_org,
        ),
        patch("app.api.v1.voice.get_db") as mock_get_db_dep,
        patch(
            "app.api.v1.voice._resolve_twiml_context",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.voice._voice_service.check_calling_hours",
            return_value=CallingHoursCheck(
                allowed=False, message="Outside calling hours"
            ),
        ),
    ):
        mock_get_db_dep.return_value = mock_db

        resp = app_client.post(
            "/api/v1/voice/twiml",
            data={
                "To": "+15552222222",
                "From": "client:user_abc_123",
                "CallSid": "CA12345",
                "CampaignId": str(CAMPAIGN_ID),
            },
        )

    assert resp.status_code == 200
    body = resp.text
    # Should contain rejection, not Dial
    assert "<Dial" not in body
    assert "<Hangup" in body or "blocked" in body.lower() or "<Say" in body
