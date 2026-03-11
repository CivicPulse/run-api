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
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None
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
    logic: str = Field(default="AND", pattern="^(AND|OR)$")
