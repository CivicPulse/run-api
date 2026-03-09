"""Unit tests for Do Not Call list management -- PHONE-05."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.dnc import DNCReason, DoNotCallEntry


def _make_dnc_entry(**overrides) -> MagicMock:
    """Create a mock DoNotCallEntry with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "phone_number": "5551234567",
        "reason": DNCReason.MANUAL,
        "added_by": "user-1",
        "added_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    entry = MagicMock(spec=DoNotCallEntry)
    for k, v in defaults.items():
        setattr(entry, k, v)
    return entry


class TestDNCManagement:
    """Tests for DNC entry CRUD operations."""

    @pytest.mark.asyncio
    async def test_add_dnc_entry(self) -> None:
        """Manual add of phone number to DNC list."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        # No existing entry
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=existing_result)

        result = await svc.add_entry(
            session, campaign_id, "5551234567", DNCReason.MANUAL, "user-1"
        )

        assert result is not None
        assert result.phone_number == "5551234567"
        assert result.reason == DNCReason.MANUAL
        session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_add_dnc_duplicate_ignored(self) -> None:
        """Duplicate phone_number + campaign_id returns existing (no error)."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        existing_entry = _make_dnc_entry(
            campaign_id=campaign_id, phone_number="5551234567"
        )
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = existing_entry
        session.execute = AsyncMock(return_value=existing_result)

        result = await svc.add_entry(
            session, campaign_id, "5551234567", DNCReason.MANUAL, "user-1"
        )

        assert result.id == existing_entry.id
        session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_delete_dnc_entry(self) -> None:
        """Remove phone number from DNC list."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()

        entry = _make_dnc_entry()
        get_result = MagicMock()
        get_result.scalar_one_or_none.return_value = entry
        session.execute = AsyncMock(return_value=get_result)

        await svc.delete_entry(session, entry.id)

        session.delete.assert_called_once_with(entry)

    @pytest.mark.asyncio
    async def test_check_dnc(self) -> None:
        """Check if phone is on DNC list -- True case."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        entry = _make_dnc_entry(campaign_id=campaign_id, phone_number="5551234567")
        check_result = MagicMock()
        check_result.scalar_one_or_none.return_value = entry
        session.execute = AsyncMock(return_value=check_result)

        result = await svc.check_number(session, campaign_id, "5551234567")

        assert result.is_dnc is True
        assert result.entry is not None

    @pytest.mark.asyncio
    async def test_check_dnc_not_found(self) -> None:
        """Check if phone is on DNC list -- False case."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        check_result = MagicMock()
        check_result.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=check_result)

        result = await svc.check_number(session, campaign_id, "5559999999")

        assert result.is_dnc is False
        assert result.entry is None


class TestDNCBulkImport:
    """Tests for bulk DNC import operations."""

    @pytest.mark.asyncio
    async def test_bulk_import_csv(self) -> None:
        """Import CSV with phone_number column, reports stats."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        csv_content = (
            "phone_number,reason\n"
            "5551111111,manual\n"
            "5552222222,registry_import\n"
        )

        # No existing entries for any phone
        no_existing = MagicMock()
        no_existing.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=no_existing)

        result = await svc.bulk_import(session, campaign_id, csv_content, "user-1")

        assert result.added == 2
        assert result.skipped == 0
        assert result.invalid == 0

    @pytest.mark.asyncio
    async def test_bulk_import_invalid_phones(self) -> None:
        """Invalid phones reported as invalid count."""
        from app.services.dnc import DNCService

        svc = DNCService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        csv_content = "phone_number\n123\n5551234567\nabc\n"

        no_existing = MagicMock()
        no_existing.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=no_existing)

        result = await svc.bulk_import(session, campaign_id, csv_content, "user-1")

        assert result.added == 1  # Only 5551234567 is valid
        assert result.invalid == 2  # 123 and abc
