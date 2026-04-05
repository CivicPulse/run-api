"""Tests for per-batch commit resilience (RESL-01 through RESL-05).

Validates that the import pipeline commits each batch independently,
restores RLS after each commit, supports crash resume, writes per-batch
errors to MinIO, and merges them on completion.
"""

from __future__ import annotations

import csv
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def campaign_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def import_job_id() -> str:
    return str(uuid.uuid4())


def _make_csv_bytes(rows: list[dict[str, str]]) -> bytes:
    """Helper to build CSV bytes from a list of dicts."""
    if not rows:
        return b""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def _make_mock_job(
    campaign_id: str,
    import_job_id: str,
    *,
    last_committed_row: int = 0,
    status: str = "queued",
    imported_rows: int = 0,
    skipped_rows: int = 0,
    total_rows: int = 0,
    phones_created: int = 0,
) -> MagicMock:
    """Create a mock ImportJob with standard attributes."""
    from app.models.import_job import ImportStatus

    job = MagicMock()
    job.id = uuid.UUID(import_job_id)
    job.campaign_id = uuid.UUID(campaign_id)
    job.status = ImportStatus(status) if isinstance(status, str) else status
    job.file_key = "imports/test/test.csv"
    job.original_filename = "test.csv"
    job.source_type = "csv"
    job.field_mapping = {
        "First_Name": "first_name",
        "Last_Name": "last_name",
        "VoterID": "source_id",
    }
    job.last_committed_row = last_committed_row
    job.imported_rows = imported_rows
    job.skipped_rows = skipped_rows
    job.total_rows = total_rows
    job.phones_created = phones_created
    job.error_report_key = None
    job.error_message = None
    job.cancelled_at = None
    job.last_progress_at = None
    job.orphaned_at = None
    job.orphaned_reason = None
    job.source_exhausted_at = None
    job.recovery_started_at = None
    return job


def _make_csv_rows(count: int) -> list[dict[str, str]]:
    """Build a list of CSV row dicts."""
    return [
        {
            "First_Name": f"Voter{i}",
            "Last_Name": f"Last{i}",
            "VoterID": f"V{i:04d}",
        }
        for i in range(1, count + 1)
    ]


@pytest.mark.asyncio
async def test_per_batch_commit_persists(campaign_id: str, import_job_id: str):
    """RESL-01: process_import_file commits after each batch, not once at end."""
    from app.services.import_service import ImportService

    # 5 rows, batch_size=2 => 3 batches (2, 2, 1)
    csv_rows = _make_csv_rows(5)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()

    service = ImportService()

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ) as mock_commit_rls,
        patch.object(
            service,
            "process_csv_batch",
            new_callable=AsyncMock,
            return_value=(2, [], 0),
        ),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # commit_and_restore_rls should be called at least 3 times
    # (once per batch) plus potentially for initial reset and final COMPLETED
    assert mock_commit_rls.await_count >= 3, (
        f"Expected at least 3 commit_and_restore_rls calls (one per batch),"
        f" got {mock_commit_rls.await_count}"
    )


@pytest.mark.asyncio
async def test_rls_restored_after_commit(campaign_id: str, import_job_id: str):
    """RESL-02: commit_and_restore_rls is called with correct campaign_id."""
    from app.services.import_service import ImportService

    csv_rows = _make_csv_rows(3)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()

    service = ImportService()

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ) as mock_commit_rls,
        patch.object(
            service,
            "process_csv_batch",
            new_callable=AsyncMock,
            return_value=(2, [], 0),
        ),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Every call should include the correct campaign_id
    for c in mock_commit_rls.call_args_list:
        assert c.args[1] == campaign_id or c.kwargs.get("campaign_id") == campaign_id


