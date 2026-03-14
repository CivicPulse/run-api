"""Structured voter filter schema for search and dynamic lists."""

from __future__ import annotations

from pydantic import BaseModel, Field


class VoterFilter(BaseModel):
    """Composable voter filter with AND/OR logic.

    Used for voter search endpoints and stored as ``filter_query`` on dynamic
    voter lists.
    """

    party: str | None = None
    parties: list[str] | None = None
    precinct: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None
    registration_county: str | None = None
    congressional_district: str | None = None
    age_min: int | None = None
    age_max: int | None = None
    gender: str | None = None
    voted_in: list[str] | None = None
    not_voted_in: list[str] | None = None
    tags: list[str] | None = None
    tags_any: list[str] | None = None
    registered_after: str | None = None
    registered_before: str | None = None
    search: str | None = None
    has_phone: bool | None = None

    # Propensity score ranges (0-100)
    propensity_general_min: int | None = Field(default=None, ge=0, le=100)
    propensity_general_max: int | None = Field(default=None, ge=0, le=100)
    propensity_primary_min: int | None = Field(default=None, ge=0, le=100)
    propensity_primary_max: int | None = Field(default=None, ge=0, le=100)
    propensity_combined_min: int | None = Field(default=None, ge=0, le=100)
    propensity_combined_max: int | None = Field(default=None, ge=0, le=100)

    # Multi-select demographics
    ethnicities: list[str] | None = None
    spoken_languages: list[str] | None = None
    military_statuses: list[str] | None = None

    # Mailing address
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None

    logic: str = Field(default="AND", pattern="^(AND|OR)$")
