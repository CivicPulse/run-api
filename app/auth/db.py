"""Async database adapters for fastapi-users."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyAccessTokenDatabase

from app.auth.models import AccessToken
from app.db.session import async_session_factory
from app.models.user import User


async def get_user_db() -> AsyncGenerator[SQLAlchemyUserDatabase[User, str]]:
    """Yield a user-DB adapter bound to a fresh async session."""
    async with async_session_factory() as session:
        yield SQLAlchemyUserDatabase(session, User)


async def get_access_token_db() -> AsyncGenerator[
    SQLAlchemyAccessTokenDatabase[AccessToken]
]:
    """Yield an access-token-DB adapter bound to a fresh async session."""
    async with async_session_factory() as session:
        yield SQLAlchemyAccessTokenDatabase(session, AccessToken)
