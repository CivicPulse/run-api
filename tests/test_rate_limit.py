"""Unit tests for trusted proxy IP extraction and per-user rate limit keys."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock

from app.core.rate_limit import get_real_ip, get_user_or_ip_key


def _make_request(
    host: str = "127.0.0.1",
    headers: dict[str, str] | None = None,
) -> MagicMock:
    """Create a mock FastAPI Request with configurable client and headers."""
    request = MagicMock()
    request.client.host = host
    _headers = headers or {}
    request.headers.get = lambda key, default="": _headers.get(key, default)
    return request


def _make_jwt(payload: dict) -> str:
    """Create a minimal JWT token (header.payload.signature) for testing."""
    header = (
        base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode())
        .rstrip(b"=")
        .decode()
    )
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    return f"{header}.{body}.fake-sig"


class TestGetRealIp:
    """Tests for get_real_ip trusted proxy IP extraction."""

    def test_get_real_ip_trusted_proxy_uses_cf_header(self) -> None:
        """Request from Cloudflare IP with CF-Connecting-IP returns real IP."""
        request = _make_request(
            host="173.245.48.1",
            headers={"cf-connecting-ip": "203.0.113.50"},
        )
        assert get_real_ip(request) == "203.0.113.50"

    def test_get_real_ip_untrusted_proxy_ignores_cf_header(self) -> None:
        """Request from non-proxy IP ignores CF-Connecting-IP (spoofing)."""
        request = _make_request(
            host="192.168.1.100",
            headers={"cf-connecting-ip": "203.0.113.50"},
        )
        assert get_real_ip(request) == "192.168.1.100"

    def test_get_real_ip_trusted_proxy_no_header_falls_back(self) -> None:
        """Request from Cloudflare IP without headers falls back to host."""
        request = _make_request(host="173.245.48.1")
        assert get_real_ip(request) == "173.245.48.1"

    def test_get_real_ip_uses_x_real_ip_fallback(self) -> None:
        """Request from Cloudflare IP with X-Real-IP (no CF) uses it."""
        request = _make_request(
            host="173.245.48.1",
            headers={"x-real-ip": "10.0.0.1"},
        )
        assert get_real_ip(request) == "10.0.0.1"


class TestGetUserOrIpKey:
    """Tests for get_user_or_ip_key JWT extraction."""

    def test_get_user_or_ip_key_with_valid_jwt(self) -> None:
        """Request with JWT Bearer token returns user:{sub}."""
        token = _make_jwt({"sub": "user123"})
        request = _make_request(
            host="10.0.0.1",
            headers={"authorization": f"Bearer {token}"},
        )
        assert get_user_or_ip_key(request) == "user:user123"

    def test_get_user_or_ip_key_without_auth(self) -> None:
        """Request without Authorization header returns IP address."""
        request = _make_request(host="10.0.0.1")
        assert get_user_or_ip_key(request) == "10.0.0.1"
