"""Phone bank session models -- session management and caller tracking."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SessionStatus(enum.StrEnum):
    """Lifecycle status of a phone bank session."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class PhoneBankSession(Base):
    """A scheduled phone banking session tied to a call list.

    Sessions group callers together for coordinated phone banking
    and provide supervisor oversight of progress.
    """

    __tablename__ = "phone_bank_sessions"
    __table_args__ = (Index("ix_phone_bank_sessions_campaign_id", "campaign_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    call_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_lists.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=SessionStatus.DRAFT, nullable=False
    )
    scheduled_start: Mapped[datetime | None] = mapped_column(nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class SessionCaller(Base):
    """A caller assigned to a phone bank session with check-in/out tracking.

    Dual-identity (Phase 111 / ASSIGN-01): exactly one of ``user_id``
    (logged-in campaign member) or ``volunteer_id`` (pre-signup volunteer)
    must be set, enforced by ``ck_session_callers_exactly_one_identity``.
    Per-identity uniqueness within a session is enforced by two partial
    unique indexes.
    """

    __tablename__ = "session_callers"
    __table_args__ = (
        Index("ix_session_callers_session_id", "session_id"),
        CheckConstraint(
            "num_nonnulls(user_id, volunteer_id) = 1",
            name="ck_session_callers_exactly_one_identity",
        ),
        Index(
            "uq_session_callers_session_user",
            "session_id",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
        Index(
            "uq_session_callers_session_volunteer",
            "session_id",
            "volunteer_id",
            unique=True,
            postgresql_where=text("volunteer_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("phone_bank_sessions.id"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    volunteer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("volunteers.id"), nullable=True
    )
    check_in_at: Mapped[datetime | None] = mapped_column(nullable=True)
    check_out_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
