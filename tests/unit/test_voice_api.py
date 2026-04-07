"""Unit tests for voice API endpoints -- token, TwiML, capability, compliance.

Tests endpoint handler functions directly with mocked dependencies,
bypassing FastAPI dependency injection for unit-level isolation.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.rate_limit import limiter
from app.schemas.voice import (
    CallingHoursCheck,
    DNCCheckResult,
    VoiceCapabilityResponse,
    VoiceTokenResponse,
)

# Disable rate limiter for unit tests
limiter.enabled = False

# ---------------------------------------------------------------------------
# Constants
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
        role="volunteer",
        display_name="Test User",
        email="test@example.com",
    )


def _mock_campaign():
    return SimpleNamespace(
        id=CAMPAIGN_ID,
        organization_id=uuid.uuid4(),
    )


def _mock_request():
    """Build a minimal mock Request for rate limiter."""
    req = MagicMock()
    req.client.host = "127.0.0.1"
    req.headers = {}
    req.state = MagicMock()
    return req


# ---------------------------------------------------------------------------
# Test 1: Token returns 200 with token when configured + hours OK
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_token_returns_200_when_configured():
    """generate_voice_token endpoint returns VoiceTokenResponse."""
    from app.api.v1.voice import generate_voice_token

    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    with (
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
        result = await generate_voice_token(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            user=_mock_user(),
            db=mock_db,
        )

    assert isinstance(result, VoiceTokenResponse)
    assert result.token == "fake.jwt.token"


# ---------------------------------------------------------------------------
# Test 2: Token returns 404 when org has no voice credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_token_returns_404_when_unconfigured():
    """generate_voice_token raises 404 when org not configured."""
    from fastapi import HTTPException

    from app.api.v1.voice import generate_voice_token
    from app.services.twilio_config import TwilioConfigError

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _make_org(configured=False)

    with (
        patch(
            "app.api.v1.voice._voice_service.generate_voice_token",
            side_effect=TwilioConfigError("Not configured"),
        ),
        patch(
            "app.api.v1.voice._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await generate_voice_token(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            user=_mock_user(),
            db=mock_db,
        )

    assert exc_info.value.status_code == 404
    assert "not configured" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# Test 3: Capability endpoint returns correct boolean
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_capability_returns_available():
    """check_voice_capability returns VoiceCapabilityResponse."""
    from app.api.v1.voice import check_voice_capability

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _make_org(configured=True)

    with (
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
        result = await check_voice_capability(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            user=_mock_user(),
            db=mock_db,
        )

    assert result.browser_call_available is True


# ---------------------------------------------------------------------------
# Test 4: TwiML returns valid XML with Dial+Number when To provided
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_twiml_returns_dial_xml_when_to_provided():
    """twiml_voice_handler returns TwiML XML with Dial element."""
    from app.api.v1.voice import twiml_voice_handler

    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    # Build a mock request with form data
    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}

    async def _form():
        return {
            "To": "+15552222222",
            "From": "client:user_abc_123",
            "CallSid": "CA12345",
            "CampaignId": str(CAMPAIGN_ID),
        }

    request.form = _form

    with (
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
        result = await twiml_voice_handler(request=request, db=mock_db)

    assert result.status_code == 200
    assert "text/xml" in result.media_type
    body = result.body.decode()
    assert "<Dial" in body
    assert "+15552222222" in body


# ---------------------------------------------------------------------------
# Test 5: TwiML returns hangup when To param missing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_twiml_returns_hangup_when_no_to():
    """twiml_voice_handler returns hangup TwiML when To param missing."""
    from app.api.v1.voice import twiml_voice_handler

    mock_db = AsyncMock()

    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}

    async def _form():
        return {
            "From": "client:user_abc_123",
            "CallSid": "CA12345",
        }

    request.form = _form

    result = await twiml_voice_handler(request=request, db=mock_db)

    assert result.status_code == 200
    body = result.body.decode()
    assert "<Hangup" in body or "<Say" in body


# ---------------------------------------------------------------------------
# Test 6: TwiML rejects when destination is on DNC
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_twiml_rejects_dnc_number():
    """twiml_voice_handler rejects call when destination is on DNC."""
    from app.api.v1.voice import twiml_voice_handler

    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}

    async def _form():
        return {
            "To": "+15552222222",
            "From": "client:user_abc_123",
            "CallSid": "CA12345",
            "CampaignId": str(CAMPAIGN_ID),
        }

    request.form = _form

    with (
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
            return_value=DNCCheckResult(blocked=True, message="Number is on DNC list"),
        ),
    ):
        result = await twiml_voice_handler(request=request, db=mock_db)

    assert result.status_code == 200
    body = result.body.decode()
    assert "<Dial" not in body
    assert "<Hangup" in body or "blocked" in body.lower() or "<Say" in body


# ---------------------------------------------------------------------------
# Test 7: TwiML rejects when outside calling hours
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_twiml_rejects_outside_calling_hours():
    """twiml_voice_handler rejects call when outside calling hours."""
    from app.api.v1.voice import twiml_voice_handler

    mock_db = AsyncMock()
    mock_org = _make_org(configured=True)
    mock_campaign = _mock_campaign()

    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}

    async def _form():
        return {
            "To": "+15552222222",
            "From": "client:user_abc_123",
            "CallSid": "CA12345",
            "CampaignId": str(CAMPAIGN_ID),
        }

    request.form = _form

    with (
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
        result = await twiml_voice_handler(request=request, db=mock_db)

    assert result.status_code == 200
    body = result.body.decode()
    assert "<Dial" not in body
    assert "<Hangup" in body or "blocked" in body.lower() or "<Say" in body
