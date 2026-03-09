"""Voter request and response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.schemas.common import BaseSchema


class VoterResponse(BaseSchema):
    """Voter record returned from the API."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    source_type: str
    source_id: str | None = None

    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None

    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None

    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    voting_history: list[str] | None = None

    ethnicity: str | None = None
    age: int | None = None

    latitude: float | None = None
    longitude: float | None = None
    household_id: str | None = None

    extra_data: dict | None = None

    created_at: datetime
    updated_at: datetime


class VoterCreateRequest(BaseSchema):
    """Manual voter creation request."""

    source_type: str = "manual"
    source_id: str | None = None

    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None

    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None

    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    voting_history: list[str] | None = None

    ethnicity: str | None = None
    age: int | None = None

    latitude: float | None = None
    longitude: float | None = None
    household_id: str | None = None

    extra_data: dict | None = None


class VoterUpdateRequest(BaseSchema):
    """Partial voter update request."""

    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None

    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None

    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    voting_history: list[str] | None = None

    ethnicity: str | None = None
    age: int | None = None

    latitude: float | None = None
    longitude: float | None = None
    household_id: str | None = None

    extra_data: dict | None = None
