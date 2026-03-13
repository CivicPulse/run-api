"""Unit tests for ImportService fuzzy field mapping."""

from __future__ import annotations

import pytest

from app.services.import_service import suggest_field_mapping


class TestSuggestFieldMapping:
    """Tests for suggest_field_mapping function."""

    def test_standard_column_names(self):
        """Standard CSV column names map to canonical fields."""
        result = suggest_field_mapping(
            ["First_Name", "Last_Name", "DOB", "ZIP"]
        )
        assert result["First_Name"] == "first_name"
        assert result["Last_Name"] == "last_name"
        assert result["DOB"] == "date_of_birth"
        assert result["ZIP"] == "registration_zip"

    def test_l2_specific_columns(self):
        """L2 vendor-specific column names map correctly."""
        result = suggest_field_mapping(
            ["LALVOTERID", "Voters_FirstName", "Voters_LastName"]
        )
        assert result["LALVOTERID"] == "source_id"
        assert result["Voters_FirstName"] == "first_name"
        assert result["Voters_LastName"] == "last_name"

    def test_l2_party_and_address(self):
        """L2 party and address columns map correctly."""
        result = suggest_field_mapping(
            ["Parties_Description", "Residence_Addresses_AddressLine"]
        )
        assert result["Parties_Description"] == "party"
        assert result["Residence_Addresses_AddressLine"] == "registration_line1"

    def test_unknown_column_returns_none(self):
        """Completely unknown columns return None (will go to extra_data)."""
        result = suggest_field_mapping(["totally_random_col"])
        assert result["totally_random_col"] is None

    def test_case_insensitive_matching(self):
        """Matching is case-insensitive."""
        result = suggest_field_mapping(["FIRST_NAME", "last_name", "City"])
        assert result["FIRST_NAME"] == "first_name"
        assert result["last_name"] == "last_name"
        assert result["City"] == "registration_city"

    def test_fuzzy_threshold_at_75_percent(self):
        """Columns with >= 75% similarity match; below that they don't."""
        result = suggest_field_mapping(["firstname", "xyz123"])
        assert result["firstname"] == "first_name"
        assert result["xyz123"] is None

    def test_partial_match_below_threshold(self):
        """Short gibberish doesn't match any field."""
        result = suggest_field_mapping(["abc", "qqq"])
        assert result["abc"] is None
        assert result["qqq"] is None

    def test_all_canonical_fields_have_aliases(self):
        """Each canonical voter field has at least one matching alias."""
        from app.services.import_service import CANONICAL_FIELDS

        # Every canonical field should have at least one alias
        for field_name, aliases in CANONICAL_FIELDS.items():
            assert len(aliases) > 0, f"No aliases for {field_name}"

    def test_no_duplicate_mapping_across_columns(self):
        """Different CSV columns should not map to the same field unless exact match."""
        result = suggest_field_mapping(
            ["first_name", "last_name", "city", "state", "zip_code"]
        )
        # All should map to distinct fields
        mapped = [v for v in result.values() if v is not None]
        assert len(mapped) == len(set(mapped)), "Duplicate field mappings found"

    def test_empty_columns_list(self):
        """Empty column list returns empty dict."""
        result = suggest_field_mapping([])
        assert result == {}

    def test_whitespace_in_column_names(self):
        """Column names with extra whitespace still match."""
        result = suggest_field_mapping(["  First Name  ", " ZIP Code "])
        assert result["  First Name  "] == "first_name"
        assert result[" ZIP Code "] == "registration_zip"

    def test_political_fields(self):
        """Political/district columns map correctly."""
        result = suggest_field_mapping(
            ["party", "precinct", "congressional_district"]
        )
        assert result["party"] == "party"
        assert result["precinct"] == "precinct"
        assert result["congressional_district"] == "congressional_district"

    def test_address_fields(self):
        """Address columns map correctly to registration_ canonical names."""
        result = suggest_field_mapping(
            ["address_line1", "address_line2", "city", "state", "zip_code", "county"]
        )
        assert result["address_line1"] == "registration_line1"
        assert result["address_line2"] == "registration_line2"
        assert result["city"] == "registration_city"
        assert result["state"] == "registration_state"
        assert result["zip_code"] == "registration_zip"
        assert result["county"] == "registration_county"

    def test_l2_expanded_aliases(self):
        """L2 official column headers map to canonical fields."""
        # Test L2 propensity aliases
        result = suggest_field_mapping(["General_Turnout_Score"])
        assert result["General_Turnout_Score"] == "propensity_general"

        result = suggest_field_mapping(["Primary_Turnout_Score"])
        assert result["Primary_Turnout_Score"] == "propensity_primary"

        # Test L2 mailing aliases
        result = suggest_field_mapping(["Mail_VAddressLine1"])
        assert result["Mail_VAddressLine1"] == "mailing_line1"

        result = suggest_field_mapping(["Mail_VCity"])
        assert result["Mail_VCity"] == "mailing_city"

        result = suggest_field_mapping(["Mail_VState"])
        assert result["Mail_VState"] == "mailing_state"

        result = suggest_field_mapping(["Mail_VZip"])
        assert result["Mail_VZip"] == "mailing_zip"

        # Test L2 household aliases
        result = suggest_field_mapping(["Voters_HHId"])
        assert result["Voters_HHId"] == "household_id"

        result = suggest_field_mapping(["Voters_FamilyId"])
        assert result["Voters_FamilyId"] == "family_id"

        # Test L2 demographic aliases
        result = suggest_field_mapping(["CommercialData_MaritalStatus"])
        assert result["CommercialData_MaritalStatus"] == "marital_status"

    def test_cell_phone_maps_to_special_field(self):
        """Voters_CellPhoneFull maps to __cell_phone special field."""
        result = suggest_field_mapping(["Voters_CellPhoneFull"])
        assert result["Voters_CellPhoneFull"] == "__cell_phone"

    def test_cell_phone_not_in_voter_columns(self):
        """__cell_phone is NOT in _VOTER_COLUMNS (routes to VoterPhone, not Voter)."""
        from app.services.import_service import _VOTER_COLUMNS

        assert "__cell_phone" not in _VOTER_COLUMNS

    def test_unmapped_l2_commercial_field(self):
        """Unmapped L2 commercial fields return None."""
        result = suggest_field_mapping(["CommercialData_EstimatedHHIncomeAmount"])
        assert result["CommercialData_EstimatedHHIncomeAmount"] is None
