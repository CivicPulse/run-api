"""Voter and VoterTag SQLAlchemy models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import ForeignKey, Index, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Voter(Base):
    """Canonical voter record.

    Core fields are typed columns for efficient querying. Extra vendor-specific
    data (likelihood scores, ethnicity estimates, etc.) lives in the JSONB
    ``extra_data`` column.
    """

    __tablename__ = "voters"
    __table_args__ = (
        Index(
            "ix_voters_campaign_source",
            "campaign_id",
            "source_type",
            "source_id",
            unique=True,
        ),
        Index("ix_voters_campaign_party", "campaign_id", "party"),
        Index("ix_voters_campaign_precinct", "campaign_id", "precinct"),
        Index("ix_voters_campaign_reg_zip", "campaign_id", "registration_zip"),
        Index("ix_voters_campaign_last_name", "campaign_id", "last_name"),
        Index("ix_voters_campaign_mailing_zip", "campaign_id", "mailing_zip"),
        Index("ix_voters_campaign_mailing_city", "campaign_id", "mailing_city"),
        Index("ix_voters_campaign_mailing_state", "campaign_id", "mailing_state"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )

    # Source tracking
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Core fields
    first_name: Mapped[str | None] = mapped_column(String(255))
    middle_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    suffix: Mapped[str | None] = mapped_column(String(50))
    date_of_birth: Mapped[date | None] = mapped_column()
    gender: Mapped[str | None] = mapped_column(String(20))

    # Registration Address
    registration_line1: Mapped[str | None] = mapped_column(String(500))
    registration_line2: Mapped[str | None] = mapped_column(String(500))
    registration_city: Mapped[str | None] = mapped_column(String(255))
    registration_state: Mapped[str | None] = mapped_column(String(2))
    registration_zip: Mapped[str | None] = mapped_column(String(10))
    registration_zip4: Mapped[str | None] = mapped_column(String(4))
    registration_county: Mapped[str | None] = mapped_column(String(255))
    registration_apartment_type: Mapped[str | None] = mapped_column(String(20))

    # Mailing Address
    mailing_line1: Mapped[str | None] = mapped_column(String(500))
    mailing_line2: Mapped[str | None] = mapped_column(String(500))
    mailing_city: Mapped[str | None] = mapped_column(String(255))
    mailing_state: Mapped[str | None] = mapped_column(String(2))
    mailing_zip: Mapped[str | None] = mapped_column(String(10))
    mailing_zip4: Mapped[str | None] = mapped_column(String(4))
    mailing_country: Mapped[str | None] = mapped_column(String(100))
    mailing_type: Mapped[str | None] = mapped_column(String(20))

    # Political
    party: Mapped[str | None] = mapped_column(String(50))
    precinct: Mapped[str | None] = mapped_column(String(100))
    congressional_district: Mapped[str | None] = mapped_column(String(10))
    state_senate_district: Mapped[str | None] = mapped_column(String(10))
    state_house_district: Mapped[str | None] = mapped_column(String(10))
    registration_date: Mapped[date | None] = mapped_column()

    # Voting history (array of election identifiers)
    voting_history: Mapped[list | None] = mapped_column(ARRAY(String), default=list)

    # Propensity Scores
    propensity_general: Mapped[int | None] = mapped_column(SmallInteger)
    propensity_primary: Mapped[int | None] = mapped_column(SmallInteger)
    propensity_combined: Mapped[int | None] = mapped_column(SmallInteger)

    # Demographics
    ethnicity: Mapped[str | None] = mapped_column(String(100))
    age: Mapped[int | None] = mapped_column()
    spoken_language: Mapped[str | None] = mapped_column(String(100))
    marital_status: Mapped[str | None] = mapped_column(String(50))
    military_status: Mapped[str | None] = mapped_column(String(50))
    party_change_indicator: Mapped[str | None] = mapped_column(String(50))
    cell_phone_confidence: Mapped[int | None] = mapped_column(SmallInteger)

    # Geographic
    latitude: Mapped[float | None] = mapped_column()
    longitude: Mapped[float | None] = mapped_column()
    geom: Mapped[WKBElement | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=True,
    )
    # Household
    household_id: Mapped[str | None] = mapped_column(String(255))
    household_party_registration: Mapped[str | None] = mapped_column(String(50))
    household_size: Mapped[int | None] = mapped_column(SmallInteger)
    family_id: Mapped[str | None] = mapped_column(String(255))

    # Extras
    extra_data: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class VoterTag(Base):
    """Campaign-scoped free-form voter tag."""

    __tablename__ = "voter_tags"
    __table_args__ = (
        UniqueConstraint("campaign_id", "name", name="uq_voter_tag_campaign_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class VoterTagMember(Base):
    """Join table linking voters to tags."""

    __tablename__ = "voter_tag_members"

    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voter_tags.id"), primary_key=True
    )
