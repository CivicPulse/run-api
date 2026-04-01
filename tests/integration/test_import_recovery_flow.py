"""Integration-style recovery flow coverage without external services."""

from __future__ import annotations

import csv
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_job import ImportStatus
from app.services.import_service import ImportService


def _make_csv_rows(count: int) -> list[dict[str, str]]:
    return [
        {
            "First_Name": f"Voter{i}",
            "Last_Name": f"Last{i}",
            "VoterID": f"V{i:04d}",
        }
        for i in range(1, count + 1)
    ]


def _make_csv_bytes(rows: list[dict[str, str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_recover_import_resumes_remaining_rows_without_duplicates():
    """Recovery task resumes from last_committed_row and only processes new rows."""
    import_job_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())

    job = MagicMock()
    job.id = uuid.UUID(import_job_id)
    job.campaign_id = uuid.UUID(campaign_id)
    job.status = ImportStatus.PROCESSING
    job.file_key = "imports/test/recovery.csv"
    job.original_filename = "recovery.csv"
    job.source_type = "csv"
    job.field_mapping = {
        "First_Name": "first_name",
        "Last_Name": "last_name",
        "VoterID": "source_id",
    }
    job.last_committed_row = 3
    job.imported_rows = 3
    job.skipped_rows = 0
    job.total_rows = 3
    job.phones_created = 0
    job.error_report_key = None
    job.error_message = None
    job.cancelled_at = None
    job.last_progress_at = None
    job.orphaned_at = None
    job.orphaned_reason = None
    job.source_exhausted_at = None
    job.recovery_started_at = None

    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()

    session_factory = AsyncMock()
    session_factory.__aenter__ = AsyncMock(return_value=session)
    session_factory.__aexit__ = AsyncMock(return_value=False)

    csv_rows = _make_csv_rows(5)
    csv_bytes = _make_csv_bytes(csv_rows)
    storage = AsyncMock()

    async def mock_download(_key, chunk_size=65_536):
        del chunk_size
        yield csv_bytes

    storage.download_file = mock_download
    storage.upload_bytes = AsyncMock()
    storage.delete_objects = AsyncMock()

    processed_ids: list[str] = []
    service = ImportService()

    async def capture_batch(rows, mapping, cid, source, sess):
        del mapping, cid, source, sess
        processed_ids.extend(row["VoterID"] for row in rows)
        return (len(rows), [], 0)

    with (
        patch(
            "app.tasks.import_task.async_session_factory",
            return_value=session_factory,
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
        patch("app.tasks.import_task.StorageService", return_value=storage),
        patch("app.tasks.import_task.ImportService", return_value=service),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.import_service.settings",
            MagicMock(import_batch_size=100),
        ),
        patch.object(service, "process_csv_batch", side_effect=capture_batch),
    ):
        from app.tasks.import_task import recover_import

        await recover_import(import_job_id, campaign_id)

    assert processed_ids == ["V0004", "V0005"]
    assert len(processed_ids) == len(set(processed_ids))
    assert job.last_committed_row == 5
    assert job.total_rows == 5
    assert job.imported_rows == 5
    assert job.status == ImportStatus.COMPLETED
    assert job.source_exhausted_at is not None