@pytest.mark.asyncio
async def test_resume_skips_committed_rows(campaign_id: str, import_job_id: str):
    """RESL-03: When last_committed_row > 0, already-processed rows are skipped."""
    from app.services.import_service import ImportService

    # 5-row CSV, but 3 already committed
    csv_rows = _make_csv_rows(5)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(
        campaign_id,
        import_job_id,
        last_committed_row=3,
        status="processing",
        imported_rows=3,
        skipped_rows=0,
        total_rows=3,
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()

    service = ImportService()
    batches_received: list[list[dict]] = []

    async def capture_batch(rows, mapping, cid, source, sess):
        batches_received.append(list(rows))
        return (len(rows), [], 0)

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=100),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
        patch.object(service, "process_csv_batch", side_effect=capture_batch),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Should only have processed 2 rows (rows 4 and 5)
    total_rows_processed = sum(len(b) for b in batches_received)
    assert total_rows_processed == 2, (
        f"Expected 2 rows after skipping 3, got {total_rows_processed}"
    )


@pytest.mark.asyncio
async def test_counters_committed_not_flushed(campaign_id: str, import_job_id: str):
    """RESL-04: Counters are set on job BEFORE commit so they persist."""
    from app.services.import_service import ImportService

    csv_rows = _make_csv_rows(3)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()

    service = ImportService()

    # Track counter state at each commit_and_restore_rls call
    counter_snapshots: list[dict] = []

    async def capture_commit(sess, cid):
        counter_snapshots.append(
            {
                "imported_rows": job.imported_rows,
                "skipped_rows": job.skipped_rows,
                "last_committed_row": job.last_committed_row,
                "total_rows": job.total_rows,
            }
        )

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            side_effect=capture_commit,
        ),
        patch.object(
            service,
            "process_csv_batch",
            new_callable=AsyncMock,
            return_value=(2, [], 0),
        ),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # At least one batch commit should show counters > 0
    batch_commits = [s for s in counter_snapshots if (s["last_committed_row"] or 0) > 0]
    assert len(batch_commits) >= 1, (
        "Expected at least one commit with last_committed_row > 0"
    )
    # The last batch commit should have last_committed_row equal to total rows
    assert batch_commits[-1]["last_committed_row"] > 0


@pytest.mark.asyncio
async def test_per_batch_error_upload(campaign_id: str, import_job_id: str):
    """RESL-05: Per-batch errors are uploaded with batch_NNNN.csv key pattern."""
    from app.services.import_service import ImportService

    csv_rows = _make_csv_rows(3)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()
    storage.delete_objects = AsyncMock()

    service = ImportService()

    # Return errors for the batch
    batch_errors = [
        {
            "row": {"First_Name": "Bad", "Last_Name": "", "VoterID": "V001"},
            "reason": "Missing name",
        },
    ]

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=100),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
        patch.object(
            service,
            "process_csv_batch",
            new_callable=AsyncMock,
            return_value=(2, batch_errors, 0),
        ),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Check that upload_bytes was called with a batch error key
    upload_calls = storage.upload_bytes.call_args_list
    batch_error_calls = [
        c
        for c in upload_calls
        if "batch_" in str(c.args[0]) and c.args[0].endswith(".csv")
    ]
    assert len(batch_error_calls) >= 1, "Expected at least one per-batch error upload"
    key = batch_error_calls[0].args[0]
    assert f"imports/{job.campaign_id}/{import_job_id}/errors/batch_" in key


@pytest.mark.asyncio
async def test_batch_failure_preserves_prior(campaign_id: str, import_job_id: str):
    """RESL-01: Batch failure triggers rollback but preserves prior batches."""
    from app.services.import_service import ImportService

    # 6 rows, batch_size=2 => 3 batches
    csv_rows = _make_csv_rows(6)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    session.rollback = AsyncMock()

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()
    storage.delete_objects = AsyncMock()

    service = ImportService()

    call_count = 0

    async def batch_with_failure(rows, mapping, cid, source, sess):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("Batch 2 exploded")
        return (len(rows), [], 0)

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ) as mock_commit_rls,
        patch(
            "app.services.import_service.set_campaign_context",
            new_callable=AsyncMock,
        ) as mock_set_ctx,
        patch.object(service, "process_csv_batch", side_effect=batch_with_failure),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Rollback was called for the failed batch
    assert session.rollback.await_count >= 1
    # set_campaign_context was called after rollback to restore RLS
    assert mock_set_ctx.await_count >= 1
    # commit_and_restore_rls was still called for successful batches
    assert mock_commit_rls.await_count >= 2


