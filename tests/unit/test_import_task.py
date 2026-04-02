"""Tests for the Procrastinate import task.

Validates that process_import uses the Procrastinate decorator,
accepts campaign_id, sets RLS before querying, and handles
status transitions correctly.
"""

from __future__ import annotations

import ast
import inspect
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


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
async def test_status_set_to_failed_on_error(import_job_id: str, campaign_id: str):
    """On failure, job status is set to FAILED with error_message."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.QUEUED
    mock_job.cancelled_at = None
    mock_job.last_committed_row = 0

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
