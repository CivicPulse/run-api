"""Unit tests for L2 voter file column mapping completeness."""

from __future__ import annotations

import csv
from pathlib import Path

from app.services.import_service import (
    _VOTER_COLUMNS,
    suggest_field_mapping,
)

# Read actual L2 header row from sample file
_SAMPLE_PATH = Path(__file__).resolve().parents[2] / "data" / "example-2026-02-24.csv"


def _get_l2_headers() -> list[str]:
    with open(_SAMPLE_PATH) as f:
        reader = csv.reader(f)
        return next(reader)


# Expected mapping for all 47 data columns (non-voting-history).
# Per D-13: "Mailing Household Size" -> household_size (existing)
# Per D-13: "Mailing_Families_HHCount" -> mailing_household_size (new)
_EXPECTED_DATA_MAPPING: dict[str, str] = {
    "Voter ID": "source_id",
    "First Name": "first_name",
    "Last Name": "last_name",
    "Registered Party": "party",
    "Gender": "gender",
    "Age": "age",
    "Likelihood to vote": "propensity_general",
    "Primary Likelihood to Vote": "propensity_primary",
    "Combined General and Primary Likelihood to Vote": "propensity_combined",
    "Apartment Type": "registration_apartment_type",
    "Ethnicity": "ethnicity",
    "Lattitude": "latitude",
    "Longitude": "longitude",
    "Household Party Registration": "household_party_registration",
    "Mailing Household Size": "household_size",
    "Street Number Odd/Even": "street_number_parity",
    "Cell Phone": "__cell_phone",
    "Cell Phone Confidence Code": "cell_phone_confidence",
    "Voter Changed Party?": "party_change_indicator",
    "Spoken Language": "spoken_language",
    "Address": "registration_line1",
    "Second Address Line": "registration_line2",
    "House Number": "house_number",
    "City": "registration_city",
    "State": "registration_state",
    "Zipcode": "registration_zip",
    "Zip+4": "registration_zip4",
    "Mailing Address": "mailing_line1",
    "Mailing Address Extra Line": "mailing_line2",
    "Mailing City": "mailing_city",
    "Mailing State": "mailing_state",
    "Mailing Zip": "mailing_zip",
    "Mailing Zip+4": "mailing_zip4",
    "Mailing Bar Code": "mailing_bar_code",
    "Mailing Verifier": "mailing_verifier",
    "Mailing House Number": "mailing_house_number",
    "Mailing Address Prefix": "mailing_address_prefix",
    "Mailing Street Name": "mailing_street_name",
    "Mailng Designator": "mailing_designator",
    "Mailing Suffix Direction": "mailing_suffix_direction",
    "Mailing Aptartment Number": "mailing_apartment_number",
    "Mailing Apartment Type": "mailing_type",
    "Marital Status": "marital_status",
    "Mailing Family ID": "family_id",
    "Mailing_Families_HHCount": "mailing_household_size",
    "Mailing Household Party Registration": "mailing_household_party_registration",
    "Military Active/Veteran": "military_status",
}

# Voting history columns (should NOT be in data mapping)
_VOTING_HISTORY_COLS = {
    "General_2024",
    "Primary_2024",
    "Voted in 2022",
    "Voted in 2020",
    "Voted in 2018",
    "Voted in 2022 Primary",
    "Voter in 2020 Primary",
    "Voted in 2018 Primary",
}


class TestL2DataColumnMapping:
    def test_all_l2_data_columns_map(self):
        headers = _get_l2_headers()
        result = suggest_field_mapping(headers)
        for col, expected_field in _EXPECTED_DATA_MAPPING.items():
            assert result[col]["field"] == expected_field, (
                f"Column '{col}' mapped to {result[col]['field']}, "
                f"expected {expected_field}"
            )

    def test_all_data_columns_are_exact_match(self):
        headers = _get_l2_headers()
        result = suggest_field_mapping(headers)
        for col in _EXPECTED_DATA_MAPPING:
            assert result[col]["match_type"] == "exact", (
                f"Column '{col}' has match_type="
                f"{result[col]['match_type']}, expected 'exact'"
            )

    def test_voting_history_columns_not_mapped(self):
        headers = _get_l2_headers()
        result = suggest_field_mapping(headers)
        for col in _VOTING_HISTORY_COLS:
            assert result[col]["field"] is None, (
                f"Voting history column '{col}' should not be mapped to a field"
            )

    def test_mailing_families_hhcount_maps_correctly(self):
        """Mailing_Families_HHCount maps to mailing_household_size
        per D-13 (not blocked by duplicate guard)."""
        headers = _get_l2_headers()
        result = suggest_field_mapping(headers)
        assert result["Mailing_Families_HHCount"]["field"] == (
            "mailing_household_size"
        ), (
            f"Expected mailing_household_size, got "
            f"{result['Mailing_Families_HHCount']['field']}"
        )

    def test_new_columns_in_voter_columns(self):
        new_cols = {
            "house_number",
            "street_number_parity",
            "mailing_house_number",
            "mailing_address_prefix",
            "mailing_street_name",
            "mailing_designator",
            "mailing_suffix_direction",
            "mailing_apartment_number",
            "mailing_bar_code",
            "mailing_verifier",
            "mailing_household_party_registration",
            "mailing_household_size",
        }
        for col in new_cols:
            assert col in _VOTER_COLUMNS, f"{col} missing from _VOTER_COLUMNS"

    def test_known_typos_are_exact_match(self):
        typo_cols = [
            "Lattitude",
            "Mailng Designator",
            "Mailing Aptartment Number",
        ]
        result = suggest_field_mapping(typo_cols)
        for col in typo_cols:
            assert result[col]["match_type"] == "exact", (
                f"Typo column '{col}' should be exact match, "
                f"got {result[col]['match_type']}"
            )

    def test_header_count_matches_expected(self):
        headers = _get_l2_headers()
        assert len(headers) == 55, f"Expected 55 L2 columns, got {len(headers)}"
        data_cols = [h for h in headers if h not in _VOTING_HISTORY_COLS]
        assert len(data_cols) == 47, f"Expected 47 data columns, got {len(data_cols)}"

    def test_mapped_data_column_count(self):
        """All 47 data columns map to a non-None field."""
        headers = _get_l2_headers()
        result = suggest_field_mapping(headers)
        data_cols = [h for h in headers if h not in _VOTING_HISTORY_COLS]
        mapped_count = sum(1 for c in data_cols if result[c]["field"] is not None)
        assert mapped_count == 47, (
            f"Expected 47 mapped data columns, got {mapped_count}"
        )
