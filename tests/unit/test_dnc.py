"""Unit tests for Do Not Call list management -- PHONE-05."""

from __future__ import annotations

import pytest


class TestDNCManagement:
    """Tests for DNC entry CRUD operations."""

    @pytest.mark.skip(reason="stub")
    def test_add_dnc_entry(self) -> None:
        """Manual add of phone number to DNC list."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_add_dnc_duplicate_ignored(self) -> None:
        """Duplicate phone_number + campaign_id skipped."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_auto_flag_refused(self) -> None:
        """PHONE-05: refused call auto-creates DNC entry."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_delete_dnc_entry(self) -> None:
        """Remove phone number from DNC list."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_check_dnc(self) -> None:
        """Check if phone is on DNC list."""
        raise NotImplementedError


class TestDNCBulkImport:
    """Tests for bulk DNC import operations."""

    @pytest.mark.skip(reason="stub")
    def test_bulk_import_csv(self) -> None:
        """Import CSV with phone_number column, reports stats."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_bulk_import_invalid_phones(self) -> None:
        """Invalid phones reported as invalid count."""
        raise NotImplementedError
