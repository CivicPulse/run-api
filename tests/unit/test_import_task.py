"""Tests for the Procrastinate import task.

Validates that process_import uses the Procrastinate decorator,
accepts campaign_id, sets RLS before querying, and handles
status transitions correctly.
"""

from __future__ import annotations

import ast
import inspect
import uuid
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest

from app.models.import_job import ImportChunkStatus


@pytest.fixture
def campaign_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def import_job_id() -> str:
    return str(uuid.uuid4())


def test_process_import_is_procrastinate_task():
    """process_import is decorated with @procrastinate_app.task, not @broker.task."""
    source = inspect.getsource(
        __import__("app.tasks.import_task", fromlist=["import_task"])
    )
    tree = ast.parse(source)
    # Find the function definition for process_import
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "process_import":
            # Check decorator list for procrastinate_app.task call
            found = False
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call):
                    func = dec.func
                    if (
                        isinstance(func, ast.Attribute)
                        and func.attr == "task"
                        and isinstance(func.value, ast.Name)
                        and func.value.id == "procrastinate_app"
                    ):
                        found = True
            assert found, (
                "process_import must be decorated with @procrastinate_app.task"
            )
            break
    else:
        pytest.fail("process_import async function not found in module")


def test_process_import_accepts_campaign_id():
    """process_import accepts both import_job_id and campaign_id parameters."""
    from app.tasks.import_task import process_import

    sig = inspect.signature(process_import)
    params = list(sig.parameters.keys())
    assert "import_job_id" in params, "Missing import_job_id parameter"
    assert "campaign_id" in params, "Missing campaign_id parameter"


def test_no_broker_imports():
    """No imports from app.tasks.broker exist in the file."""
    source = inspect.getsource(
        __import__("app.tasks.import_task", fromlist=["import_task"])
    )
    assert "app.tasks.broker" not in source, (
        "import_task.py must not import from app.tasks.broker"
    )
    assert "broker.task" not in source, (
        "import_task.py must not use broker.task decorator"
    )


async def _run_process_import_with_total_rows(
    import_job_id: str,
    campaign_id: str,
    total_rows: int | None,
) -> AsyncMock:
    """Execute process_import with a mocked job and return the service mock."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.imported_rows = 10
    mock_job.skipped_rows = 0
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = total_rows
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {"first_name": "First Name"}

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.count_csv_data_rows = AsyncMock(return_value=2500)
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    return mock_service.process_import_file


@pytest.mark.asyncio
async def test_set_campaign_context_called_before_query(
    import_job_id: str, campaign_id: str
):
    """set_campaign_context is called BEFORE session.get (RLS fix)."""
    call_order: list[str] = []

    mock_job = MagicMock()
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = "queued"
    mock_job.imported_rows = 10
    mock_job.skipped_rows = 0
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = 100
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {"first_name": "First Name"}

    mock_session = AsyncMock()

    async def mock_set_context(session, cid):
        call_order.append("set_campaign_context")

    async def mock_get(model, pk):
        call_order.append("session.get")
        return mock_job

    mock_session.get = mock_get
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            side_effect=mock_set_context,
        ),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    assert call_order.index("set_campaign_context") < call_order.index("session.get"), (
        "set_campaign_context must be called BEFORE session.get"
    )


@pytest.mark.asyncio
async def test_status_transitions_on_success(import_job_id: str, campaign_id: str):
    """On success, task sets PROCESSING; COMPLETED is set by the service."""
    from app.models.import_job import ImportStatus

    status_changes: list[str] = []

    class MockJob:
        def __init__(self):
            self.id = uuid.UUID(import_job_id)
            self.campaign_id = uuid.UUID(campaign_id)
            self._status = ImportStatus.QUEUED
            self.imported_rows = 10
            self.skipped_rows = 0
            self.last_committed_row = 0
            self.cancelled_at = None
            self.total_rows = 100
            self.file_key = "imports/file.csv"
            self.field_mapping = {"first_name": "First Name"}

        @property
        def status(self):
            return self._status

        @status.setter
        def status(self, value):
            status_changes.append(str(value))
            self._status = value

    mock_job = MockJob()

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    # Task sets PROCESSING; COMPLETED is now set inside process_import_file
    assert "processing" in status_changes, "Job should transition to PROCESSING"
    # Task should NOT set COMPLETED -- that moved to import_service.py
    assert "completed" not in status_changes, (
        "Task should not set COMPLETED -- service handles it now"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("total_rows", [5000])
async def test_process_import_keeps_single_serial_service_call_below_threshold(
    import_job_id: str,
    campaign_id: str,
    total_rows: int,
):
    """Known below-threshold totals still use one serial service call."""
    process_import_file = await _run_process_import_with_total_rows(
        import_job_id=import_job_id,
        campaign_id=campaign_id,
        total_rows=total_rows,
    )

    process_import_file.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_import_preserves_serial_path_after_below_threshold_prescan(
    import_job_id: str, campaign_id: str
):
    """Unknown totals that pre-scan below threshold stay on the serial path."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.imported_rows = 0
    mock_job.skipped_rows = 0
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = None
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {"first_name": "First Name"}

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session.add = MagicMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.count_csv_data_rows = AsyncMock(return_value=2500)
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
        patch("app.tasks.import_task.settings.import_serial_threshold", 5000),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    mock_service.count_csv_data_rows.assert_awaited_once_with(ANY, mock_job.file_key)
    assert mock_job.total_rows == 2500
    mock_session.add.assert_not_called()
    mock_service.process_import_file.assert_awaited_once_with(
        import_job_id, mock_session, ANY, campaign_id
    )


