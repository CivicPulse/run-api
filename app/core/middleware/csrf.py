"""CSRF protection middleware for cookie-authenticated sessions.

Implements the double-submit-cookie pattern:

- State-changing requests (POST/PUT/PATCH/DELETE) must carry an
  ``X-CSRF-Token`` header whose value matches the ``cp_csrf`` cookie.
- Bearer-token (ZITADEL JWT) requests are exempt -- bearer auth is not
  vulnerable to CSRF.
- Unauthenticated requests (no ``cp_session`` cookie) are exempt --
  downstream auth layers will reject them.
- Entry-point auth endpoints (login/register/forgot/reset/verify) are
  exempt because they carry their own one-time tokens or establish the
  session that CSRF later protects.

Matches the pure-ASGI style used by ``security_headers`` and
``request_logging`` middleware in this package.
"""

from __future__ import annotations

import secrets
from http.cookies import SimpleCookie
from typing import Any

from starlette.types import ASGIApp, Receive, Scope, Send

CSRF_COOKIE_NAME = "cp_csrf"
CSRF_HEADER_NAME = b"x-csrf-token"
SESSION_COOKIE_NAME = "cp_session"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

_FORBIDDEN_BODY = b'{"detail":"CSRF token missing or invalid"}'


def _get_header(headers: list[tuple[bytes, bytes]], name: bytes) -> str | None:
    """Extract a single header value (case-insensitive) from raw ASGI headers."""
    lname = name.lower()
    for key, value in headers:
        if key.lower() == lname:
            return value.decode("latin-1")
    return None


def _parse_cookies(headers: list[tuple[bytes, bytes]]) -> dict[str, str]:
    """Parse the ``cookie`` request header into a ``name -> value`` dict."""
    raw = _get_header(headers, b"cookie")
    if not raw:
        return {}
    jar: SimpleCookie[str] = SimpleCookie()
    try:
        jar.load(raw)
    except Exception:  # noqa: BLE001 -- malformed cookie, treat as none
        return {}
    return {k: morsel.value for k, morsel in jar.items()}


class CSRFMiddleware:
    """ASGI middleware enforcing double-submit CSRF on mutating requests."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        exempt_paths: set[str] | None = None,
        exempt_prefixes: tuple[str, ...] = (),
    ) -> None:
        self.app = app
        self.exempt_paths: set[str] = set(exempt_paths or ())
        self.exempt_prefixes: tuple[str, ...] = exempt_prefixes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method: str = scope.get("method", "GET").upper()
        if method in SAFE_METHODS:
            await self.app(scope, receive, send)
            return

        headers: list[tuple[bytes, bytes]] = scope.get("headers", [])

        # Bearer-token auth (ZITADEL) is immune to CSRF -- skip check.
        authorization = _get_header(headers, b"authorization") or ""
        if authorization.lower().startswith("bearer "):
            await self.app(scope, receive, send)
            return

        cookies = _parse_cookies(headers)

        # Unauthenticated: no session cookie => nothing to protect.
        if SESSION_COOKIE_NAME not in cookies:
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if path in self.exempt_paths or any(
            path.startswith(p) for p in self.exempt_prefixes
        ):
            await self.app(scope, receive, send)
            return

        cookie_token = cookies.get(CSRF_COOKIE_NAME) or ""
        header_token = _get_header(headers, CSRF_HEADER_NAME) or ""

        if (
            not cookie_token
            or not header_token
            or not secrets.compare_digest(cookie_token, header_token)
        ):
            await _send_forbidden(send)
            return

        await self.app(scope, receive, send)


async def _send_forbidden(send: Send) -> None:
    """Emit a 403 JSON response without invoking the downstream app."""
    headers: list[tuple[bytes, bytes]] = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(_FORBIDDEN_BODY)).encode("ascii")),
    ]
    await send({"type": "http.response.start", "status": 403, "headers": headers})
    await send({"type": "http.response.body", "body": _FORBIDDEN_BODY})


def issue_csrf_cookie(response: Any, *, secure: bool) -> str:
    """Set a fresh ``cp_csrf`` cookie on ``response`` and return its value.

    Used by the ``GET /auth/csrf`` endpoint and by ``on_after_login`` so the
    SPA can read the token (``httponly=False``) and echo it in the
    ``X-CSRF-Token`` header on mutating requests.
    """
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        max_age=60 * 60 * 24 * 7,
        httponly=False,
        secure=secure,
        samesite="lax",
    )
    return token
