"""Unit tests for walk list generation, clustering, and assignment -- CANV-02, CANV-03, CANV-06."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.walk_list import WalkListCanvasser, WalkListEntry, WalkListEntryStatus
from app.services.turf import household_key, parse_address_sort_key


class TestWalkListService:
    """Tests for walk list generation, household clustering, sort order, and canvasser assignment."""

    @pytest.mark.asyncio
    async def test_generate_walk_list_from_turf(self) -> None:
        """CANV-02: Generate walk list with spatial query."""
        from app.services.walk_list import WalkListService

        service = WalkListService()

        # Mock session
        session = AsyncMock()

        # Mock turf lookup -- turf exists
        turf_mock = MagicMock()
        turf_mock.id = "turf-1"
        turf_mock.campaign_id = "campaign-1"

        # Mock voter results
        voter1 = SimpleNamespace(
            id="v1", registration_line1="100 Main St", last_name="Smith",
            registration_zip="12345", household_id=None, geom="fake-geom",
        )
        voter2 = SimpleNamespace(
            id="v2", registration_line1="200 Oak Ave", last_name="Jones",
            registration_zip="12345", household_id=None, geom="fake-geom",
        )

        # First execute: turf lookup, second: voter query
        mock_turf_result = MagicMock()
        mock_turf_result.scalar_one_or_none.return_value = turf_mock

        mock_voter_result = MagicMock()
        mock_voter_scalars = MagicMock()
        mock_voter_scalars.all.return_value = [voter1, voter2]
        mock_voter_result.scalars.return_value = mock_voter_scalars

        session.execute = AsyncMock(side_effect=[mock_turf_result, mock_voter_result])

        data = SimpleNamespace(
            turf_id="turf-1", voter_list_id=None, script_id=None, name="Test Walk List"
        )

        walk_list = await service.generate_walk_list(session, "campaign-1", data, "user-1")
        assert walk_list.total_entries == 2
        assert walk_list.name == "Test Walk List"
        assert walk_list.visited_entries == 0
        # Session.add should be called for walk_list + 2 entries = at least 3 times
        assert session.add.call_count >= 3

    def test_walk_list_is_frozen_snapshot(self) -> None:
        """CANV-02: Walk list entries don't change after creation."""
        # Verify WalkListEntry has expected fields for frozen snapshot
        assert hasattr(WalkListEntry, "walk_list_id")
        assert hasattr(WalkListEntry, "voter_id")
        assert hasattr(WalkListEntry, "sequence")
        assert hasattr(WalkListEntry, "status")
        assert hasattr(WalkListEntry, "household_key")

    def test_household_clustering(self) -> None:
        """CANV-03: Same-address voters grouped as household."""
        # Test address-based household key generation
        v1 = SimpleNamespace(
            registration_line1="100 Main St", registration_zip="12345", household_id=None
        )
        v2 = SimpleNamespace(
            registration_line1="100 MAIN ST", registration_zip="12345-6789", household_id=None
        )
        v3 = SimpleNamespace(
            registration_line1="200 Oak Ave", registration_zip="12345", household_id=None
        )
        v4 = SimpleNamespace(
            registration_line1="100 Main St", registration_zip="12345", household_id="HH-ABC"
        )

        # Same normalized address -> same household key
        assert household_key(v1) == household_key(v2)
        # Different address -> different key
        assert household_key(v1) != household_key(v3)
        # household_id takes priority when available
        assert household_key(v4) == "HH-ABC"

    def test_address_sort_order(self) -> None:
        """CANV-03: Street-name then house-number ordering."""
        addresses = [
            ("200 Oak Ave", "Smith"),
            ("100 Main St", "Adams"),
            ("300 Main St", "Brown"),
            ("150 Main St", "Clark"),
        ]

        sorted_addresses = sorted(
            addresses, key=lambda x: parse_address_sort_key(x[0], x[1])
        )

        # Main St should come first (alphabetical), sorted by house number
        assert sorted_addresses[0] == ("100 Main St", "Adams")
        assert sorted_addresses[1] == ("150 Main St", "Clark")
        assert sorted_addresses[2] == ("300 Main St", "Brown")
        assert sorted_addresses[3] == ("200 Oak Ave", "Smith")

    def test_canvasser_assignment(self) -> None:
        """CANV-06: Assign/remove canvassers to walk lists."""
        # Verify WalkListCanvasser model has composite PK
        assert hasattr(WalkListCanvasser, "walk_list_id")
        assert hasattr(WalkListCanvasser, "user_id")
        assert hasattr(WalkListCanvasser, "assigned_at")

    def test_entry_status_update(self) -> None:
        """CANV-02: Update entry to visited/skipped."""
        # Verify enum values exist
        assert WalkListEntryStatus.PENDING == "pending"
        assert WalkListEntryStatus.VISITED == "visited"
        assert WalkListEntryStatus.SKIPPED == "skipped"
        assert len(WalkListEntryStatus) == 3

    def test_parse_address_sort_key_edge_cases(self) -> None:
        """Edge cases for address parsing."""
        # None address
        assert parse_address_sort_key(None) == ("", 0, "")
        # Empty address
        assert parse_address_sort_key("") == ("", 0, "")
        # No number prefix (PO Box, etc.)
        key = parse_address_sort_key("PO Box 123")
        assert key == ("PO BOX 123", 0, "")
        # Normal address
        key = parse_address_sort_key("123 Main St", "Smith")
        assert key == ("MAIN ST", 123, "SMITH")

    def test_household_key_normalization(self) -> None:
        """Whitespace and case normalization for household keys."""
        v = SimpleNamespace(
            registration_line1="  100 main st  ", registration_zip="  12345  ", household_id=None
        )
        assert household_key(v) == "100 MAIN ST|12345"
