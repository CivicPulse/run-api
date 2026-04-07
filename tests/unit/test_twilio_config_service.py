"""Unit tests for Twilio config encryption and redaction helpers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.services.twilio_config import TwilioConfigError, TwilioConfigService


VALID_FERNET_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="


def build_settings(**overrides: str) -> Settings:
    values = {
        "twilio_encryption_current_key_id": "primary",
        "twilio_encryption_current_key": VALID_FERNET_KEY,
    }
    values.update(overrides)
    return Settings(
        **values,
    )


def test_encrypt_and_decrypt_round_trip():
    settings_obj = build_settings()
    with patch("app.services.twilio_config.settings", settings_obj):
        service = TwilioConfigService()
        encrypted = service.encrypt_auth_token("twilio-secret-token")

        assert encrypted.key_id == "primary"
        assert encrypted.last4 == "oken"
        assert encrypted.ciphertext != "twilio-secret-token"
        assert service.decrypt_auth_token(encrypted.ciphertext, encrypted.key_id) == (
            "twilio-secret-token"
        )


def test_redaction_helpers_do_not_expose_plaintext():
    settings_obj = build_settings()
    with patch("app.services.twilio_config.settings", settings_obj):
        service = TwilioConfigService()
        encrypted = service.encrypt_auth_token("test-secret-value")

        assert service.auth_token_hint(encrypted.last4) == "••••alue"
        assert "test-secret-value" not in service.auth_token_hint(encrypted.last4)
        assert service.readiness(
            account_sid="AC123",
            auth_token_encrypted=encrypted.ciphertext,
        )


def test_missing_encryption_settings_fail_closed():
    settings_obj = Settings(
        twilio_encryption_current_key_id="primary",
        twilio_encryption_current_key="",
    )
    with patch("app.services.twilio_config.settings", settings_obj):
        service = TwilioConfigService()
        with pytest.raises(TwilioConfigError, match="not configured"):
            service.encrypt_auth_token("twilio-secret-token")


def test_invalid_key_configuration_is_non_secret():
    settings_obj = build_settings(twilio_encryption_current_key="not-a-valid-key")
    with patch("app.services.twilio_config.settings", settings_obj):
        service = TwilioConfigService()
        with pytest.raises(TwilioConfigError, match="invalid"):
            service.encrypt_auth_token("twilio-secret-token")
