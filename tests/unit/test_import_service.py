"""Unit tests for ImportService CSV processing."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects.postgresql import dialect as pg_dialect

from app.core.config import settings
from app.models.import_job import (
    ImportChunkStatus,
    ImportChunkTaskStatus,
    ImportStatus,
)
from app.services.import_service import (
    ImportService,
    _phone_conflict_sort_key,
    _voter_conflict_sort_key,
    calculate_effective_rows_per_write,
    count_csv_data_rows,
    plan_chunk_ranges,
    should_use_serial_import,
)
from app.services.storage import StorageService


class TestDetectColumns:
    """Tests for detect_columns method."""

    def test_detect_utf8_csv_columns(self):
        """Detects columns from UTF-8 CSV content."""
        content = b"First_Name,Last_Name,City,State\nJohn,Doe,Austin,TX\n"
        service = ImportService()
        columns = service.detect_columns(content)
        assert columns == ["First_Name", "Last_Name", "City", "State"]

    def test_detect_latin1_csv_columns(self):
        """Detects columns from Latin-1 encoded CSV content."""
        # Latin-1 encoded header with accented character
        content = "Pr\xe9nom,Nom,Ville\nJean,Dupont,Paris\n".encode("latin-1")
        service = ImportService()
        columns = service.detect_columns(content)
        assert columns[0] == "Pr\xe9nom"
        assert columns[1] == "Nom"
        assert columns[2] == "Ville"

    def test_detect_empty_csv(self):
        """Returns empty list for empty CSV."""
        service = ImportService()
        columns = service.detect_columns(b"")
        assert columns == []

    def test_detect_columns_strips_bom(self):
        """Handles UTF-8 BOM prefix correctly."""
        bom_content = b"\xef\xbb\xbfFirst_Name,Last_Name\nJohn,Doe\n"
        service = ImportService()
        columns = service.detect_columns(bom_content)
        assert columns == ["First_Name", "Last_Name"]


class TestChunkSizingHelpers:
    """Tests for bind-limit-aware chunk sizing helpers."""

    def test_calculate_effective_rows_per_write_respects_bind_limit(self):
        """High mapped-column counts clamp rows below the default chunk size."""
        effective_rows = calculate_effective_rows_per_write(
            mapped_column_count=400,
            target_rows=settings.import_chunk_size_default,
        )

        assert effective_rows == 81
        assert effective_rows < settings.import_chunk_size_default

    def test_plan_chunk_ranges_creates_multiple_ranges(self):
        """Large imports split into deterministic 1-based inclusive ranges."""
        ranges = plan_chunk_ranges(
            total_rows=25_000,
            mapped_column_count=0,
            chunk_size_default=settings.import_chunk_size_default,
        )

        assert ranges == [
            (1, 8_191),
            (8_192, 16_382),
            (16_383, 24_573),
            (24_574, 25_000),
        ]

    def test_plan_chunk_ranges_returns_empty_for_zero_rows(self):
        """Non-positive totals do not create chunk ranges."""
        assert (
            plan_chunk_ranges(0, mapped_column_count=10, chunk_size_default=500) == []
        )

    def test_plan_chunk_ranges_changes_for_different_file_sizes(self):
        """Same row counts split differently for materially different file sizes."""
        large_file_ranges = plan_chunk_ranges(
            total_rows=12_000,
            mapped_column_count=8,
            chunk_size_default=4_000,
            file_size_bytes=24_000_000,
        )
        small_file_ranges = plan_chunk_ranges(
            total_rows=12_000,
            mapped_column_count=8,
            chunk_size_default=4_000,
            file_size_bytes=1_200_000,
        )

        assert large_file_ranges != small_file_ranges
        assert len(large_file_ranges) > len(small_file_ranges)

    def test_plan_chunk_ranges_keeps_bind_limit_for_wide_files(self):
        """File-size hints never exceed the asyncpg bind-parameter ceiling."""
        ranges = plan_chunk_ranges(
            total_rows=25_000,
            mapped_column_count=400,
            chunk_size_default=settings.import_chunk_size_default,
            file_size_bytes=500_000,
        )

        assert ranges[0] == (1, 81)

    @pytest.mark.parametrize(
        ("total_rows", "expected"),
        [
            (None, True),
            (5_000, True),
            (20_000, False),
        ],
    )
    def test_should_use_serial_import(self, total_rows, expected):
        """Unknown and below-threshold totals stay on the serial path."""
        assert (
            should_use_serial_import(total_rows, settings.import_serial_threshold)
            is expected
        )


class TestChunkOrderingHelpers:
    """Tests for deterministic conflict-key ordering helpers."""

    def test_voter_conflict_sort_key_uses_upsert_target(self):
        """Voter ordering matches the ON CONFLICT key used in batch upserts."""
        assert _voter_conflict_sort_key(
            {
                "campaign_id": "campaign-b",
                "source_type": "csv",
                "source_id": "row-7",
            }
        ) == ("campaign-b", "csv", "row-7")

    def test_phone_conflict_sort_key_uses_phone_uniqueness_contract(self):
        """Phone ordering matches the VoterPhone uniqueness contract."""
        assert _phone_conflict_sort_key(
            {
                "campaign_id": "campaign-a",
                "voter_id": "voter-2",
                "value": "+15551234567",
            }
        ) == ("campaign-a", "voter-2", "+15551234567")


class TestPhase60SharedImportSeam:
    """Tests for the shared row-bounded import engine."""

    @pytest.mark.asyncio
    async def test_count_csv_data_rows_skips_header(self, monkeypatch):
        """Pre-scan counts only 1-based data rows after the header."""

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in (
                "First_Name,Last_Name",
                "Ada,Lovelace",
                "Grace,Hopper",
                "Katherine,Johnson",
            ):
                yield line

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )

        total_rows = await count_csv_data_rows(MagicMock(), "imports/test.csv")

        assert total_rows == 3

    @pytest.mark.asyncio
    async def test_process_import_range_honors_absolute_row_bounds(self, monkeypatch):
        """Ranged processing skips before row_start and stops after row_end."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name", "Last_Name": "last_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 0
        job.skipped_rows = 0
        job.total_rows = 0
        job.phones_created = 0
        job.last_committed_row = 0
        job.cancelled_at = None

        lines = (
            "First_Name,Last_Name",
            "Ada,Lovelace",
            "Grace,Hopper",
            "Katherine,Johnson",
            "Annie,Easley",
        )

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in lines:
                yield line

        processed_batches: list[tuple[int, list[dict[str, str]], dict[str, int]]] = []
        commit_calls: list[str] = []

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            _batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            assert progress_target is _job
            processed_batches.append((batch_num, list(batch), dict(counters)))
            counters["total_imported"] += len(batch)
            _job.total_rows = counters["total_rows"]
            _job.imported_rows = counters["total_imported"]
            _job.skipped_rows = counters["total_skipped"]
            _job.phones_created = counters["total_phones_created"]
            _job.last_committed_row = counters["last_absolute_row"]

        async def fake_commit_and_restore_rls(_session, campaign_id):
            commit_calls.append(campaign_id)

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            fake_commit_and_restore_rls,
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)

        session = AsyncMock()
        storage = MagicMock()

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=session,
            storage=storage,
            campaign_id=str(job.campaign_id),
            row_start=2,
            row_end=3,
        )

        assert processed_batches == [
            (
                1,
                [
                    {"First_Name": "Grace", "Last_Name": "Hopper"},
                    {"First_Name": "Katherine", "Last_Name": "Johnson"},
                ],
                {
                    "total_rows": 2,
                    "total_imported": 0,
                    "total_skipped": 0,
                    "total_phones_created": 0,
                    "phone_manifest": [],
                    "geometry_manifest": [],
                    "last_absolute_row": 3,
                },
            )
        ]
        assert job.total_rows == 2
        assert job.imported_rows == 2
        assert job.last_committed_row == 3
        assert job.processing_started_at is not None
        assert commit_calls

    @pytest.mark.asyncio
    async def test_process_import_file_delegates_to_full_range_engine(
        self, monkeypatch
    ):
        """Serial wrapper delegates to the shared engine with full-file bounds."""
        service = ImportService()
        import_job_id = str(uuid.uuid4())
        campaign_id = str(uuid.uuid4())
        job = MagicMock()

        session = AsyncMock()
        session.get = AsyncMock(return_value=job)
        storage = MagicMock()

        delegated_calls: list[dict] = []

        async def fake_process_import_range(**kwargs):
            delegated_calls.append(kwargs)

        monkeypatch.setattr(service, "process_import_range", fake_process_import_range)

        await service.process_import_file(
            import_job_id=import_job_id,
            session=session,
            storage=storage,
            campaign_id=campaign_id,
        )

        assert delegated_calls == [
            {
                "job": job,
                "import_job_id": import_job_id,
                "session": session,
                "storage": storage,
                "campaign_id": campaign_id,
                "row_start": 1,
                "row_end": None,
                "chunk": None,
            }
        ]

    @pytest.mark.asyncio
    async def test_process_import_range_updates_chunk_progress_only(self, monkeypatch):
        """Chunk progress stays on ImportChunk and leaves parent counters untouched."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name", "Last_Name": "last_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 17
        job.skipped_rows = 4
        job.total_rows = 999
        job.phones_created = 12
        job.last_committed_row = 88
        job.cancelled_at = None
        job.error_report_key = None
        job.error_message = "old job error"

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
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
        chunk.error_message = "old chunk error"
        chunk.last_progress_at = None

        lines = (
            "First_Name,Last_Name",
            "Ada,Lovelace",
            "Grace,Hopper",
            "Katherine,Johnson",
        )

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in lines:
                yield line

        processed_batches: list[tuple[str, int]] = []
        merged_error_calls: list[list[str]] = []
        commit_campaign_ids: list[str] = []

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            processed_batches.append((_error_prefix, batch_num))
            counters["total_imported"] += len(batch)
            progress_target.imported_rows = counters["total_imported"]
            progress_target.skipped_rows = counters["total_skipped"]
            progress_target.last_committed_row = 3
            batch_error_keys.append("chunk-error-key")

        async def fake_commit_and_restore_rls(_session, campaign_id):
            commit_campaign_ids.append(campaign_id)

        async def fake_merge_error_files(
            _storage, batch_error_keys, target, import_job_id
        ):
            del _storage, import_job_id
            merged_error_calls.append(list(batch_error_keys))
            target.error_report_key = "merged-chunk-errors.csv"

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            fake_commit_and_restore_rls,
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)
        monkeypatch.setattr(service, "_merge_error_files", fake_merge_error_files)

        session = AsyncMock()
        storage = MagicMock()

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=session,
            storage=storage,
            campaign_id=str(job.campaign_id),
            row_start=2,
            row_end=3,
            chunk=chunk,
        )

        assert processed_batches == [
            (
                f"imports/{job.campaign_id}/{job.id}/chunks/{chunk.id}/errors/",
                1,
            )
        ]
        assert merged_error_calls == [["chunk-error-key"]]
        assert chunk.status == ImportChunkStatus.PROCESSING
        assert chunk.imported_rows == 2
        assert chunk.skipped_rows == 0
        assert chunk.phones_created == 0
        assert chunk.last_committed_row == 3
        assert chunk.error_report_key == "merged-chunk-errors.csv"
        assert chunk.error_message is None
        assert chunk.last_progress_at is not None
        assert job.imported_rows == 17
        assert job.skipped_rows == 4
        assert job.total_rows == 999
        assert job.phones_created == 12
        assert job.last_committed_row == 88
        assert commit_campaign_ids

    @pytest.mark.asyncio
    async def test_process_import_range_persists_chunk_secondary_manifests(
        self, monkeypatch
    ):
        """Chunk primary processing persists deferred phone and geometry manifests."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Cell": "__cell_phone",
        }
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 17
        job.skipped_rows = 4
        job.total_rows = 999
        job.phones_created = 12
        job.last_committed_row = 88
        job.cancelled_at = None
        job.error_report_key = None
        job.error_message = None

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
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

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in (
                "First_Name,Last_Name,Cell",
                "Ada,Lovelace,5551234567",
                "Grace,Hopper,5551239999",
            ):
                yield line

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            _batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            del batch, batch_num, campaign_id
            assert progress_target is chunk
            counters["total_imported"] += 2
            counters["phone_manifest"].extend(
                [{"voter_id": "v-1", "value": "+15551234567"}]
            )
            counters["geometry_manifest"].extend(["v-1", "v-2"])
            progress_target.imported_rows = counters["total_imported"]
            progress_target.skipped_rows = counters["total_skipped"]
            progress_target.phone_manifest = counters["phone_manifest"]
            progress_target.geometry_manifest = counters["geometry_manifest"]
            progress_target.last_committed_row = counters["last_absolute_row"]

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            AsyncMock(),
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=AsyncMock(),
            storage=MagicMock(),
            campaign_id=str(job.campaign_id),
            row_start=1,
            row_end=2,
            chunk=chunk,
        )

        assert chunk.phones_created == 0
        assert chunk.imported_rows == 2
        assert chunk.phone_manifest == [{"voter_id": "v-1", "value": "+15551234567"}]
        assert chunk.geometry_manifest == ["v-1", "v-2"]
        assert job.phones_created == 12
        assert job.imported_rows == 17

    @pytest.mark.asyncio
    async def test_process_import_range_initializes_chunk_phone_counter_only(
        self, monkeypatch
    ):
        """Chunk targets start phones_created at zero without touching the parent."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 1
        job.skipped_rows = 2
        job.total_rows = 3
        job.phones_created = 9
        job.last_committed_row = 0
        job.cancelled_at = None

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
        chunk.status = ImportChunkStatus.QUEUED
        chunk.imported_rows = None
        chunk.skipped_rows = None
        chunk.phones_created = None
        chunk.phone_task_status = None
        chunk.geometry_task_status = None
        chunk.phone_task_error = None
        chunk.geometry_task_error = None
        chunk.phone_manifest = None
        chunk.geometry_manifest = None
        chunk.last_committed_row = None
        chunk.error_report_key = "old.csv"
        chunk.error_message = "old error"
        chunk.last_progress_at = None

        captured_chunk_start: dict[str, object] = {}

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in ("First_Name", "Ada"):
                yield line

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            _batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            del batch, batch_num, _job, campaign_id, _session, _storage
            del _error_prefix, _batch_error_keys
            captured_chunk_start["phones_created"] = progress_target.phones_created
            captured_chunk_start["imported_rows"] = progress_target.imported_rows
            captured_chunk_start["phone_manifest"] = progress_target.phone_manifest
            counters["total_imported"] += 1
            progress_target.imported_rows = counters["total_imported"]
            progress_target.skipped_rows = counters["total_skipped"]
            progress_target.last_committed_row = counters["last_absolute_row"]

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            AsyncMock(),
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=AsyncMock(),
            storage=MagicMock(),
            campaign_id=str(job.campaign_id),
            row_start=1,
            row_end=1,
            chunk=chunk,
        )

        assert captured_chunk_start == {
            "phones_created": 0,
            "imported_rows": 0,
            "phone_manifest": [],
        }
        assert job.phones_created == 9

    @pytest.mark.asyncio
    async def test_process_import_range_uses_chunk_error_prefix_on_failure(
        self, monkeypatch
    ):
        """Chunk batch failures write chunk-scoped errors and fail only the chunk."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 0
        job.skipped_rows = 0
        job.total_rows = 0
        job.phones_created = 0
        job.last_committed_row = 0
        job.cancelled_at = None

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
        chunk.status = ImportChunkStatus.QUEUED
        chunk.imported_rows = 0
        chunk.skipped_rows = 0
        chunk.last_committed_row = 0
        chunk.error_report_key = None
        chunk.error_message = None
        chunk.last_progress_at = None

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in ("First_Name", "Ada", "Grace"):
                yield line

        async def fake_process_single_batch(*args, **kwargs):
            del args, kwargs
            raise RuntimeError("chunk batch exploded")

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)

        commit_calls: list[str] = []

        async def fake_commit_and_restore_rls(_session, campaign_id):
            commit_calls.append(campaign_id)

        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            fake_commit_and_restore_rls,
        )

        session = AsyncMock()
        storage = MagicMock()

        with pytest.raises(RuntimeError, match="chunk batch exploded"):
            await service.process_import_range(
                job=job,
                import_job_id=str(job.id),
                session=session,
                storage=storage,
                campaign_id=str(job.campaign_id),
                row_start=1,
                row_end=2,
                chunk=chunk,
            )

        assert chunk.status == ImportChunkStatus.FAILED
        assert chunk.error_message == "chunk batch exploded"
        assert chunk.error_report_key is None
        assert job.status != "failed"
        assert commit_calls

    @pytest.mark.asyncio
    async def test_process_import_range_marks_chunk_cancelled_at_batch_boundary(
        self, monkeypatch
    ):
        """Chunk imports stop after a committed batch when parent cancellation lands."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 0
        job.skipped_rows = 0
        job.total_rows = 0
        job.phones_created = 0
        job.last_committed_row = 0
        job.cancelled_at = None

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
        chunk.status = ImportChunkStatus.QUEUED
        chunk.imported_rows = 0
        chunk.skipped_rows = 0
        chunk.phones_created = 0
        chunk.last_committed_row = 0
        chunk.error_report_key = None
        chunk.error_message = None
        chunk.last_progress_at = None

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in ("First_Name", "Ada", "Grace"):
                yield line

        batch_calls: list[int] = []
        commit_calls: list[str] = []

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            _batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            del batch_num, _job, _session, _storage, _error_prefix, _batch_error_keys
            batch_calls.append(len(batch))
            counters["total_imported"] += len(batch)
            progress_target.imported_rows = counters["total_imported"]
            progress_target.skipped_rows = counters["total_skipped"]
            progress_target.phones_created = counters["total_phones_created"]
            progress_target.last_committed_row = counters["last_absolute_row"]
            job.cancelled_at = object()
            assert campaign_id == str(job.campaign_id)

        async def fake_commit_and_restore_rls(_session, campaign_id):
            commit_calls.append(campaign_id)

        session = AsyncMock()
        session.refresh = AsyncMock(side_effect=lambda model: model)

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            fake_commit_and_restore_rls,
        )

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=session,
            storage=MagicMock(),
            campaign_id=str(job.campaign_id),
            row_start=1,
            row_end=2,
            chunk=chunk,
        )

        assert batch_calls == [2]
        assert chunk.status == ImportChunkStatus.CANCELLED
        assert chunk.imported_rows == 2
        assert chunk.last_committed_row == 2
        assert chunk.error_message is None
        assert commit_calls

    @pytest.mark.asyncio
    async def test_process_import_range_resumes_chunk_from_last_committed_row(
        self, monkeypatch
    ):
        """Chunk retries skip committed rows and preserve cumulative counters."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.campaign_id = uuid.uuid4()
        job.field_mapping = {"First_Name": "first_name"}
        job.source_type = "csv"
        job.file_key = "imports/test.csv"
        job.imported_rows = 0
        job.skipped_rows = 0
        job.total_rows = 0
        job.phones_created = 0
        job.last_committed_row = 0
        job.cancelled_at = None

        chunk = MagicMock()
        chunk.id = uuid.uuid4()
        chunk.status = ImportChunkStatus.PROCESSING
        chunk.imported_rows = 2
        chunk.skipped_rows = 0
        chunk.phones_created = 0
        chunk.last_committed_row = 2
        chunk.error_report_key = None
        chunk.error_message = None
        chunk.last_progress_at = None

        async def fake_stream_csv_lines(_storage, _file_key):
            for line in ("First_Name", "Ada", "Grace", "Katherine", "Annie"):
                yield line

        processed_rows: list[list[str]] = []

        async def fake_process_single_batch(
            batch,
            batch_num,
            _job,
            campaign_id,
            _session,
            _storage,
            _error_prefix,
            _batch_error_keys,
            counters,
            *,
            progress_target,
        ):
            del batch_num, _job, _session, _storage, _error_prefix, _batch_error_keys
            processed_rows.append([row["First_Name"] for row in batch])
            counters["total_imported"] += len(batch)
            progress_target.imported_rows = counters["total_imported"]
            progress_target.skipped_rows = counters["total_skipped"]
            progress_target.phones_created = counters["total_phones_created"]
            progress_target.last_committed_row = counters["last_absolute_row"]
            assert campaign_id == str(job.campaign_id)

        monkeypatch.setattr(
            "app.services.import_service.stream_csv_lines",
            fake_stream_csv_lines,
        )
        monkeypatch.setattr(service, "_process_single_batch", fake_process_single_batch)
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            AsyncMock(),
        )

        session = AsyncMock()
        session.refresh = AsyncMock(side_effect=lambda model: model)

        await service.process_import_range(
            job=job,
            import_job_id=str(job.id),
            session=session,
            storage=MagicMock(),
            campaign_id=str(job.campaign_id),
            row_start=1,
            row_end=4,
            chunk=chunk,
        )

        assert processed_rows == [["Katherine", "Annie"]]
        assert chunk.imported_rows == 4
        assert chunk.last_committed_row == 4
        assert chunk.status == ImportChunkStatus.PROCESSING

    def test_import_status_exposes_completed_with_errors(self):
        """Partial-success finalization can target a durable terminal status."""
        assert ImportStatus.COMPLETED_WITH_ERRORS.value == "completed_with_errors"

    @pytest.mark.asyncio
    async def test_maybe_finalize_chunked_import_skips_non_terminal_chunks(
        self, monkeypatch
    ):
        """Parent finalization waits until every chunk is terminal."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = ImportStatus.PROCESSING

        monkeypatch.setattr(
            service,
            "_try_claim_chunk_finalization_lock",
            AsyncMock(return_value=True),
        )
        monkeypatch.setattr(
            service,
            "_get_chunk_finalization_summary",
            AsyncMock(
                return_value=type(
                    "Summary",
                    (),
                    {
                        "total_chunks": 2,
                        "terminal_chunks": 1,
                        "completed_chunks": 1,
                        "failed_chunks": 0,
                        "cancelled_chunks": 0,
                        "imported_rows": 4,
                        "skipped_rows": 0,
                        "phones_created": 1,
                        "error_keys": [],
                    },
                )()
            ),
        )
        merge_mock = AsyncMock()
        monkeypatch.setattr(service, "_merge_error_files", merge_mock)
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            AsyncMock(),
        )

        session = AsyncMock()
        finalized = await service.maybe_finalize_chunked_import(
            session=session,
            storage=MagicMock(),
            job=job,
            campaign_id=str(uuid.uuid4()),
        )

        assert finalized is False
        assert job.status == ImportStatus.PROCESSING
        merge_mock.assert_not_awaited()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("completed", "failed", "expected_status"),
        [
            (1, 1, ImportStatus.COMPLETED_WITH_ERRORS),
            (0, 2, ImportStatus.FAILED),
            (2, 0, ImportStatus.COMPLETED),
        ],
    )
    async def test_maybe_finalize_chunked_import_sets_parent_totals_and_status(
        self, monkeypatch, completed, failed, expected_status
    ):
        """Locked fan-in derives parent status and totals from chunk rows."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = ImportStatus.PROCESSING

        summary = type(
            "Summary",
            (),
            {
                "total_chunks": completed + failed,
                "terminal_chunks": completed + failed,
                "completed_chunks": completed,
                "failed_chunks": failed,
                "cancelled_chunks": 0,
                "imported_rows": 9,
                "skipped_rows": 3,
                "phones_created": 2,
                "error_keys": ["chunks/errors.csv"] if failed else [],
            },
        )()

        monkeypatch.setattr(
            service,
            "_try_claim_chunk_finalization_lock",
            AsyncMock(return_value=True),
        )
        monkeypatch.setattr(
            service,
            "_get_chunk_finalization_summary",
            AsyncMock(return_value=summary),
        )
        merge_mock = AsyncMock()
        monkeypatch.setattr(service, "_merge_error_files", merge_mock)
        commit_mock = AsyncMock()
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            commit_mock,
        )

        campaign_id = str(uuid.uuid4())
        finalized = await service.maybe_finalize_chunked_import(
            session=AsyncMock(),
            storage=MagicMock(),
            job=job,
            campaign_id=campaign_id,
        )

        assert finalized is True
        assert job.imported_rows == 9
        assert job.skipped_rows == 3
        assert job.phones_created == 2
        assert job.status == expected_status
        if failed:
            merge_mock.assert_awaited_once()
            assert "error" in job.error_message.lower()
        else:
            merge_mock.assert_not_awaited()
            assert job.error_message is None
        commit_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_maybe_finalize_chunked_import_marks_parent_cancelled(
        self, monkeypatch
    ):
        """Cancelled chunk sets fan in to a cancelled parent when user cancel won."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = ImportStatus.PROCESSING
        job.cancelled_at = object()

        summary = type(
            "Summary",
            (),
            {
                "total_chunks": 2,
                "terminal_chunks": 2,
                "completed_chunks": 1,
                "failed_chunks": 0,
                "cancelled_chunks": 1,
                "imported_rows": 5,
                "skipped_rows": 0,
                "phones_created": 1,
                "error_keys": [],
            },
        )()

        monkeypatch.setattr(
            service,
            "_try_claim_chunk_finalization_lock",
            AsyncMock(return_value=True),
        )
        monkeypatch.setattr(
            service,
            "_get_chunk_finalization_summary",
            AsyncMock(return_value=summary),
        )
        monkeypatch.setattr(service, "_merge_error_files", AsyncMock())
        commit_mock = AsyncMock()
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            commit_mock,
        )

        finalized = await service.maybe_finalize_chunked_import(
            session=AsyncMock(),
            storage=MagicMock(),
            job=job,
            campaign_id=str(uuid.uuid4()),
        )

        assert finalized is True
        assert job.status == ImportStatus.CANCELLED
        assert "cancelled" in job.error_message.lower()
        commit_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_maybe_finalize_chunked_import_returns_when_lock_is_lost(
        self, monkeypatch
    ):
        """Lock losers do not mutate the parent import."""
        service = ImportService()
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = ImportStatus.PROCESSING
        job.imported_rows = 0
        job.skipped_rows = 0
        job.phones_created = 0

        monkeypatch.setattr(
            service,
            "_try_claim_chunk_finalization_lock",
            AsyncMock(return_value=False),
        )
        summary_mock = AsyncMock()
        monkeypatch.setattr(service, "_get_chunk_finalization_summary", summary_mock)
        monkeypatch.setattr(
            "app.services.import_service.commit_and_restore_rls",
            AsyncMock(),
        )

        finalized = await service.maybe_finalize_chunked_import(
            session=AsyncMock(),
            storage=MagicMock(),
            job=job,
            campaign_id=str(uuid.uuid4()),
        )

        assert finalized is False
        assert job.status == ImportStatus.PROCESSING
        summary_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_maybe_complete_chunk_passes_gate_for_cancelled_chunk():
    """Cancelled chunk with CANCELLED secondary statuses passes terminal gate."""
    from app.core.time import utcnow

    service = ImportService()

    chunk = MagicMock()
    chunk.phone_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.geometry_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.phone_task_error = None
    chunk.geometry_task_error = None

    job = MagicMock()
    job.cancelled_at = utcnow()
    job.status = "cancelling"

    mock_finalize = AsyncMock(return_value=True)
    service.maybe_finalize_chunked_import = mock_finalize

    result = await service.maybe_complete_chunk_after_secondary_tasks(
        session=AsyncMock(),
        storage=MagicMock(),
        job=job,
        chunk=chunk,
        campaign_id="test-campaign",
    )

    assert result is True
    mock_finalize.assert_awaited_once()


@pytest.mark.asyncio
async def test_maybe_complete_chunk_rejects_cancelled_chunk_with_none_secondary_statuses():  # noqa: E501
    """Cancelled chunk with None secondary statuses does NOT pass terminal gate."""
    from app.core.time import utcnow

    service = ImportService()

    chunk = MagicMock()
    chunk.phone_task_status = None
    chunk.geometry_task_status = None
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.phone_task_error = None
    chunk.geometry_task_error = None

    job = MagicMock()
    job.cancelled_at = utcnow()
    job.status = "cancelling"

    mock_finalize = AsyncMock(return_value=True)
    service.maybe_finalize_chunked_import = mock_finalize

    result = await service.maybe_complete_chunk_after_secondary_tasks(
        session=AsyncMock(),
        storage=MagicMock(),
        job=job,
        chunk=chunk,
        campaign_id="test-campaign",
    )

    assert result is False
    mock_finalize.assert_not_awaited()


class TestProcessCsvBatch:
    """Tests for process_csv_batch method."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.fixture
    def basic_mapping(self):
        return {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "City": "registration_city",
            "VoterID": "source_id",
        }

    def test_apply_mapping_to_rows(self, service, campaign_id, basic_mapping):
        """Maps CSV columns to canonical voter fields."""
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "City": "Austin",
                "VoterID": "V001",
            },
        ]
        mapped = service.apply_field_mapping(rows, basic_mapping, campaign_id, "csv")
        assert len(mapped) == 1
        voter = mapped[0]["voter"]
        assert voter["first_name"] == "John"
        assert voter["last_name"] == "Doe"
        assert voter["registration_city"] == "Austin"
        assert voter["source_id"] == "V001"

    def test_unmapped_columns_go_to_extra_data(self, service, campaign_id):
        """Columns not in mapping go to extra_data JSONB."""
        mapping = {"First_Name": "first_name", "Custom_Field": None}
        rows = [
            {"First_Name": "John", "Custom_Field": "custom_value"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = mapped[0]["voter"]
        assert voter["extra_data"]["Custom_Field"] == "custom_value"

    def test_skip_rows_missing_name_fields(self, service, campaign_id):
        """Rows without first_name AND last_name are skipped."""
        mapping = {"City": "registration_city", "VoterID": "source_id"}
        rows = [
            {"City": "Austin", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        # Row has neither first_name nor last_name
        assert len(mapped) == 1
        assert mapped[0].get("error") is not None

    def test_row_with_first_name_only_is_valid(self, service, campaign_id):
        """Row with first_name but no last_name passes validation."""
        mapping = {"First_Name": "first_name", "VoterID": "source_id"}
        rows = [
            {"First_Name": "John", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert mapped[0].get("error") is None
        assert mapped[0]["voter"]["first_name"] == "John"

    def test_row_with_last_name_only_is_valid(self, service, campaign_id):
        """Row with last_name but no first_name passes validation."""
        mapping = {"Last_Name": "last_name", "VoterID": "source_id"}
        rows = [
            {"Last_Name": "Doe", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert mapped[0].get("error") is None
        assert mapped[0]["voter"]["last_name"] == "Doe"

    def test_campaign_id_and_source_type_added(
        self, service, campaign_id, basic_mapping
    ):
        """campaign_id and source_type are set on every voter dict."""
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "City": "Austin",
                "VoterID": "V001",
            },
        ]
        mapped = service.apply_field_mapping(rows, basic_mapping, campaign_id, "l2")
        voter = mapped[0]["voter"]
        assert voter["campaign_id"] == campaign_id
        assert voter["source_type"] == "l2"

    def test_empty_rows_batch(self, service, campaign_id, basic_mapping):
        """Empty batch returns no results."""
        mapped = service.apply_field_mapping([], basic_mapping, campaign_id, "csv")
        assert mapped == []

    def test_extra_data_only_includes_unmapped_non_empty(self, service, campaign_id):
        """extra_data excludes empty string values from unmapped columns."""
        mapping = {"First_Name": "first_name", "Notes": None, "Empty": None}
        rows = [
            {"First_Name": "John", "Notes": "some note", "Empty": ""},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = mapped[0]["voter"]
        assert "Notes" in voter["extra_data"]
        # Empty strings are excluded from extra_data
        assert "Empty" not in voter["extra_data"]

    @pytest.mark.asyncio
    async def test_process_csv_batch_orders_voters_by_conflict_key(
        self, service, campaign_id, monkeypatch
    ):
        """Voter upserts use deterministic conflict-key ordering, not input order."""
        captured_voter_values: list[dict] = []

        class FakeInsert:
            def __init__(self, values):
                self._values = values
                self.excluded = type(
                    "Excluded",
                    (),
                    {"__getattr__": lambda _self, name: name},
                )()

            def values(self, values):
                captured_voter_values.extend(values)
                self._values = values
                return self

            def on_conflict_do_update(self, **kwargs):
                del kwargs
                return self

            def returning(self, *_args, **_kwargs):
                return self

        monkeypatch.setattr(
            "app.services.import_service.insert",
            lambda _model: FakeInsert([]),
        )
        monkeypatch.setattr(
            service,
            "apply_field_mapping",
            lambda *_args, **_kwargs: [
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-b",
                    }
                },
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-a",
                    }
                },
            ],
        )

        session = AsyncMock()
        session.execute = AsyncMock(return_value=MagicMock(all=lambda: []))
        session.flush = AsyncMock()

        imported, errors, phones = await service.process_csv_batch(
            [{"Source": "row-b"}, {"Source": "row-a"}],
            {"Source": "source_id"},
            campaign_id,
            "csv",
            session,
        )

        assert imported == 2
        assert errors == []
        assert phones == 0
        assert [row["source_id"] for row in captured_voter_values] == [
            "row-a",
            "row-b",
        ]


class TestUpsertSetClause:
    """Tests for the fixed SET clause and RETURNING in process_csv_batch."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_upsert_set_clause_all_columns(self, service, campaign_id):
        """SET clause is derived from Voter model columns, not first row keys.

        Even when the first batch row lacks propensity_general, the SET
        clause must still include it because it comes from Voter.__table__.columns.
        """
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "VoterID": "V001"},
        ]

        captured_stmts: list = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(uuid.uuid4(),)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

        # First execute call is the INSERT/upsert; second is the geom UPDATE
        assert len(captured_stmts) >= 1
        compiled = captured_stmts[0].compile(dialect=pg_dialect())
        sql_text = str(compiled)

        # Verify propensity_general is in the SET clause even though
        # the first row didn't have it -- proves we derive from model columns
        assert "propensity_general" in sql_text
        assert "voting_history" in sql_text

        # Verify excluded identity columns are NOT in the SET clause params
        # (id, campaign_id, source_type, source_id, created_at, geom are excluded)
        for excluded in ("geom",):
            assert f"SET {excluded}" not in sql_text.upper().replace('"', "")

    @pytest.mark.asyncio
    async def test_returning_clause_present(self, service, campaign_id):
        """Upsert statement includes RETURNING voters.id."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "Jane", "Last_Name": "Doe", "VoterID": "V002"},
        ]

        captured_stmts: list = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(uuid.uuid4(),)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

        # First execute call is the INSERT/upsert
        assert len(captured_stmts) >= 1
        compiled = captured_stmts[0].compile(dialect=pg_dialect())
        sql_text = str(compiled)
        assert "RETURNING" in sql_text.upper()

    @pytest.mark.asyncio
    async def test_process_csv_batch_orders_voters_by_conflict_key(
        self, service, campaign_id, monkeypatch
    ):
        """Voter upserts use deterministic conflict-key ordering, not input order."""
        captured_voter_values: list[dict] = []

        class FakeInsert:
            def __init__(self, values):
                self._values = values
                self.excluded = type(
                    "Excluded",
                    (),
                    {"__getattr__": lambda _self, name: name},
                )()

            def values(self, values):
                captured_voter_values.extend(values)
                self._values = values
                return self

            def on_conflict_do_update(self, **kwargs):
                del kwargs
                return self

            def returning(self, *_args, **_kwargs):
                return self

        monkeypatch.setattr(
            "app.services.import_service.insert",
            lambda _model: FakeInsert([]),
        )
        monkeypatch.setattr(
            service,
            "apply_field_mapping",
            lambda *_args, **_kwargs: [
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-b",
                    }
                },
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-a",
                    }
                },
            ],
        )

        session = AsyncMock()
        session.execute = AsyncMock(return_value=MagicMock(all=lambda: []))
        session.flush = AsyncMock()

        imported, errors, phones = await service.process_csv_batch(
            [{"Source": "row-b"}, {"Source": "row-a"}],
            {"Source": "source_id"},
            campaign_id,
            "csv",
            session,
        )

        assert imported == 2
        assert errors == []
        assert phones == 0
        assert [row["source_id"] for row in captured_voter_values] == [
            "row-a",
            "row-b",
        ]

    @pytest.mark.asyncio
    async def test_process_csv_batch_returns_three_tuple(self, service, campaign_id):
        """process_csv_batch returns (count, errors, phones_created)."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "VoterID": "V001"},
        ]

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [(uuid.uuid4(),)]
        session.execute = AsyncMock(return_value=mock_result)

        result = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        assert len(result) == 3
        imported, errors, phones = result
        assert imported == 1
        assert errors == []
        assert phones == 0  # No phone data in this batch


class TestApplyFieldMappingEnhancements:
    """Tests for phone routing, propensity parsing,
    and voting history in apply_field_mapping."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    def test_cell_phone_routing_in_apply_field_mapping(self, service, campaign_id):
        """__cell_phone mapped column routes to phone_value."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Cell": "__cell_phone",
            "VoterID": "source_id",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "Cell": "555-123-4567",
                "VoterID": "V001",
            },
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        result = results[0]

        # phone_value should be on the result dict
        assert result["phone_value"] == "555-123-4567"
        # phone_value should NOT be in the voter dict
        assert "phone_value" not in result["voter"]
        assert "__cell_phone" not in result["voter"]
        # phone_value should NOT be in extra_data
        assert "Cell" not in result["voter"]["extra_data"]

    def test_cell_phone_empty_value_not_routed(self, service, campaign_id):
        """Empty __cell_phone value does not create phone_value key."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Cell": "__cell_phone",
        }
        rows = [{"First_Name": "John", "Last_Name": "Doe", "Cell": ""}]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert "phone_value" not in results[0]

    def test_propensity_parsing_in_apply_field_mapping(self, service, campaign_id):
        """Propensity strings like '77%' are parsed to ints."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Gen_Score": "propensity_general",
            "Pri_Score": "propensity_primary",
            "Comb_Score": "propensity_combined",
        }
        rows = [
            {
                "First_Name": "Jane",
                "Last_Name": "Doe",
                "Gen_Score": "77%",
                "Pri_Score": "42",
                "Comb_Score": "Not Eligible",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        assert voter["propensity_general"] == 77
        assert voter["propensity_primary"] == 42
        assert voter["propensity_combined"] is None

    def test_voting_history_parsing_in_apply_field_mapping(self, service, campaign_id):
        """CSV rows with General_YYYY/Primary_YYYY columns
        produce voting_history array."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "General_2024": "Y",
                "Primary_2022": "A",
                "General_2020": "N",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        assert voter["voting_history"] == ["General_2024", "Primary_2022"]

    def test_voting_history_not_set_when_no_columns(self, service, campaign_id):
        """When no General_/Primary_ columns exist, voting_history is not set."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        # voting_history should NOT be present -- avoids
        # wiping existing data on re-import
        assert "voting_history" not in voter


class TestPhoneCreationInBatch:
    """Tests for VoterPhone creation in process_csv_batch."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_phone_creation_skipped_on_bad_number(self, service, campaign_id):
        """Bad phone number (e.g. '123') does not prevent voter import."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "123",
            },
        ]

        voter_id = uuid.uuid4()
        call_count = 0

        async def capture_execute(stmt, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        imported, errors, phones = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        # Voter should be imported
        assert imported == 1
        assert errors == []
        # Phone should NOT be created (bad number)
        assert phones == 0
        # Two execute calls: voter upsert + geom UPDATE, no phone upsert
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_phone_creation_with_valid_number(self, service, campaign_id):
        """Valid phone number creates a phone record after voter upsert."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "(555) 123-4567",
            },
        ]

        voter_id = uuid.uuid4()
        captured_stmts = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        imported, errors, phones = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        assert imported == 1
        assert errors == []
        assert phones == 1
        # Two execute calls: voter upsert + phone upsert
        assert len(captured_stmts) == 3  # voter upsert + geom UPDATE + phone upsert

    @pytest.mark.asyncio
    async def test_is_primary_excluded_from_phone_upsert_set(
        self, service, campaign_id
    ):
        """Phone upsert ON CONFLICT SET clause does NOT include is_primary."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "555-123-4567",
            },
        ]

        voter_id = uuid.uuid4()
        captured_stmts = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

        # The second statement is the phone upsert
        assert len(captured_stmts) == 3  # voter upsert + geom UPDATE + phone upsert
        phone_stmt = captured_stmts[1]
        compiled = phone_stmt.compile(dialect=pg_dialect())
        sql_text = str(compiled)

        # The ON CONFLICT SET clause should NOT reference is_primary
        # Split at ON CONFLICT to examine only the SET portion
        on_conflict_part = (
            sql_text.upper().split("ON CONFLICT")[1]
            if "ON CONFLICT" in sql_text.upper()
            else ""
        )
        assert "IS_PRIMARY" not in on_conflict_part

    @pytest.mark.asyncio
    async def test_process_csv_batch_orders_phone_upserts_deterministically(
        self, service, campaign_id, monkeypatch
    ):
        """Phone rows are ordered on their uniqueness contract before upsert."""
        voter_ids = [uuid.uuid4(), uuid.uuid4()]
        captured_phone_values: list[dict] = []

        class FakeInsert:
            def __init__(self, values):
                self._values = values
                self.excluded = type(
                    "Excluded",
                    (),
                    {"__getattr__": lambda _self, name: name},
                )()

            def values(self, values):
                if values and "voter_id" in values[0]:
                    captured_phone_values.extend(values)
                self._values = values
                return self

            def on_conflict_do_update(self, **kwargs):
                del kwargs
                return self

            def returning(self, *_args, **_kwargs):
                return self

        monkeypatch.setattr(
            "app.services.import_service.insert",
            lambda _model: FakeInsert([]),
        )
        monkeypatch.setattr(
            service,
            "apply_field_mapping",
            lambda *_args, **_kwargs: [
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-b",
                    },
                    "phone_value": "5551239999",
                },
                {
                    "voter": {
                        "campaign_id": campaign_id,
                        "source_type": "csv",
                        "source_id": "row-a",
                    },
                    "phone_value": "5551234567",
                },
            ],
        )

        session = AsyncMock()
        session.execute = AsyncMock(
            side_effect=[
                MagicMock(all=lambda: [(voter_ids[1],), (voter_ids[0],)]),
                MagicMock(),
                MagicMock(),
            ]
        )
        session.flush = AsyncMock()

        imported, errors, phones_created = await service.process_csv_batch(
            [{"Source": "row-b"}, {"Source": "row-a"}],
            {"Source": "source_id"},
            campaign_id,
            "csv",
            session,
        )

        assert imported == 2
        assert errors == []
        assert phones_created == 2
        assert captured_phone_values == sorted(
            captured_phone_values,
            key=_phone_conflict_sort_key,
        )


@pytest.mark.asyncio
async def test_storage_service_get_object_size_reads_content_length(monkeypatch):
    """Object metadata lookup returns S3 ContentLength as an integer."""
    storage = StorageService()
    head_object = AsyncMock(return_value={"ContentLength": "12345"})

    class FakeClient:
        async def __aenter__(self):
            return MagicMock(head_object=head_object)

        async def __aexit__(self, exc_type, exc, tb):
            del exc_type, exc, tb
            return False

    monkeypatch.setattr(storage.session, "client", lambda **_: FakeClient())

    size = await storage.get_object_size("imports/file.csv")

    assert size == 12345
    head_object.assert_awaited_once_with(
        Bucket=settings.s3_bucket,
        Key="imports/file.csv",
    )
