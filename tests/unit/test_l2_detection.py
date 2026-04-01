"""Unit tests for L2 format detection heuristic."""

from __future__ import annotations

from app.services.import_service import (
    detect_l2_format,
    suggest_field_mapping,
)

_L2_HEADERS = [
    "LALVOTERID",
    "Voters_FirstName",
    "Voters_LastName",
    "Parties_Description",
    "Residence_Addresses_AddressLine",
    "General_Turnout_Score",
]


class TestDetectL2Format:
    def test_l2_detected_with_full_header(self):
        mapping = suggest_field_mapping(_L2_HEADERS)
        result = detect_l2_format(mapping)
        assert result == "l2"

    def test_generic_detected_for_standard_csv(self):
        mapping = suggest_field_mapping(
            ["first_name", "last_name", "email", "phone", "unknown_col"]
        )
        result = detect_l2_format(mapping)
        assert result == "generic"

    def test_none_for_empty_columns(self):
        result = detect_l2_format({})
        assert result is None

    def test_threshold_boundary(self):
        """Exactly at 80% should be 'generic', above 80% should be 'l2'."""
        # 4 exact out of 5 = 80% = NOT above threshold
        mapping_at_80 = {
            "a": {"field": "f1", "match_type": "exact"},
            "b": {"field": "f2", "match_type": "exact"},
            "c": {"field": "f3", "match_type": "exact"},
            "d": {"field": "f4", "match_type": "exact"},
            "e": {"field": None, "match_type": None},
        }
        assert detect_l2_format(mapping_at_80) == "generic"

        # 5 exact out of 6 = 83.3% = above threshold
        mapping_above_80 = {
            **mapping_at_80,
            "f": {"field": "f5", "match_type": "exact"},
        }
        # Now 5 exact / 6 total = 83.3%
        assert detect_l2_format(mapping_above_80) == "l2"

    def test_fuzzy_matches_not_counted_for_l2(self):
        """Only 'exact' match_type counts toward L2 detection."""
        mapping = {
            "a": {"field": "f1", "match_type": "fuzzy"},
            "b": {"field": "f2", "match_type": "fuzzy"},
            "c": {"field": "f3", "match_type": "fuzzy"},
        }
        assert detect_l2_format(mapping) == "generic"

    def test_match_type_present_in_mapping(self):
        """D-17: suggest_field_mapping returns match_type for each column."""
        result = suggest_field_mapping(["First Name", "Unknown Column 999"])
        assert "match_type" in result["First Name"]
        assert "field" in result["First Name"]
        assert result["First Name"]["field"] == "first_name"
        assert result["Unknown Column 999"]["field"] is None
        assert result["Unknown Column 999"]["match_type"] is None