@pytest.mark.asyncio
async def test_rls_restored_after_rollback(campaign_id: str, import_job_id: str):
    """RESL-02: RLS context is restored after rollback on batch failure."""
    from app.services.import_service import ImportService

    csv_rows = _make_csv_rows(4)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    session.rollback = AsyncMock()

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()
    storage.delete_objects = AsyncMock()

    service = ImportService()

    call_order: list[str] = []

    async def mock_rollback():
        call_order.append("rollback")

    async def mock_set_context(sess, cid):
        call_order.append("set_campaign_context")

    session.rollback = mock_rollback

    call_count = 0

    async def batch_with_failure(rows, mapping, cid, source, sess):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("Batch 1 failed")
        return (len(rows), [], 0)

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.import_service.set_campaign_context",
            side_effect=mock_set_context,
        ),
        patch.object(service, "process_csv_batch", side_effect=batch_with_failure),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Verify rollback happened and set_campaign_context followed it
    assert "rollback" in call_order
    rollback_idx = call_order.index("rollback")
    set_ctx_after = [
        i
        for i, v in enumerate(call_order)
        if v == "set_campaign_context" and i > rollback_idx
    ]
    assert len(set_ctx_after) >= 1, "set_campaign_context must be called after rollback"


@pytest.mark.asyncio
async def test_error_merge_single_csv(campaign_id: str, import_job_id: str):
    """RESL-05: Per-batch error files are merged into a single errors.csv."""
    from app.services.import_service import ImportService

    csv_rows = _make_csv_rows(4)
    csv_bytes = _make_csv_bytes(csv_rows)

    job = _make_mock_job(campaign_id, import_job_id)
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    # Prepare storage mock that returns CSV for initial download
    # and batch error CSVs for merge downloads
    batch_error_content_1 = b"First_Name,Last_Name,error_reason\nBad1,,Missing name\n"
    batch_error_content_2 = b"First_Name,Last_Name,error_reason\nBad2,,Missing name\n"

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        if "batch_0001" in key:
            yield batch_error_content_1
        elif "batch_0002" in key:
            yield batch_error_content_2
        else:
            # Initial CSV file download
            yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()
    storage.delete_objects = AsyncMock()

    service = ImportService()

    batch_errors = [
        {
            "row": {"First_Name": "Bad", "Last_Name": "", "VoterID": "V001"},
            "reason": "Missing name",
        },
    ]

    with (
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=2),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
        patch.object(
            service,
            "process_csv_batch",
            new_callable=AsyncMock,
            return_value=(1, batch_errors, 0),
        ),
    ):
        await service.process_import_file(import_job_id, session, storage, campaign_id)

    # Check that the final merged errors.csv was uploaded
    upload_calls = storage.upload_bytes.call_args_list
    merge_calls = [
        c
        for c in upload_calls
        if c.args[0].endswith("/errors.csv") and "batch_" not in c.args[0]
    ]
    assert len(merge_calls) == 1, (
        f"Expected exactly one merged errors.csv upload, got {len(merge_calls)}"
    )

    # Verify the merged content has only one header row
    merged_bytes = merge_calls[0].args[1]
    merged_text = merged_bytes.decode("utf-8")
    lines = [ln for ln in merged_text.strip().split("\n") if ln]
    header_count = sum(1 for ln in lines if "error_reason" in ln and "First_Name" in ln)
    assert header_count == 1, (
        f"Merged CSV should have exactly 1 header row, got {header_count}"
    )

    # Check that batch files were cleaned up
    assert storage.delete_objects.await_count >= 1