@pytest.mark.asyncio
async def test_process_import_creates_deterministic_chunks_and_defers_children(
    import_job_id: str, campaign_id: str
):
    """Large imports create chunk rows in order and defer one child per chunk."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.imported_rows = 0
    mock_job.skipped_rows = 0
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = None
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {
        "first_name": "First Name",
        "last_name": "Last Name",
    }

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session.add = MagicMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.count_csv_data_rows = AsyncMock(return_value=12000)
    mock_service.process_import_file = AsyncMock()
    mock_defer = AsyncMock()
    planned_ranges = [(1, 4000), (4001, 8000), (8001, 12000)]
    added_chunks: list[object] = []
    generated_chunk_ids = [
        uuid.uuid4(),
        uuid.uuid4(),
        uuid.uuid4(),
    ]

    def capture_chunk(chunk):
        chunk.id = generated_chunk_ids[len(added_chunks)]
        added_chunks.append(chunk)

    mock_session.add.side_effect = capture_chunk

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
        patch("app.tasks.import_task.settings.import_serial_threshold", 5000),
        patch("app.tasks.import_task.settings.import_chunk_size_default", 4000),
        patch(
            "app.tasks.import_task.plan_chunk_ranges",
            return_value=planned_ranges,
        ) as plan_ranges,
        patch("app.tasks.import_task.process_import_chunk.defer_async", mock_defer),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    plan_ranges.assert_called_once_with(
        total_rows=12000,
        mapped_column_count=2,
        chunk_size_default=4000,
    )
    assert [
        (chunk.row_start, chunk.row_end) for chunk in added_chunks
    ] == planned_ranges
    assert all(chunk.status == ImportChunkStatus.QUEUED for chunk in added_chunks)
    assert [chunk.import_job_id for chunk in added_chunks] == [mock_job.id] * 3
    assert [chunk.campaign_id for chunk in added_chunks] == [mock_job.campaign_id] * 3
    assert [call.args for call in mock_defer.await_args_list] == [
        (str(chunk_id), campaign_id) for chunk_id in generated_chunk_ids
    ]
    mock_service.process_import_file.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure_target", "expected_error"),
    [
        ("count_csv_data_rows", "Import orchestration failed during CSV pre-scan"),
        ("session_add", "Import orchestration failed during chunk creation"),
        ("defer_async", "Import orchestration failed during chunk deferral"),
    ],
)
async def test_process_import_fails_fast_when_chunk_orchestration_fails(
    import_job_id: str,
    campaign_id: str,
    failure_target: str,
    expected_error: str,
):
    """Chunk-eligible imports fail explicitly instead of falling back to serial."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.imported_rows = 0
    mock_job.skipped_rows = 0
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = None
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {"first_name": "First Name"}

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session.add = MagicMock()

    if failure_target == "session_add":
        mock_session.add.side_effect = RuntimeError("chunk create failed")

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    if failure_target == "count_csv_data_rows":
        mock_service.count_csv_data_rows = AsyncMock(
            side_effect=RuntimeError("pre-scan failed")
        )
    else:
        mock_service.count_csv_data_rows = AsyncMock(return_value=9000)
    mock_service.process_import_file = AsyncMock()

    mock_defer = AsyncMock()
    if failure_target == "defer_async":
        mock_defer.side_effect = RuntimeError("defer failed")

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
        patch("app.tasks.import_task.settings.import_serial_threshold", 5000),
        patch(
            "app.tasks.import_task.plan_chunk_ranges",
            return_value=[(1, 4500), (4501, 9000)],
        ),
        patch("app.tasks.import_task.process_import_chunk.defer_async", mock_defer),
        pytest.raises(RuntimeError),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    assert mock_job.status == ImportStatus.FAILED
    assert mock_job.error_message == expected_error
    mock_service.process_import_file.assert_not_awaited()


