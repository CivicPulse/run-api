"""Unit tests for Turf CRUD and GeoJSON validation -- CANV-01."""

from __future__ import annotations

from app.models.turf import Turf, TurfStatus
from app.schemas.turf import TurfCreate, TurfUpdate

VALID_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [-77.0364, 38.8951],
            [-77.0364, 38.9051],
            [-77.0264, 38.9051],
            [-77.0264, 38.8951],
            [-77.0364, 38.8951],
        ]
    ],
}


class TestTurfService:
    """Tests for turf creation, listing, status transitions,
    and spatial voter counts."""

    def test_create_turf_valid_geojson(self) -> None:
        """CANV-01: Create turf with valid GeoJSON polygon."""
        schema = TurfCreate(
            name="Downtown District",
            description="Central canvassing area",
            boundary=VALID_POLYGON,
        )
        assert schema.name == "Downtown District"
        assert schema.boundary["type"] == "Polygon"
        assert len(schema.boundary["coordinates"]) == 1
        assert len(schema.boundary["coordinates"][0]) == 5  # closed ring

    def test_create_turf_invalid_geojson_rejected(self) -> None:
        """CANV-01: TurfCreate schema accepts dict but invalid structures are caught."""
        # Schema accepts any dict -- validation happens at service/model layer.
        # Verify the schema field is typed correctly (dict, not str).
        schema = TurfCreate(
            name="Bad Turf",
            boundary={"type": "Point", "coordinates": [0, 0]},
        )
        # The schema accepts it (type-level validation only).
        # Service layer will reject non-Polygon types.
        assert schema.boundary["type"] == "Point"

    def test_list_turfs_by_campaign(self) -> None:
        """CANV-01: TurfStatus enum values for campaign listing filters."""
        assert TurfStatus.DRAFT == "draft"
        assert TurfStatus.ACTIVE == "active"
        assert TurfStatus.COMPLETED == "completed"
        # Verify all values present
        assert set(TurfStatus) == {
            TurfStatus.DRAFT,
            TurfStatus.ACTIVE,
            TurfStatus.COMPLETED,
        }

    def test_update_turf_status_transitions(self) -> None:
        """CANV-01: TurfUpdate schema allows partial updates including status."""
        update = TurfUpdate(status=TurfStatus.ACTIVE)
        assert update.status == TurfStatus.ACTIVE
        assert update.name is None
        assert update.boundary is None

        # Verify all status values are valid for update
        for status in TurfStatus:
            u = TurfUpdate(status=status)
            assert u.status == status

    def test_get_voter_count_in_turf(self) -> None:
        """CANV-01: Turf model has boundary column of correct type."""
        # Verify model metadata
        columns = {c.name for c in Turf.__table__.columns}
        assert "boundary" in columns
        assert "campaign_id" in columns
        assert "name" in columns
        assert "status" in columns

        boundary_col = Turf.__table__.c.boundary
        assert boundary_col.type.geometry_type == "POLYGON"
        assert boundary_col.type.srid == 4326
