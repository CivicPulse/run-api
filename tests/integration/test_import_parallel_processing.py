"""Focused concurrency-shape coverage for Phase 60 chunk workers."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_job import (
    ImportChunkStatus,
    ImportStatus,
)


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
    chunk.phones_created = 0
    chunk.phone_task_status = None
    chunk.geometry_task_status = None
    chunk.phone_task_error = None
    chunk.geometry_task_error = None
    chunk.phone_manifest = []
    chunk.geometry_manifest = []
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
        kwargs["chunk"].imported_rows = kwargs["row_end"] - kwargs["row_start"] + 1
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
        service.maybe_complete_chunk_after_secondary_tasks = AsyncMock(
            return_value=False
        )

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


@pytest.mark.asyncio
@pytest.mark.integration
async def test_parallel_chunk_workers_finalize_parent_with_partial_success():
    """Mixed chunk outcomes yield one parent partial-success result."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())

    chunk_a = _make_chunk(import_job_id, campaign_id, 1, 5)
    chunk_b = _make_chunk(import_job_id, campaign_id, 6, 10)
    job = _make_parent_job(import_job_id, campaign_id)
    chunks = {str(chunk_a.id): chunk_a, str(chunk_b.id): chunk_b}

    async def build_session(chunk_id: str):
        session = AsyncMock(name=f"session-{chunk_id}")

        async def fake_get(model, object_id):
            if model.__name__ == "ImportChunk":
                return chunks[str(object_id)]
            if model.__name__ == "ImportJob":
                return job
            raise AssertionError(f"Unexpected model lookup: {model}")

        session.get = AsyncMock(side_effect=fake_get)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        return session

    created_sessions: list[AsyncMock] = []

    class _FactoryContext:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    async def fake_process_import_range(**kwargs):
        chunk = kwargs["chunk"]
        if chunk is chunk_a:
            chunk.status = ImportChunkStatus.COMPLETED
            chunk.imported_rows = 5
            chunk.skipped_rows = 0
            chunk.phones_created = 2
            chunk.error_report_key = None
            chunk.last_committed_row = kwargs["row_end"]
            return
        raise RuntimeError("chunk b failed")

    finalize_calls = 0

    async def fake_finalize(*, session, storage, job, chunk, campaign_id):
        del session, storage, campaign_id, chunk
        nonlocal finalize_calls
        finalize_calls += 1
        if any(
            chunk.status not in {ImportChunkStatus.COMPLETED, ImportChunkStatus.FAILED}
            for chunk in chunks.values()
        ):
            return False
        if job.status in {
            ImportStatus.COMPLETED,
            ImportStatus.COMPLETED_WITH_ERRORS,
            ImportStatus.FAILED,
        }:
            return False
        job.imported_rows = sum(chunk.imported_rows or 0 for chunk in chunks.values())
        job.skipped_rows = sum(chunk.skipped_rows or 0 for chunk in chunks.values())
        job.phones_created = sum(chunk.phones_created or 0 for chunk in chunks.values())
        job.error_report_key = "imports/merged-errors.csv"
        job.status = ImportStatus.COMPLETED_WITH_ERRORS
        return True

    session_queue = [
        await build_session(str(chunk_a.id)),
        await build_session(str(chunk_b.id)),
    ]

    def fake_factory():
        session = session_queue[len(created_sessions)]
        created_sessions.append(session)
        return _FactoryContext(session)

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=fake_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.import_task.StorageService", return_value=MagicMock()),
        patch("app.tasks.import_task.ImportService") as service_cls,
    ):
        service = service_cls.return_value
        service.process_import_range = AsyncMock(side_effect=fake_process_import_range)
        service.maybe_complete_chunk_after_secondary_tasks = AsyncMock(
            side_effect=fake_finalize
        )

        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(str(chunk_a.id), campaign_id)
        with pytest.raises(RuntimeError, match="chunk b failed"):
            await process_import_chunk(str(chunk_b.id), campaign_id)

    assert finalize_calls == 2
    assert job.status == ImportStatus.COMPLETED_WITH_ERRORS
    assert job.imported_rows == 5
    assert job.skipped_rows == 0
    assert job.phones_created == 2
    assert job.error_report_key == "imports/merged-errors.csv"
    assert chunk_a.status == ImportChunkStatus.COMPLETED
    assert chunk_b.status == ImportChunkStatus.FAILED


