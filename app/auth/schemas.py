"""Pydantic schemas exposed by fastapi-users routers."""

from __future__ import annotations

from fastapi_users import schemas


class UserRead(schemas.BaseUser[str]):
    """Shape returned by ``/auth/me`` and register."""

    display_name: str


class UserCreate(schemas.BaseUserCreate):
    """Shape accepted by ``POST /auth/register``."""

    display_name: str


class UserUpdate(schemas.BaseUserUpdate):
    """Shape accepted by ``PATCH /users/me`` (not mounted in Step 1)."""

    display_name: str | None = None
