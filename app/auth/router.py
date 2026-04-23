"""Aggregated native-auth router (/auth/login, /auth/logout, /auth/register)."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi_users import FastAPIUsers

from app.auth.backend import auth_backend
from app.auth.manager import get_user_manager
from app.auth.schemas import UserCreate, UserRead
from app.models.user import User

fastapi_users: FastAPIUsers[User, str] = FastAPIUsers[User, str](
    get_user_manager,
    [auth_backend],
)

# Dependency intended for native-only routes once CSRF (Step 2) is in place.
# Requires ``is_active`` AND ``is_verified`` -- unverified users cannot be
# treated as authenticated even if they hold a valid session cookie.
get_current_native_user = fastapi_users.current_user(active=True, verified=True)

native_auth_router = APIRouter()
native_auth_router.include_router(fastapi_users.get_auth_router(auth_backend))
native_auth_router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate)
)
