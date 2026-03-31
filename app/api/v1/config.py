"""Public configuration endpoint for frontend runtime config."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.rate_limit import get_user_or_ip_key, limiter

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def get_public_config(request: Request):
    """Non-sensitive frontend configuration (no auth required)."""
    return {
        "zitadel_issuer": settings.zitadel_issuer,
        "zitadel_client_id": settings.zitadel_spa_client_id,
        "zitadel_project_id": settings.zitadel_project_id,
    }
