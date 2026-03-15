"""Unit tests for Phase 23 Voter model column additions and constraints.

Tests verify that all new columns exist with the correct SQLAlchemy types and
that VoterPhone has the required unique constraint. No database connection needed
-- all assertions inspect model metadata only.
"""

from __future__ import annotations

import pytest
from sqlalchemy import SmallInteger, String, UniqueConstraint


class TestPropensityColumns:
    """VMOD-01: Voter model has propensity score columns as SmallInteger."""

    def test_propensity_columns_exist_with_smallinteger_type(self):
        """Voter model exposes propensity_general, propensity_primary, propensity_combined as SmallInteger columns."""
        from app.models.voter import Voter

        table = Voter.__table__
        for col_name in ("propensity_general", "propensity_primary", "propensity_combined"):
            assert col_name in table.c, f"Column {col_name!r} missing from Voter model"
            col = table.c[col_name]
            assert isinstance(col.type, SmallInteger), (
                f"Column {col_name!r} should be SmallInteger, got {type(col.type).__name__}"
            )
            assert col.nullable is True, f"Column {col_name!r} should be nullable"


class TestMailingAddressColumns:
    """VMOD-02: Voter model has all 8 mailing address columns."""

    def test_mailing_address_columns_exist(self):
        """Voter model exposes all 8 mailing address columns with correct String types."""
        from app.models.voter import Voter

        table = Voter.__table__
        expected = {
            "mailing_line1": 500,
            "mailing_line2": 500,
            "mailing_city": 255,
            "mailing_state": 2,
            "mailing_zip": 10,
            "mailing_zip4": 4,
            "mailing_country": 100,
            "mailing_type": 20,
        }
        for col_name, expected_length in expected.items():
            assert col_name in table.c, f"Column {col_name!r} missing from Voter model"
            col = table.c[col_name]
            assert isinstance(col.type, String), (
                f"Column {col_name!r} should be String, got {type(col.type).__name__}"
            )
            assert col.type.length == expected_length, (
                f"Column {col_name!r} length should be {expected_length}, got {col.type.length}"
            )
            assert col.nullable is True, f"Column {col_name!r} should be nullable"


class TestSpokenLanguageColumn:
    """VMOD-03: Voter model has spoken_language column."""

    def test_spoken_language_column_exists_as_string(self):
        """Voter model exposes spoken_language as a nullable String(100) column."""
        from app.models.voter import Voter

        table = Voter.__table__
        assert "spoken_language" in table.c, "Column 'spoken_language' missing from Voter model"
        col = table.c["spoken_language"]
        assert isinstance(col.type, String), (
            f"spoken_language should be String, got {type(col.type).__name__}"
        )
        assert col.type.length == 100, (
            f"spoken_language length should be 100, got {col.type.length}"
        )
        assert col.nullable is True, "spoken_language should be nullable"


class TestDemographicColumns:
    """VMOD-04: Voter model has marital_status, military_status, party_change_indicator."""

    def test_demographic_columns_exist(self):
        """Voter model exposes marital_status, military_status, party_change_indicator as nullable String columns."""
        from app.models.voter import Voter

        table = Voter.__table__
        expected = {
            "marital_status": 50,
            "military_status": 50,
            "party_change_indicator": 50,
        }
        for col_name, expected_length in expected.items():
            assert col_name in table.c, f"Column {col_name!r} missing from Voter model"
            col = table.c[col_name]
            assert isinstance(col.type, String), (
                f"Column {col_name!r} should be String, got {type(col.type).__name__}"
            )
            assert col.type.length == expected_length, (
                f"Column {col_name!r} length should be {expected_length}, got {col.type.length}"
            )
            assert col.nullable is True, f"Column {col_name!r} should be nullable"


class TestCellPhoneConfidenceColumn:
    """VMOD-05: Voter model has cell_phone_confidence as SmallInteger."""

    def test_cell_phone_confidence_is_smallinteger(self):
        """Voter model exposes cell_phone_confidence as a nullable SmallInteger column."""
        from app.models.voter import Voter

        table = Voter.__table__
        assert "cell_phone_confidence" in table.c, (
            "Column 'cell_phone_confidence' missing from Voter model"
        )
        col = table.c["cell_phone_confidence"]
        assert isinstance(col.type, SmallInteger), (
            f"cell_phone_confidence should be SmallInteger, got {type(col.type).__name__}"
        )
        assert col.nullable is True, "cell_phone_confidence should be nullable"


