"""Call list models -- phone banking contact lists and entries."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CallListStatus(enum.StrEnum):
    """Lifecycle status of a call list."""

    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class EntryStatus(enum.StrEnum):
    """Status of an individual call list entry."""

    AVAILABLE = "available"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    MAX_ATTEMPTS = "max_attempts"
    TERMINAL = "terminal"


class CallResultCode(enum.StrEnum):
    """Outcome of a phone call attempt."""

    ANSWERED = "answered"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    WRONG_NUMBER = "wrong_number"
    VOICEMAIL = "voicemail"
    REFUSED = "refused"
    DECEASED = "deceased"
    DISCONNECTED = "disconnected"


class CallList(Base):
    """Phone banking call list -- a frozen snapshot of voters to contact.

    Generated from a voter list, optionally filtered by phone availability
    and Do Not Call list. References a survey script for standardized
    questions during calls.
    """

    __tablename__ = "call_lists"
    __table_args__ = (Index("ix_call_lists_campaign_id", "campaign_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    voter_list_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voter_lists.id"), nullable=True
    )
    script_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=CallListStatus.DRAFT, nullable=False
    )
    total_entries: Mapped[int] = mapped_column(Integer, default=0)
    completed_entries: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    claim_timeout_minutes: Mapped[int] = mapped_column(Integer, default=30)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=60)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class CallListEntry(Base):
    """Individual voter entry in a call list with phone numbers and status.

    Entries are claimed by callers using SELECT ... FOR UPDATE SKIP LOCKED
    to prevent concurrent assignment of the same entry.
    """

    __tablename__ = "call_list_entries"
    __table_args__ = (
        Index(
            "ix_call_list_entries_list_status",
            "call_list_id",
            "status",
        ),
        Index(
            "ix_call_list_entries_list_priority",
            "call_list_id",
            "priority_score",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    call_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_lists.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id"), nullable=False)
    priority_score: Mapped[int] = mapped_column(Integer, default=0)
    phone_numbers: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(
        String(50), default=EntryStatus.AVAILABLE, nullable=False
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    claimed_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(nullable=True)
    phone_attempts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
