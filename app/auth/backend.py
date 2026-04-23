"""Authentication backend: cookie transport + Postgres-backed strategy."""

from __future__ import annotations

from fastapi import Depends
from fastapi_users.authentication import AuthenticationBackend, CookieTransport
from fastapi_users.authentication.strategy.db import (
    AccessTokenDatabase,
    DatabaseStrategy,
)

from app.auth.db import get_access_token_db
from app.auth.models import AccessToken
from app.core.config import settings

SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7  # 7 days

cookie_transport = CookieTransport(
    cookie_name="cp_session",
    cookie_max_age=SESSION_LIFETIME_SECONDS,
    cookie_secure=not settings.debug,
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_database_strategy(
    access_token_db: AccessTokenDatabase[AccessToken] = Depends(get_access_token_db),
) -> DatabaseStrategy:
    """Return a ``DatabaseStrategy`` reading/writing ``auth_access_tokens``."""
    return DatabaseStrategy(access_token_db, lifetime_seconds=SESSION_LIFETIME_SECONDS)


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_database_strategy,
)
