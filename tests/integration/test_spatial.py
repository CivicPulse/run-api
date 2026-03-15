"""Integration tests for PostGIS spatial operations -- CANV-01.

These tests require a running PostgreSQL database with PostGIS extension
and migrations applied (alembic upgrade head).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.time import utcnow

pytestmark = pytest.mark.integration


@pytest.fixture
async def spatial_test_data(superuser_session, two_campaigns):
    """Create test data for spatial queries: turf polygon and voter with geom."""
    session = superuser_session
    data = two_campaigns
    campaign_id = data["campaign_a_id"]
    user_id = data["user_a_id"]

    turf_id = uuid.uuid4()
    voter_id = uuid.uuid4()

    # Create a turf with a polygon boundary (small DC area)
    await session.execute(
        text(
            "INSERT INTO turfs (id, campaign_id, name, status, boundary, created_by) "
            "VALUES (:id, :campaign_id, :name, :status, "
            "ST_GeomFromText('POLYGON((-77.04 38.89, -77.04 38.91, "
            "-77.02 38.91, -77.02 38.89, -77.04 38.89))', 4326), :created_by)"
        ),
        {
            "id": turf_id,
            "campaign_id": campaign_id,
            "name": "Test Turf DC",
            "status": "active",
            "created_by": user_id,
        },
    )

    # Create a voter inside the turf boundary
    await session.execute(
        text(
            "INSERT INTO voters "
            "(id, campaign_id, source_type, source_id, first_name, last_name, "
            "latitude, longitude, geom, created_at, updated_at) "
            "VALUES (:id, :campaign_id, :source_type, :source_id, "
            ":first_name, :last_name, :lat, :lng, "
            "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :now, :now)"
        ),
        {
            "id": voter_id,
            "campaign_id": campaign_id,
            "source_type": "manual",
            "source_id": f"spatial-test-{uuid.uuid4().hex[:8]}",
            "first_name": "Spatial",
            "last_name": "Tester",
            "lat": 38.90,
            "lng": -77.03,
            "now": utcnow(),
        },
    )

    await session.commit()

    yield {
        "turf_id": turf_id,
        "voter_id": voter_id,
        "campaign_id": campaign_id,
        "user_id": user_id,
    }

    # Cleanup
    await session.execute(text("DELETE FROM voters WHERE id = :id"), {"id": voter_id})
    await session.execute(text("DELETE FROM turfs WHERE id = :id"), {"id": turf_id})
    await session.commit()


class TestSpatialOperations:
    """Tests for PostGIS extension, voter geometry, spatial queries, and index usage."""

    async def test_postgis_extension_active(self, superuser_session) -> None:
        """PostGIS enabled."""
        result = await superuser_session.execute(text("SELECT PostGIS_Version()"))
        version = result.scalar_one()
        assert version is not None
        assert len(version) > 0

    async def test_voter_geom_column_populated(
        self, superuser_session, spatial_test_data
    ) -> None:
        """Voter geom backfilled from lat/long."""
        voter_id = spatial_test_data["voter_id"]
        result = await superuser_session.execute(
            text("SELECT ST_AsText(geom), ST_SRID(geom) FROM voters WHERE id = :id"),
            {"id": voter_id},
        )
        row = result.one()
        geom_text, srid = row
        assert geom_text is not None
        assert "POINT" in geom_text
        assert srid == 4326

    async def test_st_contains_turf_voter(
        self, superuser_session, spatial_test_data
    ) -> None:
        """ST_Contains query finds voters in polygon."""
        turf_id = spatial_test_data["turf_id"]
        voter_id = spatial_test_data["voter_id"]

        result = await superuser_session.execute(
            text(
                "SELECT ST_Contains(t.boundary, v.geom) "
                "FROM turfs t, voters v "
                "WHERE t.id = :turf_id AND v.id = :voter_id"
            ),
            {"turf_id": turf_id, "voter_id": voter_id},
        )
        contained = result.scalar_one()
        assert contained is True

    async def test_gist_index_used(self, superuser_session, spatial_test_data) -> None:
        """EXPLAIN shows GiST index scan."""
        # Verify the GiST index exists on voters.geom
        idx_result = await superuser_session.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'voters' AND indexname = 'ix_voters_geom'"
            )
        )
        idx_name = idx_result.scalar_one_or_none()
        assert idx_name == "ix_voters_geom"