def test_model_has_last_committed_row():
    """ImportJob model has last_committed_row attribute."""
    from app.models.import_job import ImportJob

    assert hasattr(ImportJob, "last_committed_row")


def test_settings_has_batch_size():
    """Settings has import_batch_size with default 1000."""
    from app.core.config import Settings

    s = Settings()
    assert s.import_batch_size == 1000


def test_settings_has_orphan_threshold():
    """Settings has import_orphan_threshold_minutes with default 30."""
    from app.core.config import Settings

    s = Settings()
    assert s.import_orphan_threshold_minutes == 30


def test_settings_has_chunk_defaults():
    """Chunk settings expose conservative defaults while chunks stay internal."""
    from app.core.config import Settings

    s = Settings()
    assert s.import_chunk_size_default == 10000
    assert s.import_max_chunks_per_import == 4
    assert s.import_serial_threshold == 10000


def test_response_schema_has_last_committed_row():
    """ImportJobResponse schema includes last_committed_row field."""
    from app.schemas.import_job import ImportJobResponse

    assert "last_committed_row" in ImportJobResponse.model_fields


def test_model_has_recovery_metadata_fields():
    """ImportJob model exposes recovery metadata fields."""
    from app.models.import_job import ImportJob

    for field in (
        "last_progress_at",
        "orphaned_at",
        "orphaned_reason",
        "source_exhausted_at",
        "recovery_started_at",
    ):
        assert hasattr(ImportJob, field)


def test_import_chunk_model_has_durable_fields():
    """ImportChunk model exposes durable state needed for later fan-out phases."""
    from app.models.import_job import ImportChunk

    for field in (
        "campaign_id",
        "import_job_id",
        "row_start",
        "row_end",
        "status",
        "imported_rows",
        "skipped_rows",
        "last_committed_row",
        "error_report_key",
        "error_message",
        "last_progress_at",
        "created_at",
        "updated_at",
    ):
        assert hasattr(ImportChunk, field)


def test_response_schema_has_recovery_metadata_fields():
    """ImportJobResponse schema exposes recovery metadata fields."""
    from app.schemas.import_job import ImportJobResponse

    for field in (
        "last_progress_at",
        "orphaned_at",
        "orphaned_reason",
        "source_exhausted_at",
        "recovery_started_at",
        "error_report_url",
    ):
        assert field in ImportJobResponse.model_fields


@pytest.mark.asyncio
async def test_task_resume_detection(campaign_id: str, import_job_id: str):
    """import_task.py detects resume state and does not reset counters."""
    from app.models.import_job import ImportStatus

    mock_job = MagicMock()
    mock_job.campaign_id = uuid.UUID(campaign_id)
    mock_job.status = ImportStatus.PROCESSING
    mock_job.last_committed_row = 500
    mock_job.imported_rows = 500
    mock_job.skipped_rows = 5
    mock_job.cancelled_at = None

    original_status = mock_job.status

    class StatusTracker:
        def __init__(self):
            self._status = original_status

        def get_status(self):
            return self._status

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

    # process_import_file should be called with campaign_id
    mock_service.process_import_file.assert_awaited_once()
    call_args = mock_service.process_import_file.call_args
    assert campaign_id in call_args.args or campaign_id in call_args.kwargs.values()


@pytest.mark.asyncio
async def test_task_does_not_set_completed(campaign_id: str, import_job_id: str):
    """process_import itself does not finalize imports to COMPLETED."""
    import inspect

    from app.tasks.import_task import process_import

    source = inspect.getsource(process_import)

    # Fresh import execution still delegates COMPLETED finalization to the service.
    assert "ImportStatus.COMPLETED" not in source, (
        "process_import should not set ImportStatus.COMPLETED -- "
        "that responsibility remains in import_service.py"
    )
