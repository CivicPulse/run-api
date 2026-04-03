"""Focused concurrency-shape coverage for Phase 60 chunk workers."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_job import ImportChunkStatus, ImportStatus


def _make_parent_job(import_job_id: str, campaign_id: str) -> MagicMock:
    job = MagicMock()
    job.id = uuid.UUID(import_job_id)
    job.campaign_id = uuid.UUID(campaign_id)
    job.status = ImportStatus.PROCESSING
    job.file_key = "imports/test/parallel.csv"
    job.source_type = "csv"
    job.field_mapping = {"First_Name": "first_name", "Last_Name": "last_name"}
    job.imported_rows = 0
    job.skipped_rows = 0
    job.total_rows = 10
    job.phones_created = 0
    job.last_committed_row = 0
    job.cancelled_at = None
    job.error_message = None
    job.last_progress_at = None
    return job


def _make_chunk(import_job_id: str, campaign_id: str, row_start: int, row_end: int):
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.import_job_id = uuid.UUID(import_job_id)
    chunk.campaign_id = uuid.UUID(campaign_id)
    chunk.row_start = row_start
    chunk.row_end = row_end
    chunk.status = ImportChunkStatus.QUEUED
    chunk.imported_rows = 0
    chunk.skipped_rows = 0
    chunk.last_committed_row = 0
    chunk.error_report_key = None
    chunk.error_message = None
    chunk.last_progress_at = None
    return chunk


@pytest.mark.asyncio
@pytest.mark.integration
async def test_parallel_chunk_workers_use_independent_sessions_and_no_parent_lock():
    """Two chunk workers on one import use fresh sessions and bounded calls."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())

    chunk_a = _make_chunk(import_job_id, campaign_id, 1, 5)
    chunk_b = _make_chunk(import_job_id, campaign_id, 6, 10)
    job = _make_parent_job(import_job_id, campaign_id)

    session_a = AsyncMock(name="session-a")
    session_b = AsyncMock(name="session-b")
    session_a.get = AsyncMock(side_effect=[chunk_a, job])
    session_b.get = AsyncMock(side_effect=[chunk_b, job])
    session_a.commit = AsyncMock()
    session_b.commit = AsyncMock()
    session_a.rollback = AsyncMock()
    session_b.rollback = AsyncMock()

    factory_sessions = [session_a, session_b]

    class _FactoryContext:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    created_sessions: list[AsyncMock] = []

    def fake_session_factory():
        session = factory_sessions[len(created_sessions)]
        created_sessions.append(session)
        return _FactoryContext(session)

    storage = MagicMock()
    process_calls: list[dict] = []

    async def fake_process_import_range(**kwargs):
        process_calls.append(kwargs)
        kwargs["chunk"].status = ImportChunkStatus.COMPLETED
        kwargs["chunk"].imported_rows = (
            kwargs["row_end"] - kwargs["row_start"] + 1
        )
        kwargs["chunk"].last_committed_row = kwargs["row_end"]
        kwargs["chunk"].last_progress_at = object()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=fake_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ) as set_context,
        patch(
            "app.tasks.import_task.try_claim_import_lock",
            new_callable=AsyncMock,
        ) as claim_lock,
        patch(
            "app.tasks.import_task.release_import_lock",
            new_callable=AsyncMock,
        ) as release_lock,
        patch("app.tasks.import_task.StorageService", return_value=storage),
        patch("app.tasks.import_task.ImportService") as service_cls,
    ):
        service = service_cls.return_value
        service.process_import_range = AsyncMock(side_effect=fake_process_import_range)

        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(str(chunk_a.id), campaign_id)
        await process_import_chunk(str(chunk_b.id), campaign_id)

    assert created_sessions == [session_a, session_b]
    assert [call.args for call in set_context.await_args_list] == [
        (session_a, campaign_id),
        (session_b, campaign_id),
    ]
    claim_lock.assert_not_awaited()
    release_lock.assert_not_awaited()
    assert [(call["row_start"], call["row_end"]) for call in process_calls] == [
        (1, 5),
        (6, 10),
    ]
    assert [call["session"] for call in process_calls] == [session_a, session_b]
    assert all(call["chunk"] in {chunk_a, chunk_b} for call in process_calls)
    assert all(call["job"] is job for call in process_calls)
    assert job.imported_rows == 0
    assert job.skipped_rows == 0
    assert chunk_a.status == ImportChunkStatus.COMPLETED
    assert chunk_b.status == ImportChunkStatus.COMPLETED
