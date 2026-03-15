"""Background task for voter file import processing."""

from __future__ import annotations

from loguru import logger

from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.import_job import ImportJob, ImportStatus
from app.services.import_service import ImportService
from app.services.storage import StorageService
from app.tasks.broker import broker


@broker.task
async def process_import(import_job_id: str) -> dict:
    """Process a voter file import in the background.

    Creates its own DB session (runs outside FastAPI request lifecycle),
    sets RLS campaign context, and delegates to ImportService.

    Args:
        import_job_id: UUID string of the ImportJob to process.

    Returns:
        Dict with imported/skipped/total counts.
    """
    import uuid

    logger.info("Starting import job {}", import_job_id)
    storage = StorageService()
    service = ImportService()

    async with async_session_factory() as session:
        try:
            # Load job to get campaign_id
            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            if job is None:
                raise ValueError(f"ImportJob {import_job_id} not found")

            # CRITICAL: Set RLS context for background job
            await set_campaign_context(session, str(job.campaign_id))

            # Update status to processing
            job.status = ImportStatus.PROCESSING
            await session.flush()

            # Process the file
            await service.process_import_file(import_job_id, session, storage)
            await session.commit()

            # Reload to get final counts
            await session.refresh(job)
            logger.info(
                "Import job {} completed: {} imported, {} skipped",
                import_job_id,
                job.imported_rows,
                job.skipped_rows,
            )
            return {
                "imported": job.imported_rows or 0,
                "skipped": job.skipped_rows or 0,
                "total": job.total_rows or 0,
            }

        except Exception:
            logger.exception("Import job {} failed", import_job_id)
            # Try to update job status to FAILED
            try:
                job = await session.get(ImportJob, uuid.UUID(import_job_id))
                if job is not None:
                    job.status = ImportStatus.FAILED
                    job.error_message = "Import processing failed unexpectedly"
                    await session.commit()
            except Exception:
                logger.exception("Failed to update job status for {}", import_job_id)
            raise
