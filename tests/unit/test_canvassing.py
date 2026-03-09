"""Unit tests for door-knock recording and contact tracking -- CANV-04, CANV-05."""

from __future__ import annotations

import pytest


class TestCanvassService:
    """Tests for door knock recording, entry status updates, and contact attempt tracking."""

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_record_door_knock(self) -> None:
        """CANV-04: Record door knock creates interaction."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_door_knock_updates_entry_status(self) -> None:
        """CANV-04: Entry auto-set to visited."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_door_knock_increments_visited_count(self) -> None:
        """CANV-04: Walk list visited_entries incremented."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_contact_attempts(self) -> None:
        """CANV-05: Multiple knocks tracked per voter."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-02")
    def test_attempt_number_derived(self) -> None:
        """CANV-05: Attempt number computed from event count."""
        raise NotImplementedError
