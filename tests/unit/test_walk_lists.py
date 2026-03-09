"""Unit tests for walk list generation, clustering, and assignment -- CANV-02, CANV-03, CANV-06."""

from __future__ import annotations

import pytest


class TestWalkListService:
    """Tests for walk list generation, household clustering, sort order, and canvasser assignment."""

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_generate_walk_list_from_turf(self) -> None:
        """CANV-02: Generate walk list with spatial query."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_walk_list_is_frozen_snapshot(self) -> None:
        """CANV-02: Walk list entries don't change after creation."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_household_clustering(self) -> None:
        """CANV-03: Same-address voters grouped as household."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_address_sort_order(self) -> None:
        """CANV-03: Street-name then house-number ordering."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_canvasser_assignment(self) -> None:
        """CANV-06: Assign/remove canvassers to walk lists."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_entry_status_update(self) -> None:
        """CANV-02: Update entry to visited/skipped."""
        raise NotImplementedError
