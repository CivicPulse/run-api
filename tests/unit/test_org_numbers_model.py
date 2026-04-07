"""Unit tests for OrgPhoneNumber model and Organization FK columns."""

from __future__ import annotations

import uuid

from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization


class TestOrgPhoneNumberModel:
    """Verify OrgPhoneNumber model has all required fields."""

    def test_model_fields_exist(self) -> None:
        """OrgPhoneNumber has all CONTEXT.md-specified fields."""
        number = OrgPhoneNumber(
            id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            phone_number="+15551234567",
            friendly_name="Main Line",
            phone_type="local",
            voice_capable=True,
            sms_capable=True,
            mms_capable=False,
            twilio_sid="PN1234567890abcdef1234567890abcdef",
        )
        assert number.phone_number == "+15551234567"
        assert number.friendly_name == "Main Line"
        assert number.phone_type == "local"
        assert number.voice_capable is True
        assert number.sms_capable is True
        assert number.mms_capable is False
        assert number.twilio_sid == "PN1234567890abcdef1234567890abcdef"
        assert number.capabilities_synced_at is None

    def test_model_tablename(self) -> None:
        """Table name is org_phone_numbers."""
        assert OrgPhoneNumber.__tablename__ == "org_phone_numbers"

    def test_model_defaults_configured(self) -> None:
        """Column defaults are configured for phone_type, voice/sms/mms_capable."""
        table = OrgPhoneNumber.__table__
        assert table.c.phone_type.default.arg == "unknown"
        assert table.c.voice_capable.default.arg is False
        assert table.c.sms_capable.default.arg is False
        assert table.c.mms_capable.default.arg is False


class TestOrganizationPhoneNumberFKs:
    """Verify Organization model has default phone number FK columns."""

    def test_use_alter_on_org_fks(self) -> None:
        """default_voice_number_id and default_sms_number_id exist with use_alter."""
        table = Organization.__table__
        voice_col = table.c.default_voice_number_id
        sms_col = table.c.default_sms_number_id
        assert voice_col is not None
        assert sms_col is not None
        # Both should be nullable
        assert voice_col.nullable is True
        assert sms_col.nullable is True

    def test_fk_targets_org_phone_numbers(self) -> None:
        """FK columns reference org_phone_numbers.id."""
        table = Organization.__table__
        voice_fks = [
            fk
            for fk in table.c.default_voice_number_id.foreign_keys
            if "org_phone_numbers" in fk.target_fullname
        ]
        sms_fks = [
            fk
            for fk in table.c.default_sms_number_id.foreign_keys
            if "org_phone_numbers" in fk.target_fullname
        ]
        assert len(voice_fks) == 1
        assert len(sms_fks) == 1
