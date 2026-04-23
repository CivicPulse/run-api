"""Unit tests for native-auth password policy + reset/verify hooks.

These tests exercise the ``UserManager`` directly with an in-memory user
database fake rather than standing up the full FastAPI app + Postgres. That
keeps them in ``tests/unit/`` (no ``@pytest.mark.integration``) and lets them
run with just ``uv run pytest tests/unit/test_auth_native_flows.py``.

HTTP-level end-to-end tests (register -> verify -> login) are left for
integration tests that run against the compose Postgres.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi_users import InvalidPasswordException, exceptions
from fastapi_users.password import PasswordHelper

from app.auth.manager import UserManager
from app.models.user import User


class _FakeUserDatabase:
    """Minimal in-memory ``UserDatabase`` stand-in.

    Implements just the async surface the ``BaseUserManager`` exercises during
    ``create``, ``get``, ``get_by_email``, ``update``, and
    ``reset_password`` / ``verify`` flows in these tests. Not a general-purpose
    replacement -- do not reuse outside this module.
    """

    def __init__(self) -> None:
        self._by_id: dict[str, User] = {}

    async def get(self, user_id: str) -> User | None:
        return self._by_id.get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        for u in self._by_id.values():
            if u.email.lower() == email.lower():
                return u
        return None

    async def create(self, create_dict: dict[str, Any]) -> User:
        u = User()
        u.id = create_dict.get("id") or str(uuid.uuid4())
        u.email = create_dict["email"]
        u.hashed_password = create_dict.get("hashed_password")
        u.is_active = create_dict.get("is_active", True)
        u.is_superuser = create_dict.get("is_superuser", False)
        u.is_verified = create_dict.get("is_verified", False)
        u.email_verified = create_dict.get("email_verified", False)
        u.display_name = create_dict.get("display_name", "")
        self._by_id[u.id] = u
        return u

    async def update(self, user: User, update_dict: dict[str, Any]) -> User:
        for k, v in update_dict.items():
            setattr(user, k, v)
        self._by_id[user.id] = user
        return user

    async def delete(self, user: User) -> None:  # pragma: no cover -- unused
        self._by_id.pop(user.id, None)


def _new_manager() -> tuple[UserManager, _FakeUserDatabase]:
    fake = _FakeUserDatabase()
    manager = UserManager(fake)  # type: ignore[arg-type]
    return manager, fake


def _make_user(email: str = "alice@example.com", display_name: str = "Alice") -> User:
    u = User()
    u.id = str(uuid.uuid4())
    u.email = email
    u.display_name = display_name
    u.hashed_password = None
    u.is_active = True
    u.is_superuser = False
    u.is_verified = False
    u.email_verified = False
    return u


class TestPasswordPolicy:
    """`validate_password` enforces length + zxcvbn score >= 3."""

    async def test_short_password_rejected(self) -> None:
        mgr, _ = _new_manager()
        with pytest.raises(InvalidPasswordException) as exc:
            await mgr.validate_password("short", _make_user())
        assert "12 characters" in exc.value.reason

    async def test_long_but_weak_password_rejected(self) -> None:
        """A 12+ char password with a low zxcvbn score is rejected.

        ``Password1234!`` is long enough to pass the length gate but
        well-known enough that zxcvbn scores it below 3.
        """
        mgr, _ = _new_manager()
        with pytest.raises(InvalidPasswordException) as exc:
            await mgr.validate_password("Password1234!", _make_user())
        assert "weak" in exc.value.reason.lower()

    async def test_password_using_user_email_rejected(self) -> None:
        """zxcvbn should catch passwords derived from the user's email."""
        mgr, _ = _new_manager()
        user = _make_user(email="alice@example.com", display_name="Alice")
        # Long enough, but built entirely from the user's own name.
        with pytest.raises(InvalidPasswordException):
            await mgr.validate_password("alicealicealice", user)

    async def test_strong_password_accepted(self) -> None:
        mgr, _ = _new_manager()
        # Classic xkcd-style passphrase; long + high entropy.
        await mgr.validate_password(
            "correct-horse-battery-staple-42",
            _make_user(),
        )


class TestSecretsWiring:
    """Reset + verify token secrets flow through from settings."""

    def test_secrets_are_not_placeholders(self) -> None:
        mgr, _ = _new_manager()
        assert mgr.reset_password_token_secret != "CHANGE_ME_STEP_3"
        assert mgr.verification_token_secret != "CHANGE_ME_STEP_3"
        assert mgr.reset_password_token_secret
        assert mgr.verification_token_secret

    def test_lifetimes_match_settings(self) -> None:
        from app.core.config import settings

        mgr, _ = _new_manager()
        assert (
            mgr.reset_password_token_lifetime_seconds
            == settings.auth_reset_password_token_lifetime_seconds
        )
        assert (
            mgr.verification_token_lifetime_seconds
            == settings.auth_verification_token_lifetime_seconds
        )


