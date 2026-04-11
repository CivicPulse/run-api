"""Voter interaction model -- event log with mutable notes."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InteractionType(enum.StrEnum):
    """Types of voter interaction events.

    Extensible via Alembic migrations (native_enum=False stores as VARCHAR).
    Phase 3 adds door_knock, survey_response. Phase 4 adds phone_call.
    """

    NOTE = "note"
    TAG_ADDED = "tag_added"
    TAG_REMOVED = "tag_removed"
    IMPORT = "import"
    CONTACT_UPDATED = "contact_updated"
    DOOR_KNOCK = "door_knock"
    SURVEY_RESPONSE = "survey_response"
    PHONE_CALL = "phone_call"


class VoterInteraction(Base):
    """Interaction event for a voter.

    System-generated events (tag_added, import, door_knock, etc.) are
    append-only and never modified or deleted. Note-type interactions
    are user-created and may be edited or deleted via the API.
    Corrections for system events are recorded as new events referencing
    the original event ID in the payload.
    """

    __tablename__ = "voter_interactions"
    __table_args__ = (
        Index("ix_voter_interactions_campaign_voter", "campaign_id", "voter_id"),
        Index("ix_voter_interactions_campaign_created", "campaign_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id"), nullable=False)
    type: Mapped[InteractionType] = mapped_column(
        Enum(InteractionType, name="interaction_type", native_enum=False),
        nullable=False,
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Plan 110-02 / OFFLINE-01: volunteer-device-generated UUID used for
    # end-to-end idempotency on door-knock POSTs. A partial UNIQUE index
    # on (campaign_id, client_uuid) WHERE type='door_knock' enforces
    # exactly-once delivery without affecting other interaction types
    # (tag_added, import, note, ...) which legitimately have NULL here.
    # See alembic/versions/040_door_knock_client_uuid.py.
    client_uuid: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
