"""Contract tests for org Twilio request and response schemas."""

from __future__ import annotations

from app.schemas.org import OrgResponse, OrgUpdate, TwilioOrgStatus


def test_org_response_includes_only_redacted_twilio_fields():
    data = OrgResponse.model_validate(
        {
            "id": "2dd0c874-6b17-4b73-89d1-c2a75ca157f1",
            "name": "Test Org",
            "zitadel_org_id": "zit-org",
            "created_at": "2026-04-07T12:00:00Z",
            "twilio": {
                "account_sid": "AC123",
                "account_sid_configured": True,
                "auth_token_configured": True,
                "auth_token_hint": "••••1234",
                "ready": True,
            },
        }
    )

    dumped = data.model_dump()
    assert dumped["twilio"]["account_sid"] == "AC123"
    assert "auth_token" not in dumped["twilio"]
    assert dumped["twilio"]["auth_token_hint"] == "••••1234"


def test_org_update_supports_partial_twilio_rotation():
    update = OrgUpdate.model_validate({"twilio": {"auth_token": "super-secret-value"}})

    assert update.twilio is not None
    assert update.twilio.account_sid is None
    assert update.twilio.auth_token is not None
    assert update.twilio.auth_token.get_secret_value() == "super-secret-value"


def test_secret_repr_is_masked():
    update = OrgUpdate.model_validate(
        {"name": "Org", "twilio": {"auth_token": "super-secret-value"}}
    )

    rendered = repr(update)
    assert "super-secret-value" not in rendered
    assert "auth_token" not in rendered


def test_twilio_status_defaults_are_non_secret():
    status = TwilioOrgStatus()

    assert status.account_sid is None
    assert status.auth_token_configured is False
    assert status.ready is False
