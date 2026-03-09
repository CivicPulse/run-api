"""Pydantic schemas for survey script, question, and response operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.models.survey import QuestionType, ScriptStatus
from app.schemas.common import BaseSchema, PaginatedResponse


class ScriptCreate(BaseSchema):
    """Schema for creating a new survey script."""

    title: str
    description: str | None = None


class ScriptUpdate(BaseSchema):
    """Schema for updating an existing survey script."""

    title: str | None = None
    description: str | None = None
    status: ScriptStatus | None = None


class ScriptResponse(BaseSchema):
    """Schema for survey script API responses."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    title: str
    description: str | None = None
    status: ScriptStatus
    created_by: str
    created_at: datetime
    updated_at: datetime


class QuestionCreate(BaseSchema):
    """Schema for creating a survey question."""

    question_text: str
    question_type: QuestionType
    options: dict[str, Any] | None = None
    position: int | None = None


class QuestionUpdate(BaseSchema):
    """Schema for updating a survey question."""

    question_text: str | None = None
    question_type: QuestionType | None = None
    position: int | None = None
    options: dict[str, Any] | None = None


class QuestionResponse(BaseSchema):
    """Schema for survey question API responses."""

    id: uuid.UUID
    script_id: uuid.UUID
    position: int
    question_text: str
    question_type: QuestionType
    options: dict[str, Any] | None = None


class ResponseCreate(BaseSchema):
    """Schema for recording a survey response."""

    question_id: uuid.UUID
    voter_id: uuid.UUID
    answer_value: str


class ResponseRecord(ResponseCreate):
    """Extended response creation with script context."""

    script_id: uuid.UUID


class SurveyResponseOut(BaseSchema):
    """Schema for survey response API responses."""

    id: uuid.UUID
    script_id: uuid.UUID
    question_id: uuid.UUID
    voter_id: uuid.UUID
    answer_value: str
    answered_by: str
    answered_at: datetime


class ScriptDetailResponse(ScriptResponse):
    """Script response with nested questions."""

    questions: list[QuestionResponse] = []


class BatchResponseCreate(BaseSchema):
    """Schema for recording batch survey responses for a voter."""

    voter_id: uuid.UUID
    responses: list[ResponseCreate]


class ScriptListResponse(PaginatedResponse[ScriptResponse]):
    """Paginated list of survey scripts."""

    pass
