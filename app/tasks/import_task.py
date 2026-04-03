"""Background task for voter file import processing."""

from __future__ import annotations

import uuid
from contextlib import suppress

from loguru import logger

from app.core.config import settings
from app.core.time import utcnow
from app.db.rls import commit_and_restore_rls, set_campaign_context
from app.db.session import async_session_factory
from app.models.import_job import (
    ImportChunk,
    ImportChunkStatus,
    ImportJob,
    ImportStatus,
)
from app.services.import_recovery import (
    is_import_stale,
    release_import_lock,
    try_claim_import_lock,
)
from app.services.import_service import (
    ImportService,
    plan_chunk_ranges,
    should_use_serial_import,
)
from app.services.storage import StorageService
from app.tasks.procrastinate_app import procrastinate_app


def _count_mapped_columns(field_mapping: dict | None) -> int:
    """Count mapped columns for chunk sizing heuristics."""
    if not isinstance(field_mapping, dict):
        return 0
    return sum(1 for value in field_mapping.values() if value)


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
            if total_rows is None:
                try:
                    total_rows = await service.count_csv_data_rows(
                        storage, job.file_key
                    )
                except Exception as exc:
                    raise RuntimeError(
                        "Import orchestration failed during CSV pre-scan"
                    ) from exc
                job.total_rows = total_rows

            if should_use_serial_import(total_rows, settings.import_serial_threshold):
                logger.debug(
                    "Import {} using serial path for total_rows={} threshold={}",
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
                return

            logger.info(
                "Import {} exceeds serial threshold (total_rows={}, threshold={}); "
                "creating deterministic chunks and deferring child workers",
                import_job_id,
                total_rows,
                settings.import_serial_threshold,
            )

            mapped_column_count = _count_mapped_columns(job.field_mapping)
            chunk_ranges = plan_chunk_ranges(
                total_rows=total_rows,
                mapped_column_count=mapped_column_count,
                chunk_size_default=settings.import_chunk_size_default,
            )

            try:
                chunks: list[ImportChunk] = []
                for row_start, row_end in chunk_ranges:
                    chunk = ImportChunk(
                        campaign_id=job.campaign_id,
                        import_job_id=job.id,
                        row_start=row_start,
                        row_end=row_end,
                        status=ImportChunkStatus.PENDING,
                    )
                    session.add(chunk)
                    chunks.append(chunk)
                await session.flush()
            except Exception as exc:
                raise RuntimeError(
                    "Import orchestration failed during chunk creation"
                ) from exc

            try:
                for chunk in chunks:
                    await process_import_chunk.defer_async(str(chunk.id), campaign_id)
                    chunk.status = ImportChunkStatus.QUEUED
                    chunk.last_progress_at = utcnow()
                job.last_progress_at = utcnow()
                await session.commit()
            except Exception as exc:
                raise RuntimeError(
                    "Import orchestration failed during chunk deferral"
                ) from exc

            logger.info(
                "Import job {} queued {} chunk workers",
                import_job_id,
                len(chunks),
            )
            return

        except Exception as exc:
            logger.exception("Import job {} failed", import_job_id)
            await session.rollback()
            try:
                await set_campaign_context(session, campaign_id)
                job = await session.get(ImportJob, uuid.UUID(import_job_id))
                if job is not None:
                    job.status = ImportStatus.FAILED
                    if isinstance(exc, RuntimeError) and exc.args:
                        job.error_message = str(exc)
                    else:
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


@procrastinate_app.task(name="process_import_chunk", queue="imports")
async def process_import_chunk(chunk_id: str, campaign_id: str) -> None:
    """Process one import chunk using an independent session and bounded row range."""
    logger.info("Starting import chunk {} for campaign {}", chunk_id, campaign_id)
    storage = StorageService()
    service = ImportService()

    async with async_session_factory() as session:
        chunk: ImportChunk | None = None
        try:
            await set_campaign_context(session, campaign_id)

            chunk = await session.get(ImportChunk, uuid.UUID(chunk_id))
            if chunk is None:
                raise ValueError(f"ImportChunk {chunk_id} not found")

            job = await session.get(ImportJob, chunk.import_job_id)
            if job is None:
                raise ValueError(f"ImportJob {chunk.import_job_id} not found")

            chunk.status = ImportChunkStatus.PROCESSING
            chunk.error_message = None
            chunk.last_progress_at = utcnow()
            await commit_and_restore_rls(session, campaign_id)

            await service.process_import_range(
                job=job,
                import_job_id=str(job.id),
                session=session,
                storage=storage,
                campaign_id=campaign_id,
                row_start=chunk.row_start,
                row_end=chunk.row_end,
                chunk=chunk,
            )
            if chunk.status == ImportChunkStatus.PROCESSING:
                chunk.status = ImportChunkStatus.COMPLETED
                chunk.error_message = None
                chunk.last_progress_at = utcnow()
                await session.commit()
        except Exception as exc:
            logger.exception("Import chunk {} failed", chunk_id)
            await session.rollback()
            if chunk is not None:
                try:
                    await set_campaign_context(session, campaign_id)
                    chunk.status = ImportChunkStatus.FAILED
                    chunk.error_message = str(exc)
                    chunk.last_progress_at = utcnow()
                    await session.commit()
                except Exception:
                    logger.exception("Failed to update chunk status for {}", chunk_id)
            raise


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