class TestHouseholdColumns:
    """VMOD-06: Voter model has household_party_registration, household_size (SmallInteger), family_id."""

    def test_household_columns_exist_with_correct_types(self):
        """Voter model exposes household_party_registration (String), household_size (SmallInteger), and family_id (String)."""
        from app.models.voter import Voter

        table = Voter.__table__

        # household_party_registration: String(50)
        assert "household_party_registration" in table.c, (
            "Column 'household_party_registration' missing from Voter model"
        )
        hpr = table.c["household_party_registration"]
        assert isinstance(hpr.type, String), (
            f"household_party_registration should be String, got {type(hpr.type).__name__}"
        )
        assert hpr.nullable is True, "household_party_registration should be nullable"

        # household_size: SmallInteger
        assert "household_size" in table.c, "Column 'household_size' missing from Voter model"
        hs = table.c["household_size"]
        assert isinstance(hs.type, SmallInteger), (
            f"household_size should be SmallInteger, got {type(hs.type).__name__}"
        )
        assert hs.nullable is True, "household_size should be nullable"

        # family_id: String(255)
        assert "family_id" in table.c, "Column 'family_id' missing from Voter model"
        fid = table.c["family_id"]
        assert isinstance(fid.type, String), (
            f"family_id should be String, got {type(fid.type).__name__}"
        )
        assert fid.nullable is True, "family_id should be nullable"


class TestZip4AndApartmentTypeColumns:
    """VMOD-07: Voter model has registration_zip4 (String(4)) and registration_apartment_type (String(20))."""

    def test_zip4_and_apartment_type_exist_with_correct_lengths(self):
        """Voter model exposes registration_zip4 as String(4) and registration_apartment_type as String(20)."""
        from app.models.voter import Voter

        table = Voter.__table__

        assert "registration_zip4" in table.c, (
            "Column 'registration_zip4' missing from Voter model"
        )
        z4 = table.c["registration_zip4"]
        assert isinstance(z4.type, String), (
            f"registration_zip4 should be String, got {type(z4.type).__name__}"
        )
        assert z4.type.length == 4, (
            f"registration_zip4 length should be 4, got {z4.type.length}"
        )
        assert z4.nullable is True, "registration_zip4 should be nullable"

        assert "registration_apartment_type" in table.c, (
            "Column 'registration_apartment_type' missing from Voter model"
        )
        apt = table.c["registration_apartment_type"]
        assert isinstance(apt.type, String), (
            f"registration_apartment_type should be String, got {type(apt.type).__name__}"
        )
        assert apt.type.length == 20, (
            f"registration_apartment_type length should be 20, got {apt.type.length}"
        )
        assert apt.nullable is True, "registration_apartment_type should be nullable"


class TestVoterPhoneUniqueConstraint:
    """VMOD-10: VoterPhone has UniqueConstraint on (campaign_id, voter_id, value)."""

    def test_voter_phone_has_unique_constraint_on_campaign_voter_value(self):
        """VoterPhone model has a UniqueConstraint named 'uq_voter_phone_campaign_voter_value' covering campaign_id, voter_id, value."""
        from app.models.voter_contact import VoterPhone

        constraints = VoterPhone.__table__.constraints
        unique_constraints = [
            c for c in constraints if isinstance(c, UniqueConstraint)
        ]
        assert unique_constraints, "VoterPhone has no UniqueConstraint at all"

        target = next(
            (c for c in unique_constraints if c.name == "uq_voter_phone_campaign_voter_value"),
            None,
        )
        assert target is not None, (
            "VoterPhone missing UniqueConstraint named 'uq_voter_phone_campaign_voter_value'"
        )

        constrained_cols = {col.name for col in target.columns}
        assert constrained_cols == {"campaign_id", "voter_id", "value"}, (
            f"UniqueConstraint columns should be (campaign_id, voter_id, value), got {constrained_cols}"
        )
