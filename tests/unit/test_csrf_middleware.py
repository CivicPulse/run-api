"""Unit tests for ``CSRFMiddleware`` (double-submit-cookie enforcement).

Covers:
- Safe methods (GET/HEAD/OPTIONS) pass with no token check.
- Bearer-token requests skip CSRF (ZITADEL path).
- Unauthenticated requests (no ``cp_session`` cookie) skip CSRF.
- Sessions missing or mismatched on ``X-CSRF-Token`` -> 403.
- Sessions with matching token -> passes through.
- Exempt paths (e.g. login) bypass the check even when a session cookie
  is present.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from app.core.middleware.csrf import CSRFMiddleware


def _make_app() -> FastAPI:
    """FastAPI app with the middleware wired to realistic exempt lists."""
    app = FastAPI()
    app.add_middleware(
        CSRFMiddleware,
        exempt_paths={"/api/v1/auth/login", "/api/v1/auth/csrf"},
        exempt_prefixes=("/api/health",),
    )

    @app.get("/thing")
    async def _get_thing() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/thing")
    async def _post_thing() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/v1/auth/login")
    async def _login() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/health/live")
    async def _health() -> dict[str, bool]:
        return {"ok": True}

    return app


@pytest.mark.anyio
async def test_get_passes_without_csrf() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.get("/thing", cookies={"cp_session": "sid"})
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_options_passes_without_csrf() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.request("OPTIONS", "/thing", cookies={"cp_session": "sid"})
    # Starlette returns 405 for OPTIONS on a non-CORS route with no handler,
    # but crucially the CSRF middleware did not short-circuit to 403.
    assert resp.status_code != 403


@pytest.mark.anyio
async def test_bearer_request_bypasses_csrf() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/thing",
            headers={"Authorization": "Bearer zitadel-jwt-xyz"},
            cookies={"cp_session": "sid"},
        )
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_unauthenticated_post_bypasses_csrf() -> None:
    # No cp_session cookie -> nothing to protect; other layers will reject.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post("/thing")
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_session_without_csrf_header_rejected() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post("/thing", cookies={"cp_session": "sid", "cp_csrf": "abc"})
    assert resp.status_code == 403
    assert resp.json() == {"detail": "CSRF token missing or invalid"}


@pytest.mark.anyio
async def test_session_with_mismatched_token_rejected() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/thing",
            cookies={"cp_session": "sid", "cp_csrf": "abc"},
            headers={"X-CSRF-Token": "not-abc"},
        )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_session_with_matching_token_passes() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/thing",
            cookies={"cp_session": "sid", "cp_csrf": "abc"},
            headers={"X-CSRF-Token": "abc"},
        )
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_exempt_path_bypasses_even_with_session() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/api/v1/auth/login",
            cookies={"cp_session": "sid", "cp_csrf": "abc"},
        )
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_missing_csrf_cookie_rejected() -> None:
    # Session present, CSRF header present, but no cp_csrf cookie -> reject.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app()), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/thing",
            cookies={"cp_session": "sid"},
            headers={"X-CSRF-Token": "abc"},
        )
    assert resp.status_code == 403
