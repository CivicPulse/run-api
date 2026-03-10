"""Health check endpoints -- no auth required.

Provides liveness and readiness probes for container orchestration.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.db.session import get_db

router = APIRouter(prefix="/health", tags=["health"])


def _build_info() -> dict[str, str]:
    """Return build metadata from environment variables."""
    return {
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
        "build_timestamp": os.environ.get("BUILD_TIMESTAMP", "unknown"),
    }


@router.get("/live")
async def liveness() -> dict:
    """Liveness probe -- always succeeds if the process is running."""
    return {"status": "ok", **_build_info()}


@router.get("/ready")
async def readiness(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Readiness probe -- checks database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return JSONResponse(
            content={
                "status": "ok",
                "database": "connected",
                **_build_info(),
            },
        )
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected"},
        )
