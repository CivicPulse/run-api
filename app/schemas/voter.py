"""Voter request and response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.schemas.common import BaseSchema


class VoterResponse(BaseSchema):
    """Voter record returned from the API."""

    # Core fields
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

    # Registration Address
    registration_line1: str | None = None
    registration_line2: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None
    registration_zip4: str | None = None
    registration_county: str | None = None
    registration_apartment_type: str | None = None

    # Mailing Address
    mailing_line1: str | None = None
    mailing_line2: str | None = None
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None
    mailing_zip4: str | None = None
    mailing_country: str | None = None
    mailing_type: str | None = None

    # Political
    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    # Voting history
    voting_history: list[str] | None = None

    # Propensity Scores
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics
    ethnicity: str | None = None
    age: int | None = None
    spoken_language: str | None = None
    marital_status: str | None = None
    military_status: str | None = None
    party_change_indicator: str | None = None
    cell_phone_confidence: int | None = None

    # Geographic
    latitude: float | None = None
    longitude: float | None = None

    # Household
    household_id: str | None = None
    household_party_registration: str | None = None
    household_size: int | None = None
    family_id: str | None = None

    # Extras
    extra_data: dict | None = None

    # Metadata
    created_at: datetime
    updated_at: datetime


class VoterCreateRequest(BaseSchema):
    """Manual voter creation request."""

    # Core fields
    source_type: str = "manual"
    source_id: str | None = None

    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None

    # Registration Address
    registration_line1: str | None = None
    registration_line2: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None
    registration_zip4: str | None = None
    registration_county: str | None = None
    registration_apartment_type: str | None = None

    # Mailing Address
    mailing_line1: str | None = None
    mailing_line2: str | None = None
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None
    mailing_zip4: str | None = None
    mailing_country: str | None = None
    mailing_type: str | None = None

    # Political
    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    # Voting history
    voting_history: list[str] | None = None

    # Propensity Scores
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics
    ethnicity: str | None = None
    age: int | None = None
    spoken_language: str | None = None
    marital_status: str | None = None
    military_status: str | None = None
    party_change_indicator: str | None = None
    cell_phone_confidence: int | None = None

    # Geographic
    latitude: float | None = None
    longitude: float | None = None

    # Household
    household_id: str | None = None
    household_party_registration: str | None = None
    household_size: int | None = None
    family_id: str | None = None

    # Extras
    extra_data: dict | None = None


class VoterUpdateRequest(BaseSchema):
    """Partial voter update request."""

    # Core fields
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None

    # Registration Address
    registration_line1: str | None = None
    registration_line2: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None
    registration_zip4: str | None = None
    registration_county: str | None = None
    registration_apartment_type: str | None = None

    # Mailing Address
    mailing_line1: str | None = None
    mailing_line2: str | None = None
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None
    mailing_zip4: str | None = None
    mailing_country: str | None = None
    mailing_type: str | None = None

    # Political
    party: str | None = None
    precinct: str | None = None
    congressional_district: str | None = None
    state_senate_district: str | None = None
    state_house_district: str | None = None
    registration_date: date | None = None

    # Voting history
    voting_history: list[str] | None = None

    # Propensity Scores
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics
    ethnicity: str | None = None
    age: int | None = None
    spoken_language: str | None = None
    marital_status: str | None = None
    military_status: str | None = None
    party_change_indicator: str | None = None
    cell_phone_confidence: int | None = None

    # Geographic
    latitude: float | None = None
    longitude: float | None = None

    # Household
    household_id: str | None = None
    household_party_registration: str | None = None
    household_size: int | None = None
    family_id: str | None = None

    # Extras
    extra_data: dict | None = None
