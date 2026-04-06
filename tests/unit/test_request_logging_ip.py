"""REL-07 (H16): Assert request-logging middleware honors trusted-proxy check.

This test SHOULD FAIL on current main — StructlogMiddleware at
app/core/middleware/request_logging.py:81-85 unconditionally prefers
`cf-connecting-ip` / `x-real-ip` over scope client, which lets any
external caller spoof their source IP in logs. Plan 76-02 will gate
header trust on `_is_trusted_proxy(scope_client_host)`.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from app.core.middleware.request_logging import StructlogMiddleware


async def _noop_app(scope: dict, receive: Any, send: Any) -> None:
    """Trivial ASGI app that returns 200 with empty body."""
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-length", b"0")],
        }
    )
    await send({"type": "http.response.body", "body": b"", "more_body": False})


async def _empty_receive() -> dict:
    return {"type": "http.request", "body": b"", "more_body": False}


async def _drive_middleware(
    headers: list[tuple[bytes, bytes]],
    client: tuple[str, int],
    monkeypatch: pytest.MonkeyPatch,
) -> str:
    """Drive StructlogMiddleware once and return the captured client_ip."""
    captured: dict = {}

    def _capture(event: str, **kwargs: Any) -> None:
        captured.update(kwargs)

    logger_mock = MagicMock()
    logger_mock.info = MagicMock(side_effect=_capture)
    monkeypatch.setattr("app.core.middleware.request_logging._logger", logger_mock)

    middleware = StructlogMiddleware(_noop_app)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/foo",
        "headers": headers,
        "client": client,
        "query_string": b"",
    }

    sent: list[dict] = []

    async def _send(msg: dict) -> None:
        sent.append(msg)

    await middleware(scope, _empty_receive, _send)
    return captured.get("client_ip", "")


@pytest.mark.asyncio
async def test_ip_from_untrusted_client_ignores_x_real_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An untrusted scope client must not be able to spoof X-Real-IP."""
    client_ip = await _drive_middleware(
        headers=[(b"x-real-ip", b"1.2.3.4")],
        client=("8.8.8.8", 12345),  # NOT in Cloudflare CIDR list
        monkeypatch=monkeypatch,
    )
    assert client_ip == "8.8.8.8", (
        f"Untrusted client 8.8.8.8 must NOT be allowed to spoof X-Real-IP; "
        f"expected logged client_ip='8.8.8.8', got {client_ip!r}. (REL-07)"
    )


@pytest.mark.asyncio
async def test_ip_from_untrusted_client_ignores_cf_connecting_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An untrusted scope client must not be able to spoof CF-Connecting-IP."""
    client_ip = await _drive_middleware(
        headers=[(b"cf-connecting-ip", b"9.9.9.9")],
        client=("8.8.8.8", 12345),  # NOT in Cloudflare CIDR list
        monkeypatch=monkeypatch,
    )
    assert client_ip == "8.8.8.8", (
        f"Untrusted client 8.8.8.8 must NOT be allowed to spoof "
        f"CF-Connecting-IP; expected client_ip='8.8.8.8', got "
        f"{client_ip!r}. (REL-07)"
    )


@pytest.mark.asyncio
async def test_ip_from_trusted_proxy_honors_x_real_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Cloudflare-range scope client MAY set client_ip via X-Real-IP."""
    client_ip = await _drive_middleware(
        headers=[(b"x-real-ip", b"1.2.3.4")],
        client=("173.245.48.1", 12345),  # Cloudflare CIDR
        monkeypatch=monkeypatch,
    )
    assert client_ip == "1.2.3.4", (
        f"Trusted Cloudflare proxy must be allowed to set X-Real-IP; "
        f"expected client_ip='1.2.3.4', got {client_ip!r}. (REL-07)"
    )


@pytest.mark.asyncio
async def test_ip_from_trusted_proxy_prefers_cf_connecting_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """cf-connecting-ip must take precedence over x-real-ip for trusted proxies."""
    client_ip = await _drive_middleware(
        headers=[
            (b"cf-connecting-ip", b"9.9.9.9"),
            (b"x-real-ip", b"1.2.3.4"),
        ],
        client=("173.245.48.1", 12345),  # Cloudflare CIDR
        monkeypatch=monkeypatch,
    )
    assert client_ip == "9.9.9.9", (
        f"CF-Connecting-IP should win over X-Real-IP for trusted proxies; "
        f"expected client_ip='9.9.9.9', got {client_ip!r}. (REL-07)"
    )


@pytest.mark.asyncio
async def test_ip_falls_back_to_scope_client_when_no_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With no proxy headers, client_ip must come from scope.client."""
    client_ip = await _drive_middleware(
        headers=[],
        client=("10.0.0.1", 12345),
        monkeypatch=monkeypatch,
    )
    assert client_ip == "10.0.0.1", (
        f"Without proxy headers, client_ip must fall back to scope client; "
        f"expected '10.0.0.1', got {client_ip!r}."
    )
