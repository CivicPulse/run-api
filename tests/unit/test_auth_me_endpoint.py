"""Unit tests for ``GET /api/v1/auth/me`` (Step 5).

Two paths:
  - Authenticated native-cookie user -> 200 with MeResponse body.
  - Unauthenticated (no cookie) -> 401.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.auth.router import get_current_native_user, get_me, native_auth_router
from app.core.security import AuthenticatedUser, CampaignRole
from app.db.session import get_db


def _build_app() -> FastAPI:
    """Minimal FastAPI app exposing just the native auth router."""
    app = FastAPI()
    app.include_router(native_auth_router, prefix="/api/v1/auth")
    return app


class TestAuthMeEndpoint:
    async def test_authenticated_returns_me_payload(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Valid cookie -> 200 with id/email/role/org details."""
        app = _build_app()

        # Fake user row returned by current_user dependency.
        fake_user = SimpleNamespace(
            id="native-uuid-1",
            email="alice@example.com",
            display_name="Alice",
            is_active=True,
            is_verified=True,
        )

        async def _fake_current_user() -> Any:
            return fake_user

        async def _fake_db() -> Any:
            return None

        async def _fake_build(_user_id: str, _db: Any) -> AuthenticatedUser | None:
            return AuthenticatedUser(
                id="native-uuid-1",
                org_id="zitadel-org-1",
                org_ids=["zitadel-org-1"],
                role=CampaignRole.ADMIN,
                email="alice@example.com",
                display_name="Alice",
            )

        app.dependency_overrides[get_current_native_user] = _fake_current_user
        app.dependency_overrides[get_db] = _fake_db

        import app.auth.router as auth_router_mod

        monkeypatch.setattr(auth_router_mod, "_authenticated_user_from_db", _fake_build)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me")

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "native-uuid-1"
        assert body["email"] == "alice@example.com"
        assert body["display_name"] == "Alice"
        assert body["org_id"] == "zitadel-org-1"
        assert body["org_ids"] == ["zitadel-org-1"]
        assert body["role"] == {"name": "admin", "permissions": []}
        assert body["is_active"] is True
        assert body["is_verified"] is True

    async def test_unauthenticated_returns_401(self) -> None:
        """No cookie -> fastapi-users current_user dep raises 401."""
        app = _build_app()

        # Directly test the endpoint function by hitting it without a cookie.
        # fastapi-users' current_user dependency will raise 401.
        # Register a stub that mimics that behavior so we don't need a DB.
        from fastapi import HTTPException, status

        async def _reject() -> Any:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized",
            )

        app.dependency_overrides[get_current_native_user] = _reject

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me")

        assert resp.status_code == 401

    async def test_me_dependency_signature(self) -> None:
        """Smoke: endpoint is wired via the native_auth_router."""
        routes = [r.path for r in native_auth_router.routes]
        assert "/me" in routes
        # get_me is exported so tests can reference the function object.
        assert callable(get_me)
