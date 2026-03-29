"""Tests for import cancellation: cancel endpoint, worker, delete guard.

Covers BGND-03 (cancel running import) and BGND-04 (concurrent
prevention -- verified by existing tests in test_import_confirm.py).
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.api.deps import get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.import_job import ImportJob, ImportStatus
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
IMPORT_ID = uuid.uuid4()
USER_ID = "user-cancel-1"


# --------------- helpers ---------------


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        org_id="org-cancel-test",
        role=CampaignRole.ADMIN,
        email="admin@test.com",
        display_name="Admin User",
    )


def _make_import_job(
    status: ImportStatus = ImportStatus.PROCESSING,
    *,
    cancelled_at=None,
) -> ImportJob:
    now = utcnow()
    job = ImportJob(
        id=IMPORT_ID,
        campaign_id=CAMPAIGN_ID,
        status=status,
        original_filename="voters.csv",
        source_type="csv",
        file_key=f"imports/{CAMPAIGN_ID}/{IMPORT_ID}/voters.csv",
        created_by=USER_ID,
        detected_columns=["first_name", "last_name"],
        suggested_mapping={
            "first_name": "first_name",
            "last_name": "last_name",
        },
        created_at=now,
        updated_at=now,
    )
    job.cancelled_at = cancelled_at
    return job


def _make_local_user() -> User:
    return User(
        id=USER_ID,
        display_name="Admin User",
        email="admin@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


@pytest.fixture()
def _mock_infra():
    """Mock StorageService, Procrastinate, and JWKSManager."""
    storage_mock = MagicMock()
    storage_mock.ensure_bucket = AsyncMock()

    procrastinate_mock = MagicMock()
    procrastinate_mock.open_async = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    from app.core.rate_limit import limiter

    original_enabled = limiter.enabled
    limiter.enabled = False

    with (
        patch(
            "app.services.storage.StorageService",
            return_value=storage_mock,
        ),
        patch(
            "app.tasks.procrastinate_app.procrastinate_app",
            procrastinate_mock,
        ),
        patch("app.core.security.JWKSManager"),
    ):
        yield

    limiter.enabled = original_enabled


@pytest.fixture()
def _mock_settings():
    """Patch settings with valid ZITADEL config."""
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_base_url = ""
        mock_s.zitadel_service_client_id = "client-id"
        mock_s.zitadel_service_client_secret = "client-secret"
        mock_s.cors_allowed_origins = ["*"]
        yield mock_s


def _build_app_with_overrides(mock_db: AsyncMock) -> object:
    """Create app with dependency overrides."""
    app = create_app()
    app.dependency_overrides[get_current_user] = _make_user

    async def _get_db():
        yield mock_db

    async def _get_campaign_db(campaign_id: uuid.UUID):
        yield mock_db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_campaign_db
    return app


async def _post_cancel(app):
    """POST to cancel endpoint and return the response."""
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        resp = await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/imports/{IMPORT_ID}/cancel",
        )
    return resp


async def _delete_import(app):
    """DELETE an import job and return the response."""
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        resp = await client.delete(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/imports/{IMPORT_ID}",
        )
    return resp


def _mock_db_for_endpoint(job, local_user):
    """Build a mock AsyncSession for endpoint tests."""
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=job)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )
    return mock_db


# --------------- endpoint tests ---------------


@pytest.mark.asyncio()
async def test_cancel_returns_202(
    _mock_settings,
    _mock_infra,
):
    """POST cancel on PROCESSING job returns 202 with cancelling status."""
    from app.services.zitadel import ZitadelService

    job = _make_import_job(ImportStatus.PROCESSING)
    local_user = _make_local_user()
    mock_db = _mock_db_for_endpoint(job, local_user)

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        app = _build_app_with_overrides(mock_db)
        resp = await _post_cancel(app)

    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "cancelling"
    assert data["cancelled_at"] is not None


@pytest.mark.asyncio()
async def test_cancel_queued_returns_202(
    _mock_settings,
    _mock_infra,
):
    """POST cancel on a QUEUED job returns 202 with status cancelling."""
    from app.services.zitadel import ZitadelService

    job = _make_import_job(ImportStatus.QUEUED)
    local_user = _make_local_user()
    mock_db = _mock_db_for_endpoint(job, local_user)

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        app = _build_app_with_overrides(mock_db)
        resp = await _post_cancel(app)

    assert resp.status_code == 202
    assert resp.json()["status"] == "cancelling"


@pytest.mark.asyncio()
async def test_cancel_wrong_status_409(
    _mock_settings,
    _mock_infra,
):
    """POST cancel on COMPLETED/FAILED/CANCELLED job returns 409."""
    from app.services.zitadel import ZitadelService

    local_user = _make_local_user()

    for bad_status in (
        ImportStatus.COMPLETED,
        ImportStatus.FAILED,
        ImportStatus.CANCELLED,
    ):
        job = _make_import_job(bad_status)
        mock_db = _mock_db_for_endpoint(job, local_user)

        with (
            patch.object(
                ZitadelService,
                "_get_token",
                new_callable=AsyncMock,
                return_value="tok",
            ),
            patch(
                "app.core.security.resolve_campaign_role",
                new_callable=AsyncMock,
                return_value=CampaignRole.ADMIN,
            ),
        ):
            app = _build_app_with_overrides(mock_db)
            resp = await _post_cancel(app)

        assert resp.status_code == 409, (
            f"Expected 409 for {bad_status}, got {resp.status_code}"
        )


@pytest.mark.asyncio()
async def test_cancel_not_found_404(
    _mock_settings,
    _mock_infra,
):
    """POST cancel on non-existent import_id returns 404."""
    from app.services.zitadel import ZitadelService

    local_user = _make_local_user()
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=None)
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        app = _build_app_with_overrides(mock_db)
        resp = await _post_cancel(app)

    assert resp.status_code == 404


@pytest.mark.asyncio()
async def test_delete_blocked_for_cancelling(
    _mock_settings,
    _mock_infra,
):
    """DELETE on a CANCELLING job returns 409."""
    from app.services.zitadel import ZitadelService

    job = _make_import_job(
        ImportStatus.CANCELLING,
        cancelled_at=utcnow(),
    )
    local_user = _make_local_user()
    mock_db = _mock_db_for_endpoint(job, local_user)

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        app = _build_app_with_overrides(mock_db)
        resp = await _delete_import(app)

    assert resp.status_code == 409
    assert "currently in progress" in resp.json()["detail"]


# --------------- worker / task tests ---------------


@pytest.mark.asyncio()
async def test_worker_stops_on_cancel():
    """Worker loop breaks when cancelled_at is set between batches."""
    from app.services.import_service import ImportService

    cancel_ts = utcnow()

    class MockJob:
        def __init__(self):
            self.campaign_id = CAMPAIGN_ID
            self.status = ImportStatus.PROCESSING
            self.cancelled_at = None
            self.imported_rows = 0
            self.skipped_rows = 0
            self.phones_created = 0
            self.total_rows = 0
            self.last_committed_row = 0
            self.file_key = "imports/test/voters.csv"
            self.field_mapping = {"first": "first_name"}
            self.error_report_key = None
            self.error_message = None

    mock_job = MockJob()

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()

    refresh_count = 0

    async def mock_refresh(obj):
        nonlocal refresh_count
        refresh_count += 1
        # After first batch, simulate cancel
        if refresh_count >= 1:
            obj.cancelled_at = cancel_ts

    mock_session.refresh = mock_refresh

    mock_storage = MagicMock()

    # Simulate streaming 3 rows (batch_size=1 means 3 batches)
    csv_lines = [
        "first_name,last_name",
        "Alice,Smith",
        "Bob,Jones",
        "Carol,White",
    ]

    batch_calls = []

    async def mock_process_batch(self, batch, batch_num, *args, **kwargs):
        batch_calls.append(batch_num)

    with (
        patch(
            "app.services.import_service.stream_csv_lines",
            return_value=_async_iter(csv_lines),
        ),
        patch("app.services.import_service.settings") as mock_settings,
        patch.object(
            ImportService,
            "_process_single_batch",
            mock_process_batch,
        ),
        patch.object(
            ImportService,
            "_merge_error_files",
            AsyncMock(),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
    ):
        mock_settings.import_batch_size = 1
        service = ImportService()
        await service.process_import_file(
            str(IMPORT_ID),
            mock_session,
            mock_storage,
            str(CAMPAIGN_ID),
        )

    # Should have processed batch 1 then detected cancel
    assert len(batch_calls) == 1, (
        f"Expected 1 batch call (then cancel), got {batch_calls}"
    )
    assert mock_job.status == ImportStatus.CANCELLED


@pytest.mark.asyncio()
async def test_worker_sets_cancelled_status():
    """Worker finalization sets CANCELLED when cancelled_at is set."""
    from app.services.import_service import ImportService

    cancel_ts = utcnow()

    class MockJob:
        def __init__(self):
            self.campaign_id = CAMPAIGN_ID
            self.status = ImportStatus.PROCESSING
            self.cancelled_at = None
            self.imported_rows = 0
            self.skipped_rows = 0
            self.phones_created = 0
            self.total_rows = 0
            self.last_committed_row = 0
            self.file_key = "imports/test/voters.csv"
            self.field_mapping = {"first": "first_name"}
            self.error_report_key = None
            self.error_message = None

    mock_job = MockJob()

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()

    refresh_count = 0

    async def mock_refresh(obj):
        nonlocal refresh_count
        refresh_count += 1
        # Simulate race: cancel arrives after loop completes normally
        # (no cancel during batch loop, but set at finalization refresh)
        if refresh_count >= 1:
            obj.cancelled_at = cancel_ts

    mock_session.refresh = mock_refresh

    # Empty CSV -- just a header, no data rows -> loop exits normally
    csv_lines = ["first_name,last_name"]

    with (
        patch(
            "app.services.import_service.stream_csv_lines",
            return_value=_async_iter(csv_lines),
        ),
        patch("app.services.import_service.settings") as mock_settings,
        patch.object(
            ImportService,
            "_process_single_batch",
            AsyncMock(),
        ),
        patch.object(
            ImportService,
            "_merge_error_files",
            AsyncMock(),
        ),
        patch(
            "app.services.import_service.commit_and_restore_rls",
            new_callable=AsyncMock,
        ),
    ):
        mock_settings.import_batch_size = 500
        service = ImportService()
        await service.process_import_file(
            str(IMPORT_ID),
            mock_session,
            MagicMock(),
            str(CAMPAIGN_ID),
        )

    # Finalization refresh sets cancelled_at -> status must be CANCELLED
    assert mock_job.status == ImportStatus.CANCELLED


@pytest.mark.asyncio()
async def test_cancel_queued_job_skips_processing():
    """Task pre-check skips processing for cancelled-while-queued jobs."""
    cancel_ts = utcnow()

    class MockJob:
        def __init__(self):
            self.campaign_id = uuid.UUID(str(CAMPAIGN_ID))
            self.status = ImportStatus.CANCELLING
            self.cancelled_at = cancel_ts
            self.last_committed_row = 0
            self.imported_rows = 0
            self.skipped_rows = 0

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

        await process_import(str(IMPORT_ID), str(CAMPAIGN_ID))

    # process_import_file should NOT have been called
    mock_service.process_import_file.assert_not_called()
    # Status should be set to CANCELLED
    assert mock_job.status == ImportStatus.CANCELLED
    # Session should have been committed
    mock_session.commit.assert_called()


# --------------- async iterator helper ---------------


async def _async_iter(items):
    """Yield items as an async iterator."""
    for item in items:
        yield item
