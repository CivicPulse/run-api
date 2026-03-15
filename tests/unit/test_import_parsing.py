"""Unit tests for import parsing utility functions.

Tests parse_propensity, normalize_phone, and parse_voting_history
functions from import_service.py.
"""

from __future__ import annotations

from app.services.import_service import (
    normalize_phone,
    parse_propensity,
    parse_voting_history,
)


class TestPropensityParsing:
    """Tests for parse_propensity function."""

    def test_percentage_with_percent_sign(self):
        """'77%' returns 77."""
        assert parse_propensity("77%") == 77

    def test_percentage_without_percent_sign(self):
        """'42' returns 42."""
        assert parse_propensity("42") == 42

    def test_zero_percent(self):
        """'0%' returns 0 (valid edge case)."""
        assert parse_propensity("0%") == 0

    def test_zero_without_percent(self):
        """'0' returns 0."""
        assert parse_propensity("0") == 0

    def test_hundred_percent(self):
        """'100%' returns 100 (valid edge case)."""
        assert parse_propensity("100%") == 100

    def test_hundred_without_percent(self):
        """'100' returns 100."""
        assert parse_propensity("100") == 100

    def test_out_of_range_101(self):
        """'101%' returns None (out of range)."""
        assert parse_propensity("101%") is None

    def test_out_of_range_large(self):
        """'200' returns None (out of range)."""
        assert parse_propensity("200") is None

    def test_not_eligible(self):
        """'Not Eligible' returns None."""
        assert parse_propensity("Not Eligible") is None

    def test_high_label(self):
        """'High' returns None."""
        assert parse_propensity("High") is None

    def test_na(self):
        """'N/A' returns None."""
        assert parse_propensity("N/A") is None

    def test_empty_string(self):
        """Empty string returns None."""
        assert parse_propensity("") is None

    def test_whitespace_only(self):
        """Whitespace-only string returns None."""
        assert parse_propensity("  ") is None

    def test_leading_trailing_whitespace(self):
        """Whitespace around valid value is stripped."""
        assert parse_propensity(" 50% ") == 50

    def test_negative_number(self):
        """Negative numbers return None."""
        assert parse_propensity("-5") is None


class TestPhoneNormalization:
    """Tests for normalize_phone function."""

    def test_formatted_us_number_parens(self):
        """'(555) 123-4567' normalizes to '5551234567'."""
        assert normalize_phone("(555) 123-4567") == "5551234567"

    def test_formatted_dashes(self):
        """'555-123-4567' normalizes to '5551234567'."""
        assert normalize_phone("555-123-4567") == "5551234567"

    def test_plain_ten_digits(self):
        """'5551234567' returns '5551234567' unchanged."""
        assert normalize_phone("5551234567") == "5551234567"

    def test_eleven_digits_with_leading_1(self):
        """'1-555-123-4567' strips leading US country code."""
        assert normalize_phone("1-555-123-4567") == "5551234567"

    def test_plus_one_format(self):
        """'+1 555 123 4567' strips +1 country code."""
        assert normalize_phone("+1 555 123 4567") == "5551234567"

    def test_dots_separator(self):
        """'555.123.4567' normalizes to '5551234567'."""
        assert normalize_phone("555.123.4567") == "5551234567"

    def test_too_short(self):
        """'123' returns None (too few digits)."""
        assert normalize_phone("123") is None

    def test_empty_string(self):
        """Empty string returns None."""
        assert normalize_phone("") is None

    def test_non_numeric(self):
        """'abc' returns None."""
        assert normalize_phone("abc") is None

    def test_too_many_digits(self):
        """12 digits (not 11 starting with 1) returns None."""
        assert normalize_phone("123456789012") is None

    def test_leading_trailing_whitespace(self):
        """Whitespace around phone is stripped before processing."""
        assert normalize_phone("  5551234567  ") == "5551234567"


class TestVotingHistoryParsing:
    """Tests for parse_voting_history function."""

    def test_mixed_voted_and_not_voted(self):
        """Y/A/E count as voted; N does not."""
        result = parse_voting_history(
            {
                "General_2024": "Y",
                "Primary_2022": "A",
                "General_2020": "N",
                "Primary_2020": "E",
                "Some_Other_Col": "value",
            }
        )
        assert result == ["General_2024", "Primary_2020", "Primary_2022"]

    def test_no_voted_entries(self):
        """All N values returns empty list."""
        result = parse_voting_history(
            {
                "General_2024": "N",
                "Primary_2022": "N",
            }
        )
        assert result == []

    def test_empty_dict(self):
        """Empty dict returns empty list."""
        assert parse_voting_history({}) == []

    def test_whitespace_handling(self):
        """Values with whitespace are stripped and uppercased."""
        result = parse_voting_history({"General_2024": " y "})
        assert result == ["General_2024"]

    def test_sorted_output(self):
        """Output list is sorted alphabetically."""
        result = parse_voting_history(
            {
                "Primary_2024": "Y",
                "General_2020": "Y",
                "General_2024": "Y",
                "Primary_2020": "A",
            }
        )
        assert result == [
            "General_2020",
            "General_2024",
            "Primary_2020",
            "Primary_2024",
        ]

    def test_ignores_non_election_columns(self):
        """Only General_YYYY and Primary_YYYY patterns match."""
        result = parse_voting_history(
            {
                "General_2024": "Y",
                "Runoff_2024": "Y",
                "Special_2023": "Y",
                "Municipal_2022": "Y",
            }
        )
        assert result == ["General_2024"]

    def test_case_insensitive_values(self):
        """Lowercase y, a, e also count as voted."""
        result = parse_voting_history(
            {
                "General_2024": "y",
                "Primary_2022": "a",
                "General_2020": "e",
            }
        )
        assert result == ["General_2020", "General_2024", "Primary_2022"]

    def test_empty_value_not_counted(self):
        """Empty string value is not counted as voted."""
        result = parse_voting_history({"General_2024": ""})
        assert result == []
