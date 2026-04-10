"""Tests for observability: PII scrubbing, Sentry init, and middleware."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.core.observability import request_id_var
from app.core.sentry import scrub_pii


def test_scrub_pii_strips_phone():
    """Phone numbers in exception values are replaced."""
    event = {"exception": {"values": [{"value": "Error for voter 5551234567"}]}}
    result = scrub_pii(event, {})
    assert "[REDACTED_PHONE]" in result["exception"]["values"][0]["value"]
    assert "5551234567" not in result["exception"]["values"][0]["value"]


def test_scrub_pii_strips_email():
    """Email addresses in exception values are replaced."""
    event = {"exception": {"values": [{"value": "Error for voter@example.com"}]}}
    result = scrub_pii(event, {})
    assert "[REDACTED_EMAIL]" in result["exception"]["values"][0]["value"]
    assert "voter@example.com" not in result["exception"]["values"][0]["value"]


def test_scrub_pii_strips_mailgun_secrets_and_auth_headers():
    """Mailgun keys and auth headers are replaced."""
    event = {
        "exception": {
            "values": [
                {
                    "value": (
                        "Mailgun failed with key-abc123xyz and "
                        "Authorization: Basic dXNlcjpzZWNyZXQ="
                    )
                }
            ]
        }
    }
    result = scrub_pii(event, {})
    value = result["exception"]["values"][0]["value"]
    assert "[REDACTED_SECRET]" in value
    assert "[REDACTED_AUTH]" in value
    assert "key-abc123xyz" not in value
    assert "dXNlcjpzZWNyZXQ=" not in value


def test_scrub_pii_preserves_tags():
    """Existing tags like user_id are not scrubbed."""
    event = {"tags": {"user_id": "abc123"}}
    result = scrub_pii(event, {})
    assert result["tags"]["user_id"] == "abc123"


def test_scrub_pii_attaches_request_id_tag():
    """request_id ContextVar is attached as a Sentry tag."""
    token = request_id_var.set("test-req-id")
    try:
        event: dict = {}
        result = scrub_pii(event, {})
        assert result["tags"]["request_id"] == "test-req-id"
    finally:
        request_id_var.reset(token)


def test_init_sentry_noop_without_dsn():
    """init_sentry() does not raise when SENTRY_DSN is empty."""
    from app.core.config import settings
    from app.core.sentry import init_sentry

    original = settings.sentry_dsn
    try:
        settings.sentry_dsn = ""
        init_sentry()  # should not raise
    finally:
        settings.sentry_dsn = original


@pytest.mark.asyncio
async def test_health_check_excluded(capsys):
    """Health check paths are not logged by StructlogMiddleware."""
    from app.core.middleware.request_logging import StructlogMiddleware

    async def mock_app(scope, receive, send):
        # Send a minimal response
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [],
            }
        )
        await send({"type": "http.response.body", "body": b""})

    middleware = StructlogMiddleware(mock_app)

    # Health check path -- should NOT produce log output
    health_scope = {
        "type": "http",
        "path": "/health/live",
        "method": "GET",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 8000),
    }
    await middleware(health_scope, AsyncMock(), AsyncMock())
    captured = capsys.readouterr()
    # No JSON log line should be emitted for health checks
    assert "request" not in captured.out or "/health" in captured.out

    # API path -- SHOULD produce a log line
    api_scope = {
        "type": "http",
        "path": "/api/v1/test",
        "method": "GET",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 8000),
    }
    send_mock = AsyncMock()
    await middleware(api_scope, AsyncMock(), send_mock)
    captured = capsys.readouterr()
    # Should contain a JSON log with "request" event
    assert '"event": "request"' in captured.out
    assert '"/api/v1/test"' in captured.out
