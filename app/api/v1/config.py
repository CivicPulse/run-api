"""Public configuration endpoint for frontend runtime config."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
async def get_public_config():
    """Non-sensitive frontend configuration (no auth required)."""
    return {
        "zitadel_issuer": settings.zitadel_issuer,
        "zitadel_client_id": settings.zitadel_spa_client_id,
        "zitadel_project_id": settings.zitadel_project_id,
    }
