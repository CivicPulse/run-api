"""V1 API router -- aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

# Sub-routers will be included here as they are created:
# router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
# router.include_router(users.router, prefix="/users", tags=["users"])