class _NoopSession:
    """In-memory no-op stand-in for ``AsyncSession``."""

    async def __aenter__(self) -> _NoopSession:
        return self

    async def __aexit__(self, *a: Any) -> None:
        return None

    async def execute(self, *a: Any, **k: Any) -> None:
        return None

    async def merge(self, obj: Any) -> Any:
        return obj

    async def commit(self) -> None:
        return None


@pytest.fixture
def patched_session_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch ``app.auth.manager.async_session_factory`` to return a noop.

    The real hooks do DB writes to invalidate sessions / sync
    ``email_verified``. We don't want those touching Postgres in unit tests.
    """
    import app.auth.manager as mgr_mod

    monkeypatch.setattr(
        mgr_mod,
        "async_session_factory",
        lambda: _NoopSession(),
    )


class _TokenCapturingManager(UserManager):
    """UserManager subclass that captures issued tokens for later consumption.

    fastapi-users never returns reset/verify tokens from its public API --
    they are only passed into the hook functions and emailed out. For unit
    tests we subclass and record them.
    """

    def __init__(self, *a: Any, **k: Any) -> None:
        super().__init__(*a, **k)
        self.last_reset_token: str | None = None
        self.last_verify_token: str | None = None

    async def on_after_forgot_password(
        self, user: User, token: str, request: Any = None
    ) -> None:
        self.last_reset_token = token
        await super().on_after_forgot_password(user, token, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Any = None
    ) -> None:
        self.last_verify_token = token
        await super().on_after_request_verify(user, token, request)


def _capturing_manager() -> tuple[_TokenCapturingManager, _FakeUserDatabase]:
    fake = _FakeUserDatabase()
    mgr = _TokenCapturingManager(fake)  # type: ignore[arg-type]
    return mgr, fake


class TestVerifyAndResetFlows:
    """End-to-end token roundtrips using the in-memory fake."""

    async def test_verify_token_flips_email_verified(
        self, patched_session_factory: None
    ) -> None:
        mgr, fake = _capturing_manager()
        helper = PasswordHelper()
        user = await fake.create(
            {
                "email": "verify@example.com",
                "hashed_password": helper.hash("correct-horse-battery-staple-42"),
                "display_name": "Verify Tester",
                "is_active": True,
                "is_verified": False,
                "email_verified": False,
            }
        )
        await mgr.request_verify(user)
        assert mgr.last_verify_token is not None
        verified = await mgr.verify(mgr.last_verify_token)
        assert verified.is_verified is True
        assert verified.email_verified is True

    async def test_forgot_and_reset_password_updates_hash(
        self, patched_session_factory: None
    ) -> None:
        mgr, fake = _capturing_manager()
        helper = PasswordHelper()
        old_hash = helper.hash("correct-horse-battery-staple-42")
        user = await fake.create(
            {
                "email": "reset@example.com",
                "hashed_password": old_hash,
                "display_name": "Reset Tester",
                "is_active": True,
                "is_verified": True,
                "email_verified": True,
            }
        )
        await mgr.forgot_password(user)
        assert mgr.last_reset_token is not None
        updated = await mgr.reset_password(
            mgr.last_reset_token, "new-correct-horse-battery-staple-99"
        )
        assert updated.hashed_password != old_hash
        ok_old, _ = helper.verify_and_update(
            "correct-horse-battery-staple-42", updated.hashed_password
        )
        assert ok_old is False
        ok_new, _ = helper.verify_and_update(
            "new-correct-horse-battery-staple-99", updated.hashed_password
        )
        assert ok_new is True

    async def test_reset_rejects_weak_new_password(
        self, patched_session_factory: None
    ) -> None:
        mgr, fake = _capturing_manager()
        helper = PasswordHelper()
        user = await fake.create(
            {
                "email": "weakreset@example.com",
                "hashed_password": helper.hash("correct-horse-battery-staple-42"),
                "display_name": "Weak Reset Tester",
                "is_active": True,
                "is_verified": True,
                "email_verified": True,
            }
        )
        await mgr.forgot_password(user)
        assert mgr.last_reset_token is not None
        with pytest.raises(InvalidPasswordException):
            await mgr.reset_password(mgr.last_reset_token, "shortpw")

    async def test_verify_with_bogus_token_raises(self) -> None:
        mgr, _ = _new_manager()
        with pytest.raises(exceptions.InvalidVerifyToken):
            await mgr.verify("not-a-real-token")


class TestRegistrationTriggersVerify:
    """``on_after_register`` should auto-fire ``request_verify``."""

    async def test_register_fires_verify_email(
        self, patched_session_factory: None
    ) -> None:
        mgr, fake = _capturing_manager()
        helper = PasswordHelper()
        user = await fake.create(
            {
                "email": "newuser@example.com",
                "hashed_password": helper.hash("correct-horse-battery-staple-42"),
                "display_name": "New User",
                "is_active": True,
                "is_verified": False,
                "email_verified": False,
            }
        )
        await mgr.on_after_register(user)
        assert mgr.last_verify_token is not None
