"""Unit tests for ``get_current_user_dual`` (Step 4).

Two paths are exercised:
  - ``cp_session`` cookie present + valid -> native-DB-backed user
  - Cookie missing / invalid -> falls back to the ZITADEL JWT dependency
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException, Request

from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    get_current_user_dual,
)
from app.models.user import User


class _FakeSession:
    """In-memory session stand-in for the dual-auth code path."""

    def __init__(
        self,
        *,
        access_token_row: Any | None = None,
        user_row: User | None = None,
        org_member_rows: list[tuple[str, str]] | None = None,
    ) -> None:
        self._access = access_token_row
        self._user = user_row
        self._org_rows = org_member_rows or []
        self._scalar_calls = 0

    async def __aenter__(self) -> _FakeSession:
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        return None

    async def scalar(self, _stmt: Any) -> Any:
        # Order of scalar() calls inside get_current_user_dual +
        # _authenticated_user_from_db:
        #   1. AccessToken lookup
        #   2. User lookup (inside dual handler)
        #   3. User lookup again (inside _authenticated_user_from_db)
        self._scalar_calls += 1
        if self._scalar_calls == 1:
            return self._access
        return self._user

    async def execute(self, _stmt: Any) -> Any:
        # OrganizationMember + Organization join -> list of (role, zitadel_id)
        result = SimpleNamespace()
        result.all = lambda: list(self._org_rows)
        return result


def _make_request(cookie: str | None) -> Request:
    """Build a minimal Starlette Request with the given cp_session cookie."""
    scope: dict[str, Any] = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "query_string": b"",
    }
    if cookie is not None:
        scope["headers"] = [(b"cookie", f"cp_session={cookie}".encode())]
    return Request(scope)


@pytest.fixture
def _patch_session(monkeypatch: pytest.MonkeyPatch):
    """Return a helper that installs a given ``_FakeSession`` globally."""

    def _install(fake: _FakeSession) -> None:
        import app.core.security as sec_mod

        # dual-auth imports async_session_factory lazily; monkeypatch the
        # symbol at its module home so ``from ... import async_session_factory``
        # (if any caller did it) also resolves to our fake.
        import app.db.session as session_mod

        monkeypatch.setattr(
            session_mod,
            "async_session_factory",
            lambda: fake,
        )
        monkeypatch.setattr(
            sec_mod,
            "get_current_user",
            _jwt_should_not_run,
            raising=True,
        )

    return _install


async def _jwt_should_not_run(*_a: Any, **_k: Any) -> AuthenticatedUser:
    raise AssertionError("JWT path must not run when cookie is valid")


class TestNativeCookiePath:
    async def test_valid_cookie_returns_db_backed_user(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = User()
        user.id = "native-uuid"
        user.email = "alice@example.com"
        user.display_name = "Alice"
        user.is_active = True
        user.is_verified = True
        user.hashed_password = "hash"  # noqa: S105

        access = SimpleNamespace(user_id="native-uuid", token="cookie-token")  # noqa: S106
        fake = _FakeSession(
            access_token_row=access,
            user_row=user,
            org_member_rows=[("org_admin", "zitadel-org-id-1")],
        )

        import app.db.session as session_mod

        monkeypatch.setattr(session_mod, "async_session_factory", lambda: fake)

        # Ensure JWT path does not run.
        import app.core.security as sec_mod

        monkeypatch.setattr(sec_mod, "get_current_user", _jwt_should_not_run)

        req = _make_request(cookie="cookie-token")
        result = await get_current_user_dual(req, credentials=None)

        assert isinstance(result, AuthenticatedUser)
        assert result.id == "native-uuid"
        assert result.email == "alice@example.com"
        assert result.display_name == "Alice"
        assert result.org_id == "zitadel-org-id-1"
        assert result.org_ids == ["zitadel-org-id-1"]
        assert result.role == CampaignRole.ADMIN  # org_admin -> ADMIN

    async def test_inactive_user_falls_through(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Even with a valid cookie, inactive/unverified users skip native."""
        user = User()
        user.id = "native-uuid"
        user.email = "alice@example.com"
        user.display_name = "Alice"
        user.is_active = False  # <-- fails the active+verified gate
        user.is_verified = True
        user.hashed_password = "hash"  # noqa: S105

        access = SimpleNamespace(user_id="native-uuid", token="cookie-token")  # noqa: S106
        fake = _FakeSession(access_token_row=access, user_row=user)

        import app.core.security as sec_mod
        import app.db.session as session_mod

        monkeypatch.setattr(session_mod, "async_session_factory", lambda: fake)

        # JWT fallback must run this time -- with no credentials it raises 401.
        called = {"n": 0}

        async def _jwt(*_a: Any, **_k: Any) -> AuthenticatedUser:
            called["n"] += 1
            raise HTTPException(status_code=401, detail="jwt-called")

        monkeypatch.setattr(sec_mod, "get_current_user", _jwt)

        req = _make_request(cookie="cookie-token")
        # credentials=None short-circuits to 401 "Not authenticated" *before*
        # jwt runs, so we assert that behavior directly.
        with pytest.raises(HTTPException) as exc:
            await get_current_user_dual(req, credentials=None)
        assert exc.value.status_code == 401


class TestZitadelFallback:
    async def test_no_cookie_uses_jwt_dependency(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.core.security as sec_mod

        sentinel = AuthenticatedUser(
            id="zitadel-sub",
            org_id="org-z",
            org_ids=["org-z"],
            role=CampaignRole.MANAGER,
            email="z@example.com",
            display_name="Zed",
        )

        async def _jwt(_req: Request, _creds: Any) -> AuthenticatedUser:
            return sentinel

        monkeypatch.setattr(sec_mod, "get_current_user", _jwt)

        # Build a fake HTTPBearer credential object.
        creds = SimpleNamespace(credentials="fake.jwt.token")

        req = _make_request(cookie=None)
        result = await get_current_user_dual(req, credentials=creds)  # type: ignore[arg-type]
        assert result is sentinel

    async def test_invalid_cookie_falls_back_to_jwt(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A cp_session cookie that matches no token row falls through."""
        fake = _FakeSession(access_token_row=None)

        import app.core.security as sec_mod
        import app.db.session as session_mod

        monkeypatch.setattr(session_mod, "async_session_factory", lambda: fake)

        sentinel = AuthenticatedUser(
            id="zitadel-sub-2",
            org_id="org-z",
            org_ids=["org-z"],
            role=CampaignRole.VIEWER,
            email="v@example.com",
            display_name="V",
        )

        async def _jwt(_req: Request, _creds: Any) -> AuthenticatedUser:
            return sentinel

        monkeypatch.setattr(sec_mod, "get_current_user", _jwt)

        creds = SimpleNamespace(credentials="fake.jwt.token")
        req = _make_request(cookie="mystery-token")
        result = await get_current_user_dual(req, credentials=creds)  # type: ignore[arg-type]
        assert result is sentinel
