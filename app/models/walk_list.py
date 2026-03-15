"""Walk list models -- canvasser assignments and door-to-door routing."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WalkListEntryStatus(enum.StrEnum):
    """Status of an individual walk list entry (household visit)."""

    PENDING = "pending"
    VISITED = "visited"
    SKIPPED = "skipped"


class DoorKnockResult(enum.StrEnum):
    """Outcome of a door knock attempt."""

    NOT_HOME = "not_home"
    REFUSED = "refused"
    SUPPORTER = "supporter"
    UNDECIDED = "undecided"
    OPPOSED = "opposed"
    MOVED = "moved"
    DECEASED = "deceased"
    COME_BACK_LATER = "come_back_later"
    INACCESSIBLE = "inaccessible"


class WalkList(Base):
    """Ordered list of households for canvasser door-to-door visits.

    A walk list is generated from a turf and optionally filtered by
    a voter list. It may reference a survey script for standardized
    questions at the door.
    """

    __tablename__ = "walk_lists"
    __table_args__ = (Index("ix_walk_lists_campaign_id", "campaign_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    turf_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("turfs.id"), nullable=False)
    voter_list_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voter_lists.id"), nullable=True
    )
    script_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_entries: Mapped[int] = mapped_column(Integer, default=0)
    visited_entries: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class WalkListEntry(Base):
    """Individual voter/household entry in a walk list with visit ordering."""

    __tablename__ = "walk_list_entries"
    __table_args__ = (
        Index("ix_walk_list_entries_list_seq", "walk_list_id", "sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id"), nullable=False)
    household_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[WalkListEntryStatus] = mapped_column(
        String(50), default=WalkListEntryStatus.PENDING, nullable=False
    )


class WalkListCanvasser(Base):
    """Join table assigning canvassers (users) to walk lists."""

    __tablename__ = "walk_list_canvassers"

    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