@pytest.mark.asyncio
async def test_status_set_to_failed_on_error(import_job_id: str, campaign_id: str):
    """On failure, job status is set to FAILED with error_message."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0
    mock_job.total_rows = 100
    mock_job.file_key = "imports/file.csv"
    mock_job.field_mapping = {"first_name": "First Name"}

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock(side_effect=RuntimeError("test error"))

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
        pytest.raises(RuntimeError, match="test error"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    assert mock_job.status == ImportStatus.FAILED
    assert mock_job.error_message is not None


@pytest.mark.asyncio
async def test_recover_import_finalizes_exhausted_job(
    import_job_id: str, campaign_id: str
):
    """Recovery finalizes a stale source-exhausted import without replaying rows."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.PROCESSING
    mock_job.last_progress_at = None
    mock_job.source_exhausted_at = object()
    mock_job.cancelled_at = None
    mock_job.imported_rows = 10
    mock_job.skipped_rows = 1

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch("app.tasks.import_task.is_import_stale", return_value=True),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import recover_import

        await recover_import(import_job_id, campaign_id)

    assert mock_job.status == ImportStatus.COMPLETED
    mock_service.process_import_file.assert_not_awaited()


@pytest.mark.asyncio
async def test_recover_import_skips_terminal_jobs(import_job_id: str, campaign_id: str):
    """Recovery does not reclaim jobs already in a terminal status."""
    from app.models.import_job import ImportStatus

    for terminal_status in (
        ImportStatus.COMPLETED,
        ImportStatus.CANCELLED,
        ImportStatus.FAILED,
    ):
        mock_job = MagicMock()
        mock_job.id = uuid.UUID(import_job_id)
        mock_job.campaign_id = uuid.UUID(campaign_id)
        mock_job.status = terminal_status
        mock_job.source_exhausted_at = None
        mock_job.cancelled_at = None

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_job)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()
        mock_session.rollback = AsyncMock()

        mock_session_factory = AsyncMock()
        mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.__aexit__ = AsyncMock(return_value=False)

        mock_service = MagicMock()
        mock_service.process_import_file = AsyncMock()

        with (
            patch(
                "app.tasks.import_task.async_session_factory",
                return_value=mock_session_factory,
            ),
            patch(
                "app.tasks.import_task.set_campaign_context",
                new_callable=AsyncMock,
            ),
            patch(
                "app.tasks.import_task.try_claim_import_lock",
                new_callable=AsyncMock,
            ) as claim_lock,
            patch(
                "app.tasks.import_task.release_import_lock",
                new_callable=AsyncMock,
            ),
            patch(
                "app.tasks.import_task.ImportService",
                return_value=mock_service,
            ),
            patch("app.tasks.import_task.StorageService"),
        ):
            from app.tasks.import_task import recover_import

            await recover_import(import_job_id, campaign_id)

        claim_lock.assert_not_awaited()
        mock_service.process_import_file.assert_not_awaited()


