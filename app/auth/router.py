"""Aggregated native-auth router (/auth/login, /auth/logout, /auth/register)."""

from __future__ import annotations

from fastapi import APIRouter, Response
from fastapi_users import FastAPIUsers

from app.auth.backend import auth_backend
from app.auth.manager import get_user_manager
from app.auth.schemas import UserCreate, UserRead
from app.core.config import settings
from app.core.middleware.csrf import issue_csrf_cookie
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
# ``requires_verification=True`` means an active-but-unverified user cannot
# complete ``POST /auth/login`` -- fastapi-users returns 400 with
# ``{"detail": "LOGIN_USER_NOT_VERIFIED"}``. Combined with the auto-fire in
# ``UserManager.on_after_register``, the user journey is:
# register -> verify email -> log in.
native_auth_router.include_router(
    fastapi_users.get_auth_router(auth_backend, requires_verification=True)
)
native_auth_router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate)
)
native_auth_router.include_router(fastapi_users.get_reset_password_router())
native_auth_router.include_router(fastapi_users.get_verify_router(UserRead))


@native_auth_router.get("/csrf")
async def get_csrf_token(response: Response) -> dict[str, str]:
    """Issue a fresh ``cp_csrf`` cookie and return the token in the body.

    No auth required -- protection comes from the double-submit check
    (header value must match cookie value), not from who can read it.
    The SPA calls this at boot (or after login if the login response did
    not already set the cookie) and echoes the value in ``X-CSRF-Token``
    on mutating requests.
    """
    token = issue_csrf_cookie(response, secure=not settings.debug)
    return {"csrf_token": token}
