"""Background task for voter file import processing."""

from __future__ import annotations

import uuid
from contextlib import suppress

from loguru import logger

from app.core.config import settings
from app.core.time import utcnow
from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.import_job import ImportJob, ImportStatus
from app.services.import_recovery import (
    is_import_stale,
    release_import_lock,
    try_claim_import_lock,
)
from app.services.import_service import ImportService, should_use_serial_import
from app.services.storage import StorageService
from app.tasks.procrastinate_app import procrastinate_app


@procrastinate_app.task(name="process_import", queue="imports")
async def process_import(import_job_id: str, campaign_id: str) -> None:
    """Process a voter file import in the background.

    Args:
        import_job_id: UUID string of the ImportJob to process.
        campaign_id: UUID string of the campaign -- passed explicitly
            because import_jobs has RLS and we need to set context
            BEFORE querying the job.
    """
    logger.info("Starting import job {} for campaign {}", import_job_id, campaign_id)
    storage = StorageService()
    service = ImportService()

    async with async_session_factory() as session:
        lock_claimed = False
        try:
            # CRITICAL: Set RLS context BEFORE any query
            await set_campaign_context(session, campaign_id)

            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            if job is None:
                raise ValueError(f"ImportJob {import_job_id} not found")

            lock_claimed = await try_claim_import_lock(session, job.id)
            if not lock_claimed:
                logger.warning("Import {} is already locked by another worker", job.id)
                return

            # Resume detection: if status is already PROCESSING with
            # committed rows, this is a crash recovery (per D-02).
            # Do NOT reset status or counters -- process_import_file
            # handles resume internally.
            is_resume = (
                job.status == ImportStatus.PROCESSING
                and (job.last_committed_row or 0) > 0
            )

            if not is_resume:
                job.status = ImportStatus.PROCESSING
                job.last_progress_at = utcnow()
                job.orphaned_at = None
                job.orphaned_reason = None
                job.source_exhausted_at = None
                await session.flush()

            # Pre-check: job may have been cancelled while QUEUED
            # (Pitfall 3). If cancelled_at is set, skip processing.
            if job.cancelled_at is not None:
                logger.info(
                    "Import {} was cancelled while queued, skipping",
                    import_job_id,
                )
                job.status = ImportStatus.CANCELLED
                await session.commit()
                return

            total_rows = getattr(job, "total_rows", None)
            use_serial_import = should_use_serial_import(
                total_rows, settings.import_serial_threshold
            )
            if use_serial_import:
                logger.debug(
                    "Import {} using serial path for total_rows={} threshold={}",
                    import_job_id,
                    total_rows,
                    settings.import_serial_threshold,
                )
            else:
                logger.info(
                    "Import {} exceeds serial threshold (total_rows={}, "
                    "threshold={}); chunk fan-out is deferred until Phase 60, "
                    "continuing on the serial path",
                    import_job_id,
                    total_rows,
                    settings.import_serial_threshold,
                )

            # process_import_file handles per-batch commits, RLS restore,
            # error storage, resume skipping, and sets COMPLETED status.
            await service.process_import_file(
                import_job_id, session, storage, campaign_id
            )

            await session.refresh(job)
            logger.info(
                "Import job {} completed: {} imported, {} skipped",
                import_job_id,
                job.imported_rows,
                job.skipped_rows,
            )

        except Exception:
            logger.exception("Import job {} failed", import_job_id)
            await session.rollback()
            try:
                await set_campaign_context(session, campaign_id)
                job = await session.get(ImportJob, uuid.UUID(import_job_id))
                if job is not None:
                    job.status = ImportStatus.FAILED
                    job.error_message = "Import processing failed unexpectedly"
                    job.last_progress_at = utcnow()
                    await session.commit()
            except Exception:
                logger.exception("Failed to update job status for {}", import_job_id)
            raise
        finally:
            if lock_claimed:
                with suppress(Exception):
                    await release_import_lock(session, uuid.UUID(import_job_id))


@procrastinate_app.task(name="recover_import", queue="imports")
async def recover_import(import_job_id: str, campaign_id: str) -> None:
    """Recover a stale import by resuming or finalizing it safely."""
    logger.info("Starting recovery for import job {} in {}", import_job_id, campaign_id)
    storage = StorageService()
    service = ImportService()

    async with async_session_factory() as session:
        lock_claimed = False
        try:
            await set_campaign_context(session, campaign_id)

            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            if job is None:
                raise ValueError(f"ImportJob {import_job_id} not found")

            if job.status in (
                ImportStatus.COMPLETED,
                ImportStatus.CANCELLED,
                ImportStatus.FAILED,
            ):
                logger.info(
                    "Skipping recovery for import {} in terminal status {}",
                    import_job_id,
                    job.status,
                )
                return

            lock_claimed = await try_claim_import_lock(session, job.id)
            if not lock_claimed:
                logger.warning(
                    "Recovery for import {} skipped because another "
                    "worker owns the lock",
                    import_job_id,
                )
                return

            if not is_import_stale(job) and job.source_exhausted_at is None:
                logger.info(
                    "Import {} is no longer stale; skipping recovery",
                    import_job_id,
                )
                return

            job.recovery_started_at = utcnow()
            job.last_progress_at = job.recovery_started_at
            await session.commit()
            await set_campaign_context(session, campaign_id)

            if job.source_exhausted_at is not None:
                await session.refresh(job)
                job.status = (
                    ImportStatus.CANCELLED
                    if job.cancelled_at is not None
                    else ImportStatus.COMPLETED
                )
                job.last_progress_at = utcnow()
                await session.commit()
                logger.info(
                    "Recovered import {} by finalizing stale post-EOF work",
                    import_job_id,
                )
                return

            await service.process_import_file(
                import_job_id,
                session,
                storage,
                campaign_id,
            )
            await session.refresh(job)
            logger.info(
                "Recovered import {}: {} imported, {} skipped",
                import_job_id,
                job.imported_rows,
                job.skipped_rows,
            )
        except Exception:
            logger.exception("Import recovery {} failed", import_job_id)
            await session.rollback()
            try:
                await set_campaign_context(session, campaign_id)
                job = await session.get(ImportJob, uuid.UUID(import_job_id))
                if job is not None:
                    job.status = ImportStatus.FAILED
                    job.error_message = "Import recovery failed unexpectedly"
                    job.last_progress_at = utcnow()
                    await session.commit()
            except Exception:
                logger.exception(
                    "Failed to update recovery status for {}",
                    import_job_id,
                )
            raise
        finally:
            if lock_claimed:
                with suppress(Exception):
                    await release_import_lock(session, uuid.UUID(import_job_id))
