"""Unit tests for VoiceService — token generation, compliance, call records."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_org(*, configured: bool = True):
    """Return a mock org with or without voice credentials."""
    if configured:
        return SimpleNamespace(
            twilio_account_sid="ACtest123",
            twilio_api_key_sid="SKtest456",
            twilio_api_key_secret_encrypted="encrypted-secret",
            twilio_api_key_secret_key_id="k1",
            twilio_twiml_app_sid="APtest789",
            twilio_auth_token_encrypted="enc",
            twilio_auth_token_key_id="k1",
            id=uuid.uuid4(),
        )
    return SimpleNamespace(
        twilio_account_sid=None,
        twilio_api_key_sid=None,
        twilio_api_key_secret_encrypted=None,
        twilio_api_key_secret_key_id=None,
        twilio_twiml_app_sid=None,
        twilio_auth_token_encrypted=None,
        twilio_auth_token_key_id=None,
        id=uuid.uuid4(),
    )


def _make_campaign(
    *,
    start: time = time(9, 0),
    end: time = time(21, 0),
    tz: str = "America/New_York",
):
    return SimpleNamespace(
        calling_hours_start=start,
        calling_hours_end=end,
        calling_hours_timezone=tz,
    )


# ---------------------------------------------------------------------------
# Test 1: Token generation succeeds with configured org
# ---------------------------------------------------------------------------


def test_generate_voice_token_returns_jwt():
    from app.services.voice import VoiceService

    svc = VoiceService()
    org = _make_org(configured=True)

    with patch.object(
        svc._twilio_config,
        "voice_credentials_for_org",
        return_value=SimpleNamespace(
            account_sid="ACtest123",
            api_key_sid="SKtest456",
            api_key_secret="real-secret",
            twiml_app_sid="APtest789",
        ),
    ):
        token = svc.generate_voice_token(org, user_id="user-abc-123")

    assert isinstance(token, str)
    assert len(token) > 50  # JWT is non-trivial


# ---------------------------------------------------------------------------
# Test 2: Token generation raises when org not configured
# ---------------------------------------------------------------------------


def test_generate_voice_token_raises_when_unconfigured():
    from app.services.twilio_config import TwilioConfigError
    from app.services.voice import VoiceService

    svc = VoiceService()
    org = _make_org(configured=False)

    with (
        patch.object(
            svc._twilio_config,
            "voice_credentials_for_org",
            return_value=None,
        ),
        pytest.raises(TwilioConfigError),
    ):
        svc.generate_voice_token(org, user_id="user-abc")


# ---------------------------------------------------------------------------
# Test 3: Calling hours — within window
# ---------------------------------------------------------------------------


def test_check_calling_hours_within_window():
    from app.services.voice import VoiceService

    svc = VoiceService()
    campaign = _make_campaign(start=time(9, 0), end=time(21, 0), tz="UTC")

    # Mock datetime.now to return 14:00 UTC
    mock_dt = datetime(2026, 4, 7, 14, 0, 0, tzinfo=UTC)
    with patch("app.services.voice.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = svc.check_calling_hours(campaign)

    assert result.allowed is True


# ---------------------------------------------------------------------------
# Test 4: Calling hours — outside window
# ---------------------------------------------------------------------------


def test_check_calling_hours_outside_window():
    from app.services.voice import VoiceService

    svc = VoiceService()
    campaign = _make_campaign(start=time(9, 0), end=time(21, 0), tz="UTC")

    # Mock datetime.now to return 22:00 UTC (outside 9-21)
    mock_dt = datetime(2026, 4, 7, 22, 0, 0, tzinfo=UTC)
    with patch("app.services.voice.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = svc.check_calling_hours(campaign)

    assert result.allowed is False
    assert "Outside calling hours" in (result.message or "")


# ---------------------------------------------------------------------------
# Test 5: DNC check — blocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_dnc_blocked():
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()
    campaign_id = uuid.uuid4()

    dnc_resp = SimpleNamespace(is_dnc=True, entry=SimpleNamespace(id=uuid.uuid4()))
    with patch.object(
        svc._dnc_service,
        "check_number",
        new_callable=AsyncMock,
        return_value=dnc_resp,
    ):
        result = await svc.check_dnc(db, campaign_id, "+15551234567")

    assert result.blocked is True
    assert "DNC" in (result.message or "")


# ---------------------------------------------------------------------------
# Test 6: DNC check — not blocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_dnc_not_blocked():
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()
    campaign_id = uuid.uuid4()

    dnc_resp = SimpleNamespace(is_dnc=False, entry=None)
    with patch.object(
        svc._dnc_service,
        "check_number",
        new_callable=AsyncMock,
        return_value=dnc_resp,
    ):
        result = await svc.check_dnc(db, campaign_id, "+15551234567")

    assert result.blocked is False
    assert result.message is None


# ---------------------------------------------------------------------------
# Test 7: Create call record
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_call_record():
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()
    campaign_id = uuid.uuid4()
    voter_id = uuid.uuid4()

    record = await svc.create_call_record(
        db,
        campaign_id=campaign_id,
        twilio_sid="CA123",
        voter_id=voter_id,
        caller_user_id="user-1",
        phone_bank_session_id=None,
        from_number="+15551111111",
        to_number="+15552222222",
    )

    assert record.campaign_id == campaign_id
    assert record.twilio_sid == "CA123"
    assert record.caller_user_id == "user-1"
    assert record.status == "initiated"
    db.add.assert_called_once()
    db.flush.assert_awaited_once()


# ---------------------------------------------------------------------------
# Test 8: Update call record from webhook (idempotent)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_call_record_from_webhook():
    from app.models.call_record import CallRecord
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()

    existing = CallRecord(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        twilio_sid="CA123",
        caller_user_id="user-1",
        from_number="+15551111111",
        to_number="+15552222222",
        status="initiated",
        started_at=datetime.now(tz=UTC),
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    db.execute.return_value = mock_result

    now = datetime.now(tz=UTC)
    updated = await svc.update_call_record_from_webhook(
        db,
        twilio_sid="CA123",
        status="completed",
        duration_seconds=120,
        ended_at=now,
        price_cents=2,
    )

    assert updated is not None
    assert updated.status == "completed"
    assert updated.duration_seconds == 120
    db.flush.assert_awaited_once()


# ---------------------------------------------------------------------------
# Test 9: Voice capability check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_capability_configured():
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()
    org = _make_org(configured=True)

    with patch.object(
        svc._twilio_config,
        "voice_credentials_for_org",
        return_value=SimpleNamespace(
            account_sid="AC1",
            api_key_sid="SK1",
            api_key_secret="sec",
            twiml_app_sid="AP1",
        ),
    ):
        # Mock query for voice-capable phone numbers
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = 1  # at least one
        db.execute.return_value = mock_result

        result = await svc.check_voice_capability(db, org)

    assert result.browser_call_available is True


@pytest.mark.asyncio
async def test_voice_capability_unconfigured():
    from app.services.voice import VoiceService

    svc = VoiceService()
    db = AsyncMock()
    org = _make_org(configured=False)

    with patch.object(
        svc._twilio_config,
        "voice_credentials_for_org",
        return_value=None,
    ):
        result = await svc.check_voice_capability(db, org)

    assert result.browser_call_available is False
    assert result.reason is not None