@pytest.mark.asyncio
async def test_recover_import_skips_fresh_processing_job(
    import_job_id: str, campaign_id: str
):
    """Recovery leaves active non-stale jobs alone."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.PROCESSING
    mock_job.source_exhausted_at = None
    mock_job.cancelled_at = None

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        ) as release_lock,
        patch("app.tasks.import_task.is_import_stale", return_value=False),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import recover_import

        await recover_import(import_job_id, campaign_id)

    mock_service.process_import_file.assert_not_awaited()
    mock_session.commit.assert_not_awaited()
    release_lock.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_import_skips_when_lock_unavailable(
    import_job_id: str, campaign_id: str
):
    """Fresh processing exits cleanly when another worker owns the import lock."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.id = uuid.UUID(import_job_id)
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch(
            "app.tasks.import_task.try_claim_import_lock",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    mock_service.process_import_file.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_import_resumes_without_resetting_status(
    import_job_id: str, campaign_id: str
):
    """R006: When last_committed_row > 0 and status is PROCESSING, process_import
    skips resetting status/counters (crash-recovery resume path)."""
    from app.models.import_job import ImportStatus

    status_changes: list[str] = []

    class MockJob:
        def __init__(self):
            self.id = uuid.UUID(import_job_id)
            self.campaign_id = uuid.UUID(campaign_id)
            self._status = ImportStatus.PROCESSING
            self.imported_rows = 50
            self.skipped_rows = 2
            self.last_committed_row = 50
            self.cancelled_at = None
            self.last_progress_at = None
            self.orphaned_at = "2026-01-01T00:00:00"
            self.orphaned_reason = "stale"
            self.source_exhausted_at = None
            self.total_rows = 100
            self.file_key = "imports/file.csv"
            self.field_mapping = {"first_name": "First Name"}

        @property
        def status(self):
            return self._status

        @status.setter
        def status(self, value):
            status_changes.append(str(value))
            self._status = value

    mock_job = MockJob()

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.rollback = AsyncMock()

    mock_session_factory = AsyncMock()
    mock_session_factory.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.__aexit__ = AsyncMock(return_value=False)

    mock_service = MagicMock()
    mock_service.process_import_file = AsyncMock()

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=mock_session_factory,
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
        patch(
            "app.tasks.import_task.ImportService",
            return_value=mock_service,
        ),
        patch("app.tasks.import_task.StorageService"),
    ):
        from app.tasks.import_task import process_import

        await process_import(import_job_id, campaign_id)

    # Resume path should NOT reset status to PROCESSING again
    assert "processing" not in status_changes, (
        "Resume path should not re-set status to PROCESSING"
    )
    # Service should still be called to continue processing
    mock_service.process_import_file.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_import_chunk_uses_fresh_session_and_row_bounds(
    campaign_id: str,
):
    """Child workers create their own session and call the ranged engine."""
    import_job_id = str(uuid.uuid4())
    chunk_id = str(uuid.uuid4())
    call_order: list[str] = []

    job = MagicMock()
    job.id = uuid.UUID(import_job_id)
    job.campaign_id = uuid.UUID(campaign_id)
    job.imported_rows = 13
    job.skipped_rows = 2
    job.total_rows = 100
    job.last_progress_at = None

    chunk = MagicMock()
    chunk.id = uuid.UUID(chunk_id)
    chunk.import_job_id = uuid.UUID(import_job_id)
    chunk.row_start = 11
    chunk.row_end = 20
    chunk.status = ImportChunkStatus.QUEUED
    chunk.imported_rows = 0
    chunk.skipped_rows = 0
    chunk.last_committed_row = 0
    chunk.error_message = "old error"
    chunk.last_progress_at = None

    session = AsyncMock()

    async def fake_get(model, object_id):
        if model.__name__ == "ImportChunk":
            call_order.append("session.get.chunk")
            assert object_id == uuid.UUID(chunk_id)
            return chunk
        if model.__name__ == "ImportJob":
            call_order.append("session.get.job")
            assert object_id == uuid.UUID(import_job_id)
            return job
        raise AssertionError(f"Unexpected model lookup: {model}")

    session.get = AsyncMock(side_effect=fake_get)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    class SessionContext:
        async def __aenter__(self):
            return session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    storage = MagicMock()
    mock_service = MagicMock()
    mock_service.process_import_range = AsyncMock()

    async def fake_set_context(db_session, cid):
        assert db_session is session
        assert cid == campaign_id
        call_order.append("set_campaign_context")

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=lambda: SessionContext(),
        ) as session_factory,
        patch(
            "app.tasks.import_task.set_campaign_context",
            side_effect=fake_set_context,
        ),
        patch("app.tasks.import_task.StorageService", return_value=storage),
        patch("app.tasks.import_task.ImportService", return_value=mock_service),
        patch(
            "app.tasks.import_task.try_claim_import_lock",
            new_callable=AsyncMock,
        ) as claim_lock,
        patch(
            "app.tasks.import_task.release_import_lock",
            new_callable=AsyncMock,
        ) as release_lock,
    ):
        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(chunk_id, campaign_id)

    session_factory.assert_called_once_with()
    assert call_order[:2] == ["set_campaign_context", "session.get.chunk"]
    assert "session.get.job" in call_order
    claim_lock.assert_not_awaited()
    release_lock.assert_not_awaited()
    assert chunk.status == ImportChunkStatus.COMPLETED
    assert chunk.error_message is None
    assert chunk.last_progress_at is not None
    mock_service.process_import_range.assert_awaited_once_with(
        job=job,
        import_job_id=import_job_id,
        session=session,
        storage=storage,
        campaign_id=campaign_id,
        row_start=11,
        row_end=20,
        chunk=chunk,
    )
    assert job.imported_rows == 13
    assert job.skipped_rows == 2


