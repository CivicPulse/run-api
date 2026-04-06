"""Voter request and response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import (
    AliasChoices,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.voter import Voter
from app.schemas.common import BaseSchema

Text255 = Annotated[str, StringConstraints(max_length=255)]
Text500 = Annotated[str, StringConstraints(max_length=500)]
Text100 = Annotated[str, StringConstraints(max_length=100)]
Text50 = Annotated[str, StringConstraints(max_length=50)]
Text20 = Annotated[str, StringConstraints(max_length=20)]
Text10 = Annotated[str, StringConstraints(max_length=10)]
Text4 = Annotated[str, StringConstraints(max_length=4)]
Text2 = Annotated[str, StringConstraints(max_length=2)]


def _validate_voter_string_lengths(payload: object) -> object:
    """Reject strings that exceed the DB column length instead of truncating."""
    if not isinstance(payload, VoterCreateRequest | VoterUpdateRequest):
        return payload
    for field_name, value in payload.model_dump(exclude_none=True).items():
        if not isinstance(value, str):
            continue
        column = Voter.__table__.columns.get(field_name)
        max_length = getattr(getattr(column, "type", None), "length", None)
        if max_length is not None and len(value) > max_length:
            raise ValueError(f"{field_name} must be at most {max_length} characters")
    return payload


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
    source_type: Text50 = "manual"
    source_id: Text255 | None = None

    first_name: Text255 | None = None
    middle_name: Text255 | None = None
    last_name: Text255 | None = None
    suffix: Text50 | None = None
    date_of_birth: date | None = Field(
        default=None,
        validation_alias=AliasChoices("date_of_birth", "birth_date"),
    )
    gender: Text20 | None = None

    # Registration Address
    registration_line1: Text500 | None = None
    registration_line2: Text500 | None = None
    registration_city: Text255 | None = None
    registration_state: Text2 | None = None
    registration_zip: Text10 | None = None
    registration_zip4: Text4 | None = None
    registration_county: Text255 | None = None
    registration_apartment_type: Text20 | None = None

    # Mailing Address
    mailing_line1: Text500 | None = None
    mailing_line2: Text500 | None = None
    mailing_city: Text255 | None = None
    mailing_state: Text2 | None = None
    mailing_zip: Text10 | None = None
    mailing_zip4: Text4 | None = None
    mailing_country: Text100 | None = None
    mailing_type: Text20 | None = None

    # Political
    party: Text50 | None = None
    precinct: Text100 | None = None
    congressional_district: Text10 | None = None
    state_senate_district: Text10 | None = None
    state_house_district: Text10 | None = None
    registration_date: date | None = None

    # Voting history
    voting_history: list[str] | None = None

    # Propensity Scores
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics
    ethnicity: Text100 | None = None
    age: int | None = None
    spoken_language: Text100 | None = None
    marital_status: Text50 | None = None
    military_status: Text50 | None = None
    party_change_indicator: Text50 | None = None
    cell_phone_confidence: int | None = None

    # Geographic
    latitude: float | None = None
    longitude: float | None = None

    # Household
    household_id: Text255 | None = None
    household_party_registration: Text50 | None = None
    household_size: int | None = None
    family_id: Text255 | None = None

    # Extras
    extra_data: dict | None = None

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return value

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float | None) -> float | None:
        if value is not None and not (-90 <= value <= 90):
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float | None) -> float | None:
        if value is not None and not (-180 <= value <= 180):
            raise ValueError("longitude must be between -180 and 180")
        return value

    @model_validator(mode="after")
    def validate_lengths(self):
        return _validate_voter_string_lengths(self)


class VoterUpdateRequest(BaseSchema):
    """Partial voter update request."""

    # Core fields
    first_name: Text255 | None = None
    middle_name: Text255 | None = None
    last_name: Text255 | None = None
    suffix: Text50 | None = None
    date_of_birth: date | None = Field(
        default=None,
        validation_alias=AliasChoices("date_of_birth", "birth_date"),
    )
    gender: Text20 | None = None

    # Registration Address
    registration_line1: Text500 | None = None
    registration_line2: Text500 | None = None
    registration_city: Text255 | None = None
    registration_state: Text2 | None = None
    registration_zip: Text10 | None = None
    registration_zip4: Text4 | None = None
    registration_county: Text255 | None = None
    registration_apartment_type: Text20 | None = None

    # Mailing Address
    mailing_line1: Text500 | None = None
    mailing_line2: Text500 | None = None
    mailing_city: Text255 | None = None
    mailing_state: Text2 | None = None
    mailing_zip: Text10 | None = None
    mailing_zip4: Text4 | None = None
    mailing_country: Text100 | None = None
    mailing_type: Text20 | None = None

    # Political
    party: Text50 | None = None
    precinct: Text100 | None = None
    congressional_district: Text10 | None = None
    state_senate_district: Text10 | None = None
    state_house_district: Text10 | None = None
    registration_date: date | None = None

    # Voting history
    voting_history: list[str] | None = None

    # Propensity Scores
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics
    ethnicity: Text100 | None = None
    age: int | None = None
    spoken_language: Text100 | None = None
    marital_status: Text50 | None = None
    military_status: Text50 | None = None
    party_change_indicator: Text50 | None = None
    cell_phone_confidence: int | None = None

    # Geographic
    latitude: float | None = None
    longitude: float | None = None

    # Household
    household_id: Text255 | None = None
    household_party_registration: Text50 | None = None
    household_size: int | None = None
    family_id: Text255 | None = None

    # Extras
    extra_data: dict | None = None

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return value

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float | None) -> float | None:
        if value is not None and not (-90 <= value <= 90):
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float | None) -> float | None:
        if value is not None and not (-180 <= value <= 180):
            raise ValueError("longitude must be between -180 and 180")
        return value

    @model_validator(mode="after")
    def validate_lengths(self):
        return _validate_voter_string_lengths(self)
