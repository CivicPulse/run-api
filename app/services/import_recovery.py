"""Helpers for import orphan detection, locking, and recovery scans."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta
from inspect import isawaitable

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.time import utcnow
from app.db.session import engine
from app.models.import_job import ImportJob, ImportStatus


@dataclass(slots=True)
class OrphanedImportCandidate:
    """Cross-campaign stale import discovered during worker startup."""

    import_job_id: str
    campaign_id: str
    last_progress_at: object
    last_committed_row: int | None
    source_exhausted_at: object
    orphaned_reason: str


def advisory_lock_key(import_job_id: uuid.UUID) -> int:
    """Return a stable bigint advisory-lock key for an import job UUID."""
    return (import_job_id.int % ((1 << 63) - 1)) or 1


async def try_claim_import_lock(
    session: AsyncSession, import_job_id: uuid.UUID
) -> bool:
    """Claim the session-level advisory lock for an import job."""
    result = await session.execute(
        text("SELECT pg_try_advisory_lock(:lock_key)"),
        {"lock_key": advisory_lock_key(import_job_id)},
    )
    scalar = result.scalar()
    if isawaitable(scalar):
        scalar = await scalar
    return bool(scalar)


async def release_import_lock(session: AsyncSession, import_job_id: uuid.UUID) -> None:
    """Release the session-level advisory lock for an import job."""
    await session.execute(
        text("SELECT pg_advisory_unlock(:lock_key)"),
        {"lock_key": advisory_lock_key(import_job_id)},
    )


def is_import_stale(
    job: ImportJob,
    *,
    now=None,
    threshold_minutes: int | None = None,
) -> bool:
    """Return whether a processing import has exceeded the staleness threshold."""
    if job.status != ImportStatus.PROCESSING or job.last_progress_at is None:
        return False

    current_time = now or utcnow()
    threshold = threshold_minutes or settings.import_orphan_threshold_minutes
    cutoff = current_time - timedelta(minutes=threshold)
    return job.last_progress_at < cutoff


async def scan_for_orphaned_imports() -> list[OrphanedImportCandidate]:
    """Find stale processing imports across campaigns and persist detection metadata."""
    now = utcnow()
    cutoff = now - timedelta(minutes=settings.import_orphan_threshold_minutes)
    stmt = text(
        """
        SELECT
            id,
            campaign_id,
            last_progress_at,
            last_committed_row,
            source_exhausted_at
        FROM import_jobs
        WHERE status = :processing
          AND last_progress_at IS NOT NULL
          AND last_progress_at < :cutoff
        ORDER BY last_progress_at ASC
        """
    )
    candidates: list[OrphanedImportCandidate] = []

    async with engine.begin() as conn:
        try:
            await conn.execute(text("SET LOCAL row_security = off"))
        except Exception:
            logger.exception("Failed to disable row security for orphan scan")
            return []

        result = await conn.execute(
            stmt,
            {
                "processing": ImportStatus.PROCESSING.value,
                "cutoff": cutoff,
            },
        )

        for row in result.mappings():
            reason = (
                "source_exhausted_finalization_stalled"
                if row["source_exhausted_at"] is not None
                else "progress_stale_timeout"
            )
            await conn.execute(
                text(
                    """
                    UPDATE import_jobs
                    SET orphaned_at = COALESCE(orphaned_at, :detected_at),
                        orphaned_reason = :reason,
                        updated_at = NOW()
                    WHERE id = :import_job_id
                    """
                ),
                {
                    "detected_at": now,
                    "reason": reason,
                    "import_job_id": row["id"],
                },
            )
            candidates.append(
                OrphanedImportCandidate(
                    import_job_id=str(row["id"]),
                    campaign_id=str(row["campaign_id"]),
                    last_progress_at=row["last_progress_at"],
                    last_committed_row=row["last_committed_row"],
                    source_exhausted_at=row["source_exhausted_at"],
                    orphaned_reason=reason,
                )
            )

    return candidates
