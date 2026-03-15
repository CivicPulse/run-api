"""Unit tests for Phase 23 Voter schema field additions and renames.

Tests verify that VoterResponse, VoterCreateRequest, VoterUpdateRequest expose
all new and renamed fields, and that VoterFilter uses registration_ prefix for
address filter fields. No database connection needed.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

import pytest


NEW_REGISTRATION_FIELDS = [
    "registration_line1",
    "registration_line2",
    "registration_city",
    "registration_state",
    "registration_zip",
    "registration_zip4",
    "registration_county",
    "registration_apartment_type",
]

MAILING_FIELDS = [
    "mailing_line1",
    "mailing_line2",
    "mailing_city",
    "mailing_state",
    "mailing_zip",
    "mailing_zip4",
    "mailing_country",
    "mailing_type",
]

PROPENSITY_FIELDS = [
    "propensity_general",
    "propensity_primary",
    "propensity_combined",
]

DEMOGRAPHIC_FIELDS = [
    "spoken_language",
    "marital_status",
    "military_status",
    "party_change_indicator",
    "cell_phone_confidence",
]

HOUSEHOLD_FIELDS = [
    "household_party_registration",
    "household_size",
    "family_id",
]

OLD_ADDRESS_FIELDS = [
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip_code",
    "county",
]

ALL_NEW_FIELDS = (
    NEW_REGISTRATION_FIELDS
    + MAILING_FIELDS
    + PROPENSITY_FIELDS
    + DEMOGRAPHIC_FIELDS
    + HOUSEHOLD_FIELDS
)


class TestVoterResponseHasAllNewFields:
    """VMOD-09: VoterResponse includes all new and renamed fields."""

    def test_voter_response_has_registration_address_fields(self):
        """VoterResponse exposes all registration_ prefixed address fields."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in NEW_REGISTRATION_FIELDS:
            assert field in fields, f"VoterResponse missing field {field!r}"

    def test_voter_response_has_mailing_address_fields(self):
        """VoterResponse exposes all 8 mailing address fields."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in MAILING_FIELDS:
            assert field in fields, f"VoterResponse missing field {field!r}"

    def test_voter_response_has_propensity_fields(self):
        """VoterResponse exposes propensity_general, propensity_primary, propensity_combined."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in PROPENSITY_FIELDS:
            assert field in fields, f"VoterResponse missing field {field!r}"

    def test_voter_response_has_demographic_fields(self):
        """VoterResponse exposes spoken_language, marital_status, military_status, party_change_indicator, cell_phone_confidence."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in DEMOGRAPHIC_FIELDS:
            assert field in fields, f"VoterResponse missing field {field!r}"

    def test_voter_response_has_household_fields(self):
        """VoterResponse exposes household_party_registration, household_size, family_id."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in HOUSEHOLD_FIELDS:
            assert field in fields, f"VoterResponse missing field {field!r}"

    def test_voter_response_does_not_have_old_address_fields(self):
        """VoterResponse does not expose legacy address_line1, city, state, zip_code, county."""
        from app.schemas.voter import VoterResponse

        fields = VoterResponse.model_fields
        for field in OLD_ADDRESS_FIELDS:
            assert field not in fields, f"VoterResponse still exposes old field {field!r}"


class TestVoterCreateRequestHasAllNewFields:
    """VMOD-09: VoterCreateRequest includes all new and renamed fields."""

    def test_voter_create_request_has_all_new_fields(self):
        """VoterCreateRequest exposes all registration_, mailing_, propensity, demographic, and household fields."""
        from app.schemas.voter import VoterCreateRequest

        fields = VoterCreateRequest.model_fields
        for field in ALL_NEW_FIELDS:
            assert field in fields, f"VoterCreateRequest missing field {field!r}"

    def test_voter_create_request_does_not_have_old_address_fields(self):
        """VoterCreateRequest does not expose legacy address fields."""
        from app.schemas.voter import VoterCreateRequest

        fields = VoterCreateRequest.model_fields
        for field in OLD_ADDRESS_FIELDS:
            assert field not in fields, f"VoterCreateRequest still exposes old field {field!r}"


