"""Phase 79 regressions for security headers and safe error normalization."""

from __future__ import annotations

from http import HTTPStatus

import httpx
import pytest
from fastapi import APIRouter
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.services.voter import decode_cursor


class UniqueViolationError(Exception):
    """Test double matching asyncpg unique-violation naming."""


class ForeignKeyViolationError(Exception):
    """Test double matching asyncpg FK-violation naming."""


def _build_app_with_probe_routes():
    app = create_app()
    router = APIRouter()

    @router.get("/__phase79__/unique")
    async def unique_error():
        raise IntegrityError(
            "INSERT INTO voter_phones VALUES (...)",
            {},
            UniqueViolationError("constraint uq_voter_phone_campaign_voter_value"),
        )

    @router.get("/__phase79__/foreign-key")
    async def foreign_key_error():
        raise IntegrityError(
            "INSERT INTO voter_interactions VALUES (...)",
            {},
            ForeignKeyViolationError("walk_list_canvassers_user_id_fkey"),
        )

    @router.get("/__phase79__/boom")
    async def boom():
        raise RuntimeError(
            "sqlalchemy stack trace with postgresql.civpulse-infra.svc.cluster.local"
        )

    @router.get("/__phase79__/cursor")
    async def cursor_error():
        decode_cursor("bogus", sort_by=None)
        return {"ok": True}

    app.include_router(router)
    return app


@pytest.mark.asyncio
async def test_security_headers_present_on_http_responses(monkeypatch) -> None:
    """Core hardening headers should be present on ordinary responses."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "development")
    app = create_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")

    assert response.status_code == HTTPStatus.OK
    assert response.headers["content-security-policy"]
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "strict-transport-security" not in response.headers


@pytest.mark.asyncio
async def test_hsts_added_for_secure_production_requests(monkeypatch) -> None:
    """HSTS should only appear for production HTTPS traffic."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    app = create_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport,
        base_url="https://run.civpulse.org",
    ) as client:
        response = await client.get("/health/live")

    assert response.status_code == HTTPStatus.OK
    assert (
        response.headers["strict-transport-security"]
        == "max-age=31536000; includeSubDomains"
    )


@pytest.mark.asyncio
async def test_http_forwarded_proto_redirects_in_production(monkeypatch) -> None:
    """HTTPS redirect is delegated to Cloudflare at the edge.

    Cloudflare runs in "flexible" mode and connects to the origin over
    plain HTTP (x-forwarded-proto: http). The application MUST NOT issue
    its own redirect in that case, otherwise Cloudflare would loop.
    The request should therefore be served normally (200) and HSTS must
    NOT be emitted for a non-HTTPS-terminated request.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    app = create_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://run.civpulse.org",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/health/live",
            headers={"x-forwarded-proto": "http", "host": "run.civpulse.org"},
        )

    assert response.status_code == HTTPStatus.OK
    assert "strict-transport-security" not in response.headers


def test_docs_disabled_in_production(monkeypatch) -> None:
    """Production app should not expose interactive docs or OpenAPI routes."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    app = create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


@pytest.mark.asyncio
async def test_unique_violation_is_sanitized_to_409() -> None:
    """Unique constraint failures should become safe 409 responses."""
    app = _build_app_with_probe_routes()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__phase79__/unique")

    assert response.status_code == HTTPStatus.CONFLICT
    body = response.json()
    assert body["detail"] == "Request conflicts with existing data"
    assert "constraint" not in response.text.lower()
    assert "insert into" not in response.text.lower()


@pytest.mark.asyncio
async def test_foreign_key_violation_is_sanitized_to_404() -> None:
    """FK failures should become safe 404 responses."""
    app = _build_app_with_probe_routes()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__phase79__/foreign-key")

    assert response.status_code == HTTPStatus.NOT_FOUND
    body = response.json()
    assert body["detail"] == "A referenced resource was not found"
    assert "fkey" not in response.text.lower()
    assert "insert into" not in response.text.lower()


@pytest.mark.asyncio
async def test_unhandled_errors_are_sanitized_to_500() -> None:
    """Unexpected exceptions must not leak infrastructure details."""
    app = _build_app_with_probe_routes()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__phase79__/boom")

    assert response.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
    body = response.json()
    assert body["detail"] == "Internal server error"
    assert "postgresql.civpulse-infra" not in response.text
    assert "stack trace" not in response.text.lower()


@pytest.mark.asyncio
async def test_invalid_cursor_is_normalized_to_422() -> None:
    """Malformed cursors should surface as safe 422 responses."""
    app = _build_app_with_probe_routes()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__phase79__/cursor")

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    body = response.json()
    assert body["detail"] == "Invalid cursor"
