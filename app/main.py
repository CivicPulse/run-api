"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
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

    logger.info("Starting {}", settings.app_name)

    # Auth
    app.state.jwks_manager = JWKSManager(issuer=settings.zitadel_issuer)

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

    init_error_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)

    return app
