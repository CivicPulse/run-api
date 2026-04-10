"""Volunteer application request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import BaseSchema


class VolunteerApplicationCreate(BaseSchema):
    """Schema for submitting a volunteer application from a signup link."""

    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_names(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value may not be blank")
        return value

    @field_validator("phone", "notes")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class VolunteerApplicationDecision(BaseSchema):
    """Schema for resolving a volunteer application."""

    rejection_reason: str | None = Field(default=None, max_length=2000)

    @field_validator("rejection_reason")
    @classmethod
    def strip_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class VolunteerApplicationReviewContext(BaseSchema):
    """Derived admin-only review context for an application."""

    has_existing_account: bool
    existing_member: bool
    existing_member_role: str | None = None
    prior_application_statuses: list[str] = []
    approval_delivery: str | None = None


class VolunteerApplicationResponse(BaseSchema):
    """Volunteer application payload for public and admin views."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    signup_link_id: uuid.UUID
    signup_link_label: str
    applicant_user_id: str | None = None
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    notes: str | None = None
    status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    rejection_reason: str | None = None
    review_context: VolunteerApplicationReviewContext | None = None
    created_at: datetime
    updated_at: datetime


class PublicVolunteerApplicationStatus(BaseSchema):
    """Current-user application state for a public signup link."""

    status: str
    application: VolunteerApplicationResponse | None = None