@pytest.mark.asyncio
@pytest.mark.integration
async def test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list():
    """Parent startup fan-out is capped and later workers promote successors."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())
    job = _make_parent_job(import_job_id, campaign_id)
    job.total_rows = 20

    parent_session = AsyncMock(name="parent-session")
    parent_session.flush = AsyncMock()
    parent_session.commit = AsyncMock()
    parent_session.rollback = AsyncMock()
    added_chunks: list[MagicMock] = []
    generated_chunk_ids = [uuid.uuid4() for _ in range(4)]

    def capture_chunk(chunk):
        chunk.id = generated_chunk_ids[len(added_chunks)]
        chunk.phone_manifest = []
        chunk.geometry_manifest = []
        chunk.phone_task_status = None
        chunk.geometry_task_status = None
        chunk.error_message = None
        chunk.last_progress_at = None
        chunk.imported_rows = 0
        chunk.skipped_rows = 0
        added_chunks.append(chunk)

    parent_session.add = MagicMock(side_effect=capture_chunk)

    async def parent_get(model, object_id):
        del object_id
        if model.__name__ == "ImportJob":
            return job
        raise AssertionError(f"Unexpected parent lookup: {model}")

    parent_session.get = AsyncMock(side_effect=parent_get)

    worker_sessions: list[AsyncMock] = []
    for index in range(2):
        session = AsyncMock(name=f"worker-session-{index}")
        session.rollback = AsyncMock()
        worker_sessions.append(session)

    async def build_worker_get(worker_index: int, current_chunk_id: uuid.UUID):
        async def fake_get(model, object_id):
            if model.__name__ == "ImportChunk":
                if object_id == current_chunk_id:
                    return next(
                        chunk for chunk in added_chunks if chunk.id == object_id
                    )
                raise AssertionError(f"Unexpected chunk lookup: {object_id}")
            if model.__name__ == "ImportJob":
                return job
            raise AssertionError(f"Unexpected worker lookup: {model}")

        worker_sessions[worker_index].get = AsyncMock(side_effect=fake_get)

    def make_execute():
        async def fake_execute(_statement):
            pending = sorted(
                (
                    chunk
                    for chunk in added_chunks
                    if chunk.status == ImportChunkStatus.PENDING
                ),
                key=lambda chunk: chunk.row_start,
            )
            scalar_result = MagicMock()
            scalar_result.first.return_value = pending[0] if pending else None
            execute_result = MagicMock()
            execute_result.scalars.return_value = scalar_result
            return execute_result

        return AsyncMock(side_effect=fake_execute)

    for session in worker_sessions:
        session.execute = make_execute()

    contexts = [parent_session, *worker_sessions]

    class SessionContext:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    def fake_session_factory():
        return SessionContext(contexts.pop(0))

    defer_history: list[str] = []

    async def fake_defer(chunk_id: str, campaign_id: str):
        del campaign_id
        defer_history.append(chunk_id)

    mock_service = MagicMock()
    mock_service.count_csv_data_rows = AsyncMock(return_value=20)
    mock_service.process_import_file = AsyncMock()
    mock_service.process_import_range = AsyncMock()
    mock_service.maybe_complete_chunk_after_secondary_tasks = AsyncMock(
        return_value=True
    )
    storage = MagicMock()
    storage.get_object_size = AsyncMock(return_value=24_000_000)

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=fake_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch(
            "app.tasks.import_task.try_claim_import_lock",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.tasks.import_task.release_import_lock",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.import_task.ImportService", return_value=mock_service),
        patch("app.tasks.import_task.StorageService", return_value=storage),
        patch("app.tasks.import_task.settings.import_serial_threshold", 5),
        patch("app.tasks.import_task.settings.import_chunk_size_default", 5),
        patch("app.tasks.import_task.settings.import_max_chunks_per_import", 2),
        patch(
            "app.tasks.import_task.plan_chunk_ranges",
            return_value=[(1, 5), (6, 10), (11, 15), (16, 20)],
        ),
        patch("app.tasks.import_task.process_import_chunk.defer_async", fake_defer),
        patch(
            "app.tasks.import_task.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
    ):
        from app.tasks.import_task import process_import, process_import_chunk

        await process_import(import_job_id, campaign_id)
        await build_worker_get(0, generated_chunk_ids[0])
        await process_import_chunk(str(generated_chunk_ids[0]), campaign_id)
        await build_worker_get(1, generated_chunk_ids[1])
        await process_import_chunk(str(generated_chunk_ids[1]), campaign_id)

    assert defer_history == [str(chunk_id) for chunk_id in generated_chunk_ids]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_parallel_chunk_workers_finalize_parent_when_all_succeed():
    """Two successful chunks fan in to one completed parent result."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())

    chunk_a = _make_chunk(import_job_id, campaign_id, 1, 5)
    chunk_b = _make_chunk(import_job_id, campaign_id, 6, 10)
    job = _make_parent_job(import_job_id, campaign_id)
    chunks = {str(chunk_a.id): chunk_a, str(chunk_b.id): chunk_b}

    async def build_session(chunk_id: str):
        session = AsyncMock(name=f"session-{chunk_id}")

        async def fake_get(model, object_id):
            if model.__name__ == "ImportChunk":
                return chunks[str(object_id)]
            if model.__name__ == "ImportJob":
                return job
            raise AssertionError(f"Unexpected model lookup: {model}")

        session.get = AsyncMock(side_effect=fake_get)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        return session

    created_sessions: list[AsyncMock] = []

    class _FactoryContext:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    async def fake_process_import_range(**kwargs):
        chunk = kwargs["chunk"]
        chunk.status = ImportChunkStatus.COMPLETED
        chunk.imported_rows = 5
        chunk.skipped_rows = 1 if chunk is chunk_b else 0
        chunk.phones_created = 1
        chunk.last_committed_row = kwargs["row_end"]

    async def fake_finalize(*, session, storage, job, chunk, campaign_id):
        del session, storage, campaign_id, chunk
        if any(
            chunk.status not in {ImportChunkStatus.COMPLETED, ImportChunkStatus.FAILED}
            for chunk in chunks.values()
        ):
            return False
        if job.status == ImportStatus.COMPLETED:
            return False
        job.imported_rows = sum(chunk.imported_rows or 0 for chunk in chunks.values())
        job.skipped_rows = sum(chunk.skipped_rows or 0 for chunk in chunks.values())
        job.phones_created = sum(chunk.phones_created or 0 for chunk in chunks.values())
        job.status = ImportStatus.COMPLETED
        job.error_report_key = None
        return True

    session_queue = [
        await build_session(str(chunk_a.id)),
        await build_session(str(chunk_b.id)),
    ]

    def fake_factory():
        session = session_queue[len(created_sessions)]
        created_sessions.append(session)
        return _FactoryContext(session)

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=fake_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.import_task.StorageService", return_value=MagicMock()),
        patch("app.tasks.import_task.ImportService") as service_cls,
    ):
        service = service_cls.return_value
        service.process_import_range = AsyncMock(side_effect=fake_process_import_range)
        service.maybe_complete_chunk_after_secondary_tasks = AsyncMock(
            side_effect=fake_finalize
        )

        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(str(chunk_a.id), campaign_id)
        await process_import_chunk(str(chunk_b.id), campaign_id)

    assert job.status == ImportStatus.COMPLETED
    assert job.imported_rows == 10
    assert job.skipped_rows == 1
    assert job.phones_created == 2
    assert job.error_report_key is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_parallel_chunk_workers_finalize_parent_when_cancelled():
    """Queued and in-flight chunk cancellation fan in to one cancelled parent."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())

    chunk_a = _make_chunk(import_job_id, campaign_id, 1, 5)
    chunk_b = _make_chunk(import_job_id, campaign_id, 6, 10)
    job = _make_parent_job(import_job_id, campaign_id)
    chunks = {str(chunk_a.id): chunk_a, str(chunk_b.id): chunk_b}

    async def build_session(chunk_id: str):
        session = AsyncMock(name=f"session-{chunk_id}")

        async def fake_get(model, object_id):
            if model.__name__ == "ImportChunk":
                return chunks[str(object_id)]
            if model.__name__ == "ImportJob":
                return job
            raise AssertionError(f"Unexpected model lookup: {model}")

        session.get = AsyncMock(side_effect=fake_get)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        return session

    created_sessions: list[AsyncMock] = []

    class _FactoryContext:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    async def fake_process_import_range(**kwargs):
        chunk = kwargs["chunk"]
        chunk.status = ImportChunkStatus.CANCELLED
        chunk.imported_rows = 3 if chunk is chunk_a else 0
        chunk.skipped_rows = 0
        chunk.phones_created = 1 if chunk is chunk_a else 0
        chunk.last_committed_row = 3 if chunk is chunk_a else 0
        job.cancelled_at = object()

    async def fake_finalize(*, session, storage, job, chunk, campaign_id):
        del session, storage, campaign_id, chunk
        if any(
            chunk.status != ImportChunkStatus.CANCELLED for chunk in chunks.values()
        ):
            return False
        if job.status == ImportStatus.CANCELLED:
            return False
        job.imported_rows = sum(chunk.imported_rows or 0 for chunk in chunks.values())
        job.skipped_rows = sum(chunk.skipped_rows or 0 for chunk in chunks.values())
        job.phones_created = sum(chunk.phones_created or 0 for chunk in chunks.values())
        job.status = ImportStatus.CANCELLED
        job.error_report_key = None
        return True

    session_queue = [
        await build_session(str(chunk_a.id)),
        await build_session(str(chunk_b.id)),
    ]

    def fake_factory():
        session = session_queue[len(created_sessions)]
        created_sessions.append(session)
        return _FactoryContext(session)

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=fake_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.import_task.StorageService", return_value=MagicMock()),
        patch("app.tasks.import_task.ImportService") as service_cls,
    ):
        service = service_cls.return_value
        service.process_import_range = AsyncMock(side_effect=fake_process_import_range)
        service.maybe_complete_chunk_after_secondary_tasks = AsyncMock(
            side_effect=fake_finalize
        )

        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(str(chunk_a.id), campaign_id)
        await process_import_chunk(str(chunk_b.id), campaign_id)

    assert job.status == ImportStatus.CANCELLED
    assert job.imported_rows == 3
    assert job.skipped_rows == 0
    assert job.phones_created == 1
    assert chunk_a.status == ImportChunkStatus.CANCELLED
    assert chunk_b.status == ImportChunkStatus.CANCELLED