class TestVoterUpdateRequestHasAllNewFields:
    """VMOD-09: VoterUpdateRequest includes all new and renamed fields."""

    def test_voter_update_request_has_all_new_fields(self):
        """VoterUpdateRequest exposes all registration_, mailing_, propensity, demographic, and household fields."""
        from app.schemas.voter import VoterUpdateRequest

        fields = VoterUpdateRequest.model_fields
        for field in ALL_NEW_FIELDS:
            assert field in fields, f"VoterUpdateRequest missing field {field!r}"

    def test_voter_update_request_does_not_have_old_address_fields(self):
        """VoterUpdateRequest does not expose legacy address fields."""
        from app.schemas.voter import VoterUpdateRequest

        fields = VoterUpdateRequest.model_fields
        for field in OLD_ADDRESS_FIELDS:
            assert field not in fields, f"VoterUpdateRequest still exposes old field {field!r}"


class TestVoterFilterUsesRegistrationPrefix:
    """VMOD-09: VoterFilter uses registration_ prefix for address filter fields."""

    def test_voter_filter_has_registration_prefixed_address_fields(self):
        """VoterFilter exposes registration_city, registration_state, registration_zip, registration_county."""
        from app.schemas.voter_filter import VoterFilter

        fields = VoterFilter.model_fields
        for field in ("registration_city", "registration_state", "registration_zip", "registration_county"):
            assert field in fields, f"VoterFilter missing field {field!r}"

    def test_voter_filter_does_not_have_old_address_fields(self):
        """VoterFilter does not expose legacy city, state, zip_code, county fields."""
        from app.schemas.voter_filter import VoterFilter

        fields = VoterFilter.model_fields
        for old_field in ("city", "state", "zip_code", "county"):
            assert old_field not in fields, f"VoterFilter still has old field {old_field!r}"


class TestVoterSchemaSerializationRoundtrip:
    """VMOD-09: All new fields survive a Pydantic serialization roundtrip."""

    def test_voter_create_request_roundtrip_with_new_fields(self):
        """VoterCreateRequest correctly serializes and deserializes all new field groups."""
        from app.schemas.voter import VoterCreateRequest

        payload = {
            "registration_line1": "123 Main St",
            "registration_city": "Austin",
            "registration_state": "TX",
            "registration_zip": "78701",
            "registration_zip4": "1234",
            "registration_apartment_type": "APT",
            "mailing_line1": "PO Box 1",
            "mailing_city": "Austin",
            "mailing_state": "TX",
            "mailing_zip": "78702",
            "mailing_zip4": "5678",
            "mailing_country": "USA",
            "mailing_type": "PO Box",
            "propensity_general": 75,
            "propensity_primary": 60,
            "propensity_combined": 80,
            "spoken_language": "Spanish",
            "marital_status": "Married",
            "military_status": "Veteran",
            "party_change_indicator": "Changed",
            "cell_phone_confidence": 90,
            "household_party_registration": "DEM",
            "household_size": 3,
            "family_id": "FAM-001",
        }
        instance = VoterCreateRequest(**payload)
        dumped = instance.model_dump(exclude_none=True)

        assert dumped["registration_line1"] == "123 Main St"
        assert dumped["registration_zip4"] == "1234"
        assert dumped["mailing_line1"] == "PO Box 1"
        assert dumped["mailing_zip4"] == "5678"
        assert dumped["propensity_general"] == 75
        assert dumped["spoken_language"] == "Spanish"
        assert dumped["household_size"] == 3
        assert dumped["family_id"] == "FAM-001"

    def test_voter_filter_roundtrip_with_registration_fields(self):
        """VoterFilter correctly serializes and deserializes registration_ prefixed address fields."""
        from app.schemas.voter_filter import VoterFilter

        f = VoterFilter(
            registration_city="Austin",
            registration_state="TX",
            registration_zip="78701",
            registration_county="Travis",
        )
        dumped = f.model_dump(exclude_none=True)

        assert dumped["registration_city"] == "Austin"
        assert dumped["registration_state"] == "TX"
        assert dumped["registration_zip"] == "78701"
        assert dumped["registration_county"] == "Travis"
        assert "city" not in dumped
        assert "zip_code" not in dumped
