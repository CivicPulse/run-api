"""UserManager for fastapi-users with string IDs."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, Request, Response
from fastapi_users import BaseUserManager, InvalidPasswordException, exceptions
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from loguru import logger
from sqlalchemy import delete
from zxcvbn import zxcvbn

from app.auth.db import get_user_db
from app.core.config import settings
from app.core.middleware.csrf import issue_csrf_cookie
from app.db.session import async_session_factory
from app.models.user import User
from app.services.auth_email import (
    send_password_reset_email,
    send_verify_email,
)


def _resolve_reset_secret() -> str:
    """Resolve the password-reset token secret from settings.

    ``app.main`` lifespan is responsible for generating a dev-only default when
    the raw setting is empty; here we just read whatever is configured. If the
    secret is still empty at module-import time (e.g. tests that bypass the
    lifespan), fall back to a fixed dev string so the UserManager can boot -
    fastapi-users will refuse to construct tokens without *some* value.
    """
    value = settings.auth_reset_password_token_secret.get_secret_value()
    return value or "dev-reset-secret-change-me"  # noqa: S105


def _resolve_verify_secret() -> str:
    """Resolve the email-verification token secret from settings."""
    value = settings.auth_verification_token_secret.get_secret_value()
    return value or "dev-verify-secret-change-me"  # noqa: S105


class UserManager(BaseUserManager[User, str]):
    """User manager.

    ``fastapi-users`` ships ``UUIDIDMixin`` for the common UUID case; here the
    ``User.id`` is a free-form ``String(255)`` (UUID for native registrations,
    ZITADEL ``sub`` for legacy rows), so ``parse_id`` and ``id_to_str`` are
    overridden as near-identity.
    """

    reset_password_token_secret = _resolve_reset_secret()
    reset_password_token_lifetime_seconds = (
        settings.auth_reset_password_token_lifetime_seconds
    )
    verification_token_secret = _resolve_verify_secret()
    verification_token_lifetime_seconds = (
        settings.auth_verification_token_lifetime_seconds
    )

    def parse_id(self, value: Any) -> str:
        """Coerce any incoming id to ``str``; reject None/empty."""
        if value is None:
            raise exceptions.InvalidID()
        s = str(value)
        if not s:
            raise exceptions.InvalidID()
        return s

    async def authenticate(
        self,
        credentials: Any,
    ) -> User | None:
        """Override to gracefully reject users with no native password set.

        Legacy ZITADEL rows have ``hashed_password = NULL`` until the user
        claims their account via the password-reset flow. ``pwdlib`` would
        otherwise crash with ``TypeError: hash must be str or bytes``.
        Return ``None`` so fastapi-users emits the standard
        ``LOGIN_BAD_CREDENTIALS`` response.
        """
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Run the hasher anyway so timing leaks no user-existence signal.
            self.password_helper.hash(credentials.password)
            return None
        if not user.hashed_password:
            return None
        return await super().authenticate(credentials)

    async def forgot_password(
        self,
        user: User,
        request: Request | None = None,
    ) -> None:
        """Override to seed a random unusable hash for NULL-hash users.

        fastapi-users includes a ``password_fgpt`` in the reset token so a
        password change invalidates outstanding tokens. The fingerprint is
        ``hash(user.hashed_password)`` — which crashes when the hash is NULL
        (legacy ZITADEL rows that never set a native password). Before
        delegating, seed an unusable random hash so the fingerprint works and
        subsequent ``reset_password`` calls correctly consume the token.
        """
        if not user.hashed_password:
            import secrets as _secrets

            from sqlalchemy import update

            placeholder = self.password_helper.hash(_secrets.token_urlsafe(32))
            user.hashed_password = placeholder
            async with async_session_factory() as session:
                await session.execute(
                    update(User)
                    .where(User.id == user.id)
                    .values(hashed_password=placeholder)
                )
                await session.commit()
        await super().forgot_password(user, request)

    async def validate_password(
        self,
        password: str,
        user: User,
    ) -> None:
        """Enforce min-length + zxcvbn strength.

        zxcvbn's ``user_inputs`` catches "Name is Alice -> Alice2026!" style
        passwords that look strong in isolation but are trivially guessable
        given knowledge of the user being registered.
        """
        if len(password) < 12:
            raise InvalidPasswordException(
                reason="Password must be at least 12 characters."
            )
        user_inputs: list[str] = []
        email = getattr(user, "email", None)
        if email:
            user_inputs.append(str(email))
        display_name = getattr(user, "display_name", None)
        if display_name:
            user_inputs.append(str(display_name))
        result = zxcvbn(password, user_inputs=user_inputs or None)
        if result["score"] < 3:
            warning = (result.get("feedback") or {}).get(
                "warning"
            ) or "Password is too weak or too easily guessable."
            raise InvalidPasswordException(reason=f"Weak password: {warning}")

    async def on_after_register(
        self, user: User, request: Request | None = None
    ) -> None:
        logger.info("native-auth: user registered id={} email={}", user.id, user.email)
        # Fire the verification flow immediately so the user never has to
        # separately ask for a verify email. ``request_verify`` will call
        # ``on_after_request_verify`` which handles email dispatch.
        try:
            await self.request_verify(user, request)
        except exceptions.UserInactive:
            logger.warning(
                "native-auth: cannot send verify email -- user inactive id={}", user.id
            )
        except exceptions.UserAlreadyVerified:  # pragma: no cover -- defensive
            logger.debug("native-auth: user already verified id={}", user.id)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        """Send a password-reset email (or log the link in dev)."""
        logger.info(
            "native-auth: forgot-password issued id={} email={}", user.id, user.email
        )
        reset_url = f"{settings.app_base_url.rstrip('/')}/reset-password?token={token}"
        try:
            await send_password_reset_email(
                to_email=user.email,
                display_name=user.display_name,
                reset_url=reset_url,
            )
        except Exception as exc:  # noqa: BLE001 -- never block the flow on email
            logger.error(
                "native-auth: failed to send password-reset email id={} err={}",
                user.id,
                exc,
            )

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        """Log reset and invalidate all existing session tokens for this user.

        Also promotes the user to ``is_verified=True`` / ``email_verified=True``
        if they weren't already — completing a reset proves email ownership,
        which is the same thing email-verification proves. This is what lets
        legacy ZITADEL users (imported with ``email_verified=NULL/false``) log
        in after claiming their native password.
        """
        logger.info("native-auth: password reset id={} email={}", user.id, user.email)
        try:
            from app.auth.models import AccessToken  # local import to avoid cycles
            from sqlalchemy import update

            async with async_session_factory() as session:
                # Good security hygiene: drop every outstanding session token.
                await session.execute(
                    delete(AccessToken).where(AccessToken.user_id == user.id)
                )
                # Promote to verified — completing the reset proves email
                # ownership. No-op if the flags are already true.
                await session.execute(
                    update(User)
                    .where(User.id == user.id)
                    .values(is_verified=True, email_verified=True)
                )
                await session.commit()
        except Exception as exc:  # noqa: BLE001 -- log and continue
            logger.error(
                "native-auth: failed to finalize reset id={} err={}",
                user.id,
                exc,
            )

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        """Send a verify-email (or log the link in dev)."""
        logger.info(
            "native-auth: verify-email requested id={} email={}", user.id, user.email
        )
        verify_url = f"{settings.app_base_url.rstrip('/')}/verify-email?token={token}"
        try:
            await send_verify_email(
                to_email=user.email,
                display_name=user.display_name,
                verify_url=verify_url,
            )
        except Exception as exc:  # noqa: BLE001 -- never block the flow on email
            logger.error(
                "native-auth: failed to send verify email id={} err={}",
                user.id,
                exc,
            )

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:
        """Mirror ``is_verified`` onto the canonical ``email_verified`` column.

        The fastapi-users base flips ``is_verified`` on the user it hands us,
        but our application code (org/member lookups, admin dashboards) reads
        ``email_verified`` directly. Keep the two in sync so downstream code
        does not need to know about fastapi-users' naming.
        """
        logger.info("native-auth: email verified id={} email={}", user.id, user.email)
        if user.email_verified:
            return
        user.email_verified = True
        try:
            async with async_session_factory() as session:
                merged = await session.merge(user)
                merged.email_verified = True
                await session.commit()
        except Exception as exc:  # noqa: BLE001 -- log, don't fail verify
            logger.error(
                "native-auth: failed to sync email_verified id={} err={}",
                user.id,
                exc,
            )

    async def on_after_login(
        self,
        user: User,
        request: Request | None = None,
        response: Response | None = None,
    ) -> None:
        """Attach a ``cp_csrf`` cookie to the successful-login response.

        Double-submit CSRF protection (see ``app.core.middleware.csrf``) needs
        a token the SPA can read from JS. Issuing it here means the very first
        response that carries the ``cp_session`` cookie also carries the CSRF
        cookie, so the SPA can make mutating calls immediately without a
        separate ``GET /auth/csrf`` round trip.
        """
        logger.info("native-auth: user logged in id={} email={}", user.id, user.email)
        if response is not None:
            issue_csrf_cookie(response, secure=not settings.debug)


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase[User, str] = Depends(get_user_db),
) -> AsyncGenerator[UserManager]:
    """FastAPI dependency that yields a ``UserManager``."""
    yield UserManager(user_db)
