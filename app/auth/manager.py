"""UserManager for fastapi-users with string IDs."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, Request, Response
from fastapi_users import BaseUserManager, InvalidPasswordException, exceptions
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from loguru import logger

from app.auth.db import get_user_db
from app.core.config import settings
from app.core.middleware.csrf import issue_csrf_cookie
from app.models.user import User


class UserManager(BaseUserManager[User, str]):
    """User manager.

    ``fastapi-users`` ships ``UUIDIDMixin`` for the common UUID case; here the
    ``User.id`` is a free-form ``String(255)`` (UUID for native registrations,
    ZITADEL ``sub`` for legacy rows), so ``parse_id`` and ``id_to_str`` are
    overridden as near-identity.
    """

    # Secret for password-reset / email-verify token HMACs. Step 3 will wire
    # these to real settings; for now use the existing ZITADEL-independent
    # app secret if available, else a dev placeholder.
    reset_password_token_secret = "CHANGE_ME_STEP_3"  # noqa: S105
    verification_token_secret = "CHANGE_ME_STEP_3"  # noqa: S105

    def parse_id(self, value: Any) -> str:
        """Coerce any incoming id to ``str``; reject None/empty."""
        if value is None:
            raise exceptions.InvalidID()
        s = str(value)
        if not s:
            raise exceptions.InvalidID()
        return s

    async def validate_password(
        self,
        password: str,
        user: User,  # noqa: ARG002 -- required by base signature
    ) -> None:
        """Minimum-length check.

        TODO (Step 3): add zxcvbn score >= 3 per diy-auth-plan.md password
        policy. Keeping this simple in Step 1 so the stack boots cleanly.
        """
        if len(password) < 12:
            raise InvalidPasswordException(
                reason="Password must be at least 12 characters."
            )

    async def on_after_register(
        self, user: User, request: Request | None = None
    ) -> None:
        logger.info("native-auth: user registered id={} email={}", user.id, user.email)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        # Token intentionally not logged.
        logger.info(
            "native-auth: forgot-password issued id={} email={}", user.id, user.email
        )

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        logger.info("native-auth: password reset id={} email={}", user.id, user.email)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        logger.info(
            "native-auth: verify-email requested id={} email={}", user.id, user.email
        )

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:
        logger.info("native-auth: email verified id={} email={}", user.id, user.email)

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
