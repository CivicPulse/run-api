"""Unit tests for orphaned import detection and worker recovery scan."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_job import ImportStatus


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self._rows


@pytest.fixture
def campaign_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def import_job_id() -> str:
    return str(uuid.uuid4())


def test_is_import_stale_uses_progress_timestamp(import_job_id: str, campaign_id: str):
    """Processing jobs older than the threshold are considered stale."""
    from app.core.time import utcnow
    from app.services.import_recovery import is_import_stale

    now = utcnow()
    stale_job = MagicMock(
        id=uuid.UUID(import_job_id),
        campaign_id=uuid.UUID(campaign_id),
        status=ImportStatus.PROCESSING,
        last_progress_at=now - timedelta(minutes=31),
    )
    fresh_job = MagicMock(
        id=uuid.UUID(import_job_id),
        campaign_id=uuid.UUID(campaign_id),
        status=ImportStatus.PROCESSING,
        last_progress_at=now - timedelta(minutes=5),
    )
    done_job = MagicMock(
        id=uuid.UUID(import_job_id),
        campaign_id=uuid.UUID(campaign_id),
        status=ImportStatus.COMPLETED,
        last_progress_at=now - timedelta(hours=3),
    )

    assert is_import_stale(stale_job, now=now, threshold_minutes=30) is True
    assert is_import_stale(fresh_job, now=now, threshold_minutes=30) is False
    assert is_import_stale(done_job, now=now, threshold_minutes=30) is False


@pytest.mark.asyncio
async def test_scan_for_orphaned_imports_updates_metadata_and_returns_candidates():
    """Detection scan persists orphan metadata and returns recovery candidates."""
    from app.core.time import utcnow
    from app.services.import_recovery import scan_for_orphaned_imports

    now = utcnow()
    stale_id = uuid.uuid4()
    exhausted_id = uuid.uuid4()
    campaign_a = uuid.uuid4()
    campaign_b = uuid.uuid4()

    rows = [
        {
            "id": stale_id,
            "campaign_id": campaign_a,
            "last_progress_at": now - timedelta(minutes=45),
            "last_committed_row": 120,
            "source_exhausted_at": None,
        },
        {
            "id": exhausted_id,
            "campaign_id": campaign_b,
            "last_progress_at": now - timedelta(minutes=90),
            "last_committed_row": 250,
            "source_exhausted_at": now - timedelta(minutes=91),
        },
    ]

    conn = AsyncMock()
    conn.execute = AsyncMock(
        side_effect=[
            None,
            _FakeResult(rows),
            None,
            None,
        ]
    )

    @asynccontextmanager
    async def fake_begin():
        yield conn

    fake_engine = MagicMock()
    fake_engine.begin = fake_begin

    with (
        patch("app.services.import_recovery.engine", fake_engine),
        patch("app.services.import_recovery.utcnow", return_value=now),
        patch(
            "app.services.import_recovery.settings",
            MagicMock(import_orphan_threshold_minutes=30),
        ),
    ):
        candidates = await scan_for_orphaned_imports()

    assert [candidate.import_job_id for candidate in candidates] == [
        str(stale_id),
        str(exhausted_id),
    ]
    assert candidates[0].orphaned_reason == "progress_stale_timeout"
    assert candidates[1].orphaned_reason == "source_exhausted_finalization_stalled"

    update_calls = conn.execute.await_args_list[2:]
    assert len(update_calls) == 2
    assert update_calls[0].args[1]["import_job_id"] == stale_id
    assert update_calls[0].args[1]["reason"] == "progress_stale_timeout"
    assert update_calls[1].args[1]["import_job_id"] == exhausted_id
    assert update_calls[1].args[1]["reason"] == "source_exhausted_finalization_stalled"


@pytest.mark.asyncio
async def test_worker_main_queues_recovery_for_detected_orphans(
    campaign_id: str,
    import_job_id: str,
):
    """Worker startup queues one recovery task per orphaned import candidate."""
    from app.services.import_recovery import OrphanedImportCandidate
    from scripts.worker import main

    candidate = OrphanedImportCandidate(
        import_job_id=import_job_id,
        campaign_id=campaign_id,
        last_progress_at=object(),
        last_committed_row=50,
        source_exhausted_at=None,
        orphaned_reason="progress_stale_timeout",
    )
    health_server = MagicMock()
    health_server.close = MagicMock()
    health_server.wait_closed = AsyncMock()
    recover_import = MagicMock(defer_async=AsyncMock())

    procrastinate_app = MagicMock()

    @asynccontextmanager
    async def fake_open_async():
        yield None

    procrastinate_app.open_async = fake_open_async
    procrastinate_app.run_worker_async = AsyncMock(return_value=None)

    with (
        patch("scripts.worker.init_sentry"),
        patch(
            "scripts.worker._start_health_server",
            AsyncMock(return_value=health_server),
        ),
        patch(
            "scripts.worker.scan_for_orphaned_imports",
            AsyncMock(return_value=[candidate]),
        ),
        patch("app.tasks.import_task.recover_import", recover_import),
        patch("app.tasks.procrastinate_app.procrastinate_app", procrastinate_app),
    ):
        await main()

    recover_import.defer_async.assert_awaited_once_with(
        import_job_id=import_job_id,
        campaign_id=campaign_id,
    )
    procrastinate_app.run_worker_async.assert_awaited_once()
    health_server.close.assert_called_once()
    health_server.wait_closed.assert_awaited_once()
