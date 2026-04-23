"""Aggregated native-auth router (/auth/login, /auth/logout, /auth/register)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi_users import FastAPIUsers
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.backend import auth_backend
from app.auth.manager import get_user_manager
from app.auth.schemas import UserCreate, UserRead
from app.core.config import settings
from app.core.middleware.csrf import issue_csrf_cookie
from app.core.security import _authenticated_user_from_db
from app.db.session import get_db
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


class RoleInfo(BaseModel):
    name: str
    permissions: list[str] = []


class MeResponse(BaseModel):
    id: str
    email: str
    display_name: str
    org_id: str | None
    org_ids: list[str]
    role: RoleInfo | None
    is_active: bool
    is_verified: bool


@native_auth_router.get("/me", response_model=MeResponse)
async def get_me(
    user: User = Depends(get_current_native_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """Return the current cookie-authenticated user with org/role context.

    Uses ``_authenticated_user_from_db`` to rebuild the legacy
    ``AuthenticatedUser`` shape from ``OrganizationMember`` rows so the SPA
    gets the same role/org info it previously decoded from ZITADEL JWTs.
    """
    built = await _authenticated_user_from_db(user.id, db)
    if built is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    role = (
        RoleInfo(name=built.role.name.lower(), permissions=[])
        if built.role is not None
        else None
    )
    return MeResponse(
        id=built.id,
        email=built.email or user.email,
        display_name=built.display_name or user.display_name or user.email,
        org_id=built.org_id or None,
        org_ids=built.org_ids,
        role=role,
        is_active=user.is_active,
        is_verified=user.is_verified,
    )


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
