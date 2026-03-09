"""V1 API router -- aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import campaigns, invites, users

router = APIRouter(prefix="/api/v1")

router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
router.include_router(users.router, prefix="/me", tags=["users"])
router.include_router(invites.router, tags=["invites"])
