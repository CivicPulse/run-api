"""Turf model -- geographic canvassing areas with PostGIS boundaries."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TurfStatus(enum.StrEnum):
    """Status of a canvassing turf."""

    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class Turf(Base):
    """Geographic canvassing area defined by a polygon boundary.

    Turfs partition a campaign's territory for door-to-door canvassing.
    Each turf has a PostGIS polygon boundary used for spatial queries
    (e.g., finding voters within a turf via ST_Contains).
    """

    __tablename__ = "turfs"
    __table_args__ = (
        Index("ix_turfs_campaign_status", "campaign_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TurfStatus] = mapped_column(
        String(50), default=TurfStatus.DRAFT, nullable=False
    )
    boundary: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
