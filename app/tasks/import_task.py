"""Background task for voter file import processing."""

from __future__ import annotations

import uuid

from loguru import logger

from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.import_job import ImportJob, ImportStatus
from app.services.import_service import ImportService
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
        try:
            # CRITICAL: Set RLS context BEFORE any query
            await set_campaign_context(session, campaign_id)

            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            if job is None:
                raise ValueError(f"ImportJob {import_job_id} not found")

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
                    await session.commit()
            except Exception:
                logger.exception("Failed to update job status for {}", import_job_id)
            raise
