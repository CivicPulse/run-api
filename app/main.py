"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pydantic import SecretStr
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.errors import init_error_handlers
from app.core.middleware.csrf import CSRFMiddleware
from app.core.middleware.request_logging import StructlogMiddleware
from app.core.middleware.security_headers import SecurityHeadersMiddleware
from app.core.rate_limit import limiter
from app.core.sentry import init_sentry

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application lifespan handler -- initializes shared resources."""
    # Import here to avoid circular imports at module level
    import secrets

    from app.core.errors import ZitadelUnavailableError
    from app.core.security import JWKSManager
    from app.services.storage import StorageService
    from app.services.zitadel import ZitadelService
    from app.tasks.procrastinate_app import procrastinate_app

    logger.info("Starting {}", settings.app_name)

    # Native-auth token secrets: fail fast in non-dev, generate per-process
    # defaults with a warning in dev. These secrets HMAC the reset-password and
    # verify-email tokens; rotating them invalidates all outstanding tokens.
    reset_secret = settings.auth_reset_password_token_secret.get_secret_value()
    verify_secret = settings.auth_verification_token_secret.get_secret_value()
    if not reset_secret or not verify_secret:
        if settings.environment != "development":
            raise RuntimeError(
                "Native-auth secrets not configured: "
                "set AUTH_RESET_PASSWORD_TOKEN_SECRET and "
                "AUTH_VERIFICATION_TOKEN_SECRET"
            )
        if not reset_secret:
            generated = secrets.token_urlsafe(32)
            settings.auth_reset_password_token_secret = SecretStr(generated)
            logger.warning(
                "native-auth: AUTH_RESET_PASSWORD_TOKEN_SECRET empty; "
                "generated ephemeral dev secret (reset links will break on "
                "API restart)"
            )
        if not verify_secret:
            generated = secrets.token_urlsafe(32)
            settings.auth_verification_token_secret = SecretStr(generated)
            logger.warning(
                "native-auth: AUTH_VERIFICATION_TOKEN_SECRET empty; "
                "generated ephemeral dev secret (verify links will break on "
                "API restart)"
            )

    # Auth
    app.state.jwks_manager = JWKSManager(
        issuer=settings.zitadel_issuer,
        base_url=settings.zitadel_base_url,
    )

    # ZITADEL service account (fail-fast validation)
    if (
        not settings.zitadel_service_client_id
        or not settings.zitadel_service_client_secret
    ):
        raise RuntimeError(
            "ZITADEL service account not configured: "
            "set ZITADEL_SERVICE_CLIENT_ID and ZITADEL_SERVICE_CLIENT_SECRET"
        )

    zitadel_service = ZitadelService(
        issuer=settings.zitadel_issuer,
        client_id=settings.zitadel_service_client_id,
        client_secret=settings.zitadel_service_client_secret,
        base_url=settings.zitadel_base_url,
    )
    try:
        await zitadel_service._get_token()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"ZITADEL credentials invalid: {exc}") from exc
    except ZitadelUnavailableError as exc:
        raise RuntimeError(f"ZITADEL unreachable: {exc}") from exc
    app.state.zitadel_service = zitadel_service
    logger.info("ZitadelService initialized successfully")

    # Object storage
    storage_service = StorageService()
    await storage_service.ensure_bucket()
    app.state.storage_service = storage_service

    # Procrastinate task queue (replaces TaskIQ broker per D-07)
    async with procrastinate_app.open_async():
        app.state.procrastinate_app = procrastinate_app
        yield

    logger.info("Shutting down {}", settings.app_name)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    init_sentry()

    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CSRFMiddleware,
        exempt_paths={
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/reset-password",
            "/api/v1/auth/request-verify-token",
            "/api/v1/auth/verify",
            "/api/v1/auth/csrf",
        },
        exempt_prefixes=(
            "/healthz",
            "/api/health",
            "/static",
            "/docs",
            "/openapi.json",
            "/redoc",
        ),
    )
    app.add_middleware(StructlogMiddleware)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    init_error_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)

    # Native auth (fastapi-users) -- Step 1 of the ZITADEL -> DIY pivot.
    # Mounted alongside the existing ZITADEL stack; nothing consumes it yet.
    from app.auth.router import native_auth_router

    app.include_router(native_auth_router, prefix="/api/v1/auth", tags=["auth-native"])

    # Serve built frontend in production (static/ exists only in Docker image)
    if (STATIC_DIR / "assets").is_dir():
        app.mount(
            "/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets"
        )

        @app.get("/{path:path}")
        async def spa_fallback(path: str) -> FileResponse:
            """Return index.html for client-side routing; 404 for API paths."""
            if path.startswith("api/") or path.startswith("health/"):
                raise HTTPException(status_code=404, detail="Not found")
            return FileResponse(STATIC_DIR / "index.html")

    return app