@pytest.mark.asyncio
async def test_process_import_chunk_marks_only_chunk_failed(campaign_id: str):
    """Child-worker failures are recorded on the chunk without finalizing the parent."""
    import_job_id = str(uuid.uuid4())
    chunk_id = str(uuid.uuid4())

    job = MagicMock()
    job.id = uuid.UUID(import_job_id)
    job.campaign_id = uuid.UUID(campaign_id)
    job.status = "processing"
    job.imported_rows = 9
    job.skipped_rows = 1
    job.last_progress_at = None

    chunk = MagicMock()
    chunk.id = uuid.UUID(chunk_id)
    chunk.import_job_id = uuid.UUID(import_job_id)
    chunk.row_start = 21
    chunk.row_end = 30
    chunk.status = ImportChunkStatus.QUEUED
    chunk.imported_rows = 0
    chunk.skipped_rows = 0
    chunk.last_committed_row = 0
    chunk.error_message = None
    chunk.last_progress_at = None

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[chunk, job])
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    class SessionContext:
        async def __aenter__(self):
            return session

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    mock_service = MagicMock()
    mock_service.process_import_range = AsyncMock(
        side_effect=RuntimeError("chunk runtime failure")
    )

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            side_effect=lambda: SessionContext(),
        ),
        patch(
            "app.tasks.import_task.set_campaign_context",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.import_task.StorageService"),
        patch("app.tasks.import_task.ImportService", return_value=mock_service),
        patch(
            "app.tasks.import_task.try_claim_import_lock",
            new_callable=AsyncMock,
        ) as claim_lock,
        patch(
            "app.tasks.import_task.release_import_lock",
            new_callable=AsyncMock,
        ) as release_lock,
        pytest.raises(RuntimeError, match="chunk runtime failure"),
    ):
        from app.tasks.import_task import process_import_chunk

        await process_import_chunk(chunk_id, campaign_id)

    claim_lock.assert_not_awaited()
    release_lock.assert_not_awaited()
    assert chunk.status == ImportChunkStatus.FAILED
    assert chunk.error_message == "chunk runtime failure"
    assert chunk.last_progress_at is not None
    assert job.status == "processing"
    assert job.imported_rows == 9
    assert job.skipped_rows == 1
