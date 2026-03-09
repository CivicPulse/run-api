"""Health check endpoint -- no auth required."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """Return application health status."""
    return {"status": "ok"}
