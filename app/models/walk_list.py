"""Walk list models -- canvasser assignments and door-to-door routing."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
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
    """Join table assigning canvassers to walk lists.

    Dual-identity (Phase 111 / ASSIGN-02): exactly one of ``user_id``
    (logged-in campaign member) or ``volunteer_id`` (pre-signup volunteer)
    must be set, enforced by ``ck_walk_list_canvassers_exactly_one_identity``.
    Surrogate ``id`` PK replaces the prior composite PK so both identity
    columns can be nullable. Per-identity uniqueness is enforced by two
    partial unique indexes.
    """

    __tablename__ = "walk_list_canvassers"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(user_id, volunteer_id) = 1",
            name="ck_walk_list_canvassers_exactly_one_identity",
        ),
        Index(
            "uq_walk_list_canvassers_list_user",
            "walk_list_id",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
        Index(
            "uq_walk_list_canvassers_list_volunteer",
            "walk_list_id",
            "volunteer_id",
            unique=True,
            postgresql_where=text("volunteer_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    volunteer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("volunteers.id"), nullable=True
    )
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
