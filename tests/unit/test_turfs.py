"""Unit tests for Turf CRUD and GeoJSON validation -- CANV-01."""

from __future__ import annotations

import pytest


class TestTurfService:
    """Tests for turf creation, listing, status transitions, and spatial voter counts."""

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_create_turf_valid_geojson(self) -> None:
        """CANV-01: Create turf with valid GeoJSON polygon."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_create_turf_invalid_geojson_rejected(self) -> None:
        """CANV-01: Invalid polygon raises error."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_list_turfs_by_campaign(self) -> None:
        """CANV-01: List turfs filtered by campaign."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_update_turf_status_transitions(self) -> None:
        """CANV-01: Valid status transitions enforced."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_get_voter_count_in_turf(self) -> None:
        """CANV-01: Spatial voter containment count."""
        raise NotImplementedError
