"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.errors import init_error_handlers

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application lifespan handler -- initializes shared resources."""
    # Import here to avoid circular imports at module level
    from app.core.security import JWKSManager
    from app.services.storage import StorageService
    from app.tasks.broker import broker

    from app.core.errors import ZitadelUnavailableError
    from app.services.zitadel import ZitadelService

    logger.info("Starting {}", settings.app_name)

    # Auth
    app.state.jwks_manager = JWKSManager(issuer=settings.zitadel_issuer)

    # ZITADEL service account (fail-fast validation)
    if not settings.zitadel_service_client_id or not settings.zitadel_service_client_secret:
        raise RuntimeError(
            "ZITADEL service account not configured: "
            "set ZITADEL_SERVICE_CLIENT_ID and ZITADEL_SERVICE_CLIENT_SECRET"
        )

    zitadel_service = ZitadelService(
        issuer=settings.zitadel_issuer,
        client_id=settings.zitadel_service_client_id,
        client_secret=settings.zitadel_service_client_secret,
    )
    try:
        await zitadel_service._get_token()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"ZITADEL credentials invalid: {exc}"
        ) from exc
    except ZitadelUnavailableError as exc:
        raise RuntimeError(
            f"ZITADEL unreachable: {exc}"
        ) from exc
    app.state.zitadel_service = zitadel_service
    logger.info("ZitadelService initialized successfully")

    # Object storage
    storage_service = StorageService()
    await storage_service.ensure_bucket()
    app.state.storage_service = storage_service

    # Background task broker
    await broker.startup()
    app.state.broker = broker

    yield

    # Shutdown
    await broker.shutdown()
    logger.info("Shutting down {}", settings.app_name)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    init_error_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)

    return app
