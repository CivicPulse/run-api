"""Voter interaction model -- event log with mutable notes."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
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
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
