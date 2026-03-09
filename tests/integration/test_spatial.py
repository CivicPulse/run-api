"""Integration tests for PostGIS spatial operations -- CANV-01."""

from __future__ import annotations

import pytest


class TestSpatialOperations:
    """Tests for PostGIS extension, voter geometry, spatial queries, and index usage."""

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_postgis_extension_active(self) -> None:
        """PostGIS enabled."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_voter_geom_column_populated(self) -> None:
        """Voter geom backfilled from lat/long."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_st_contains_turf_voter(self) -> None:
        """ST_Contains query finds voters in polygon."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-01/03-02")
    def test_gist_index_used(self) -> None:
        """EXPLAIN shows GiST index scan."""
        raise NotImplementedError
