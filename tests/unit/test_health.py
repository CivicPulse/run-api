"""Unit tests for health check endpoints (liveness + readiness)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI

from app.api.health import router
from app.db.session import get_db


def _create_test_app() -> FastAPI:
    """Create a minimal FastAPI app with just the health router (no lifespan)."""
    app = FastAPI()
    app.include_router(router)
    return app


# ---------------------------------------------------------------------------
# Liveness
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_liveness_returns_200_with_expected_fields():
    app = _create_test_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/live")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "git_sha" in body
    assert "build_timestamp" in body


@pytest.mark.anyio
async def test_liveness_reads_env_vars(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "abc123")
    monkeypatch.setenv("BUILD_TIMESTAMP", "2026-01-01T00:00:00Z")
    app = _create_test_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/live")
    body = resp.json()
    assert body["git_sha"] == "abc123"
    assert body["build_timestamp"] == "2026-01-01T00:00:00Z"


@pytest.mark.anyio
async def test_liveness_defaults_to_unknown(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    monkeypatch.delenv("BUILD_TIMESTAMP", raising=False)
    app = _create_test_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/live")
    body = resp.json()
    assert body["git_sha"] == "unknown"
    assert body["build_timestamp"] == "unknown"


# ---------------------------------------------------------------------------
# Readiness
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_readiness_returns_200_when_db_connected(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    monkeypatch.delenv("BUILD_TIMESTAMP", raising=False)

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=MagicMock())

    async def _mock_get_db():
        yield mock_session

    app = _create_test_app()
    app.dependency_overrides[get_db] = _mock_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert "git_sha" in body
    assert "build_timestamp" in body


@pytest.mark.anyio
async def test_readiness_returns_503_when_db_fails(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    monkeypatch.delenv("BUILD_TIMESTAMP", raising=False)

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=Exception("connection refused"))

    async def _mock_get_db():
        yield mock_session

    app = _create_test_app()
    app.dependency_overrides[get_db] = _mock_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["database"] == "disconnected"
