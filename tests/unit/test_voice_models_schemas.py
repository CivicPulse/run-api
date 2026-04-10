"""Tests for voice calling models and schemas (Task 1 TDD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time


def test_call_record_model_has_required_columns():
    """CallRecord model has all required columns."""
    from app.models.call_record import CallRecord

    # Verify all expected columns exist on the model
    mapper = CallRecord.__table__.columns
    expected_cols = [
        "id",
        "campaign_id",
        "twilio_sid",
        "voter_id",
        "caller_user_id",
        "phone_bank_session_id",
        "direction",
        "from_number",
        "to_number",
        "status",
        "duration_seconds",
        "price_cents",
        "started_at",
        "ended_at",
        "created_at",
    ]
    actual_cols = [c.name for c in mapper]
    for col in expected_cols:
        assert col in actual_cols, f"Missing column: {col}"


def test_campaign_model_has_calling_hours_columns():
    """Campaign model has calling hours columns with correct defaults."""
    from app.models.campaign import Campaign

    mapper = Campaign.__table__.columns
    col_names = [c.name for c in mapper]
    assert "calling_hours_start" in col_names
    assert "calling_hours_end" in col_names
    assert "calling_hours_timezone" in col_names

    # Check defaults
    start_col = mapper["calling_hours_start"]
    end_col = mapper["calling_hours_end"]
    tz_col = mapper["calling_hours_timezone"]

    assert start_col.default is not None
    assert start_col.default.arg == time(9, 0)
    assert end_col.default is not None
    assert end_col.default.arg == time(21, 0)
    assert tz_col.default is not None
    assert tz_col.default.arg == "America/New_York"


def test_organization_model_has_api_key_columns():
    """Organization model has Twilio API key columns."""
    from app.models.organization import Organization

    mapper = Organization.__table__.columns
    col_names = [c.name for c in mapper]
    assert "twilio_api_key_sid" in col_names
    assert "twilio_api_key_secret_encrypted" in col_names
    assert "twilio_api_key_secret_key_id" in col_names
    assert "twilio_twiml_app_sid" in col_names


def test_voice_token_response_schema():
    """VoiceTokenResponse has token field."""
    from app.schemas.voice import VoiceTokenResponse

    resp = VoiceTokenResponse(token="test-jwt-token")
    assert resp.token == "test-jwt-token"


def test_call_record_read_schema():
    """CallRecordRead serializes all call_record fields."""
    from app.schemas.voice import CallRecordRead

    now = datetime.now(tz=UTC)
    record = CallRecordRead(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        twilio_sid="CA1234567890",
        voter_id=uuid.uuid4(),
        caller_user_id="user-123",
        phone_bank_session_id=uuid.uuid4(),
        direction="outbound",
        from_number="+15551234567",
        to_number="+15559876543",
        status="completed",
        duration_seconds=120,
        price_cents=2,
        started_at=now,
        ended_at=now,
        created_at=now,
    )
    assert record.direction == "outbound"
    assert record.duration_seconds == 120


def test_calling_hours_check_schema():
    """CallingHoursCheck schema works."""
    from app.schemas.voice import CallingHoursCheck

    check = CallingHoursCheck(
        allowed=True,
        message=None,
        window_start="09:00",
        window_end="21:00",
        current_time="14:30",
    )
    assert check.allowed is True


def test_dnc_check_result_schema():
    """DNCCheckResult schema works."""
    from app.schemas.voice import DNCCheckResult

    result = DNCCheckResult(
        blocked=True,
        message="This number is on the DNC list and cannot be called.",
    )
    assert result.blocked is True


def test_voice_capability_response_schema():
    """VoiceCapabilityResponse schema works."""
    from app.schemas.voice import VoiceCapabilityResponse

    resp = VoiceCapabilityResponse(
        browser_call_available=False,
        reason="No voice credentials configured",
    )
    assert resp.browser_call_available is False


def test_call_record_import_in_init():
    """CallRecord is importable from app.models."""
    from app.models import CallRecord

    assert CallRecord.__tablename__ == "call_records"
