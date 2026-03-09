"""Survey models -- reusable script/question/response engine.

These models are intentionally free of canvassing-specific foreign keys
(no turf_id, no walk_list_id) so the survey engine can be reused by
Phase 4 phone banking and other interaction channels.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ScriptStatus(enum.StrEnum):
    """Lifecycle status of a survey script."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class QuestionType(enum.StrEnum):
    """Supported survey question types."""

    MULTIPLE_CHOICE = "multiple_choice"
    SCALE = "scale"
    FREE_TEXT = "free_text"


class SurveyScript(Base):
    """Campaign survey script containing ordered questions.

    Scripts can be attached to walk lists (door-to-door) or phone
    banking sessions (Phase 4).
    """

    __tablename__ = "survey_scripts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ScriptStatus] = mapped_column(
        String(50), default=ScriptStatus.DRAFT, nullable=False
    )
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class SurveyQuestion(Base):
    """Individual question within a survey script."""

    __tablename__ = "survey_questions"
    __table_args__ = (
        Index("ix_survey_questions_script_pos", "script_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    script_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        String(50), nullable=False
    )
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class SurveyResponse(Base):
    """Recorded answer to a survey question from a voter interaction."""

    __tablename__ = "survey_responses"
    __table_args__ = (
        Index(
            "ix_survey_responses_campaign_voter_script",
            "campaign_id",
            "voter_id",
            "script_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    script_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_questions.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), nullable=False
    )
    answer_value: Mapped[str] = mapped_column(Text, nullable=False)
    answered_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    answered_at: Mapped[datetime] = mapped_column(server_default=func.now())
