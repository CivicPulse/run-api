"""Unit tests for L2 voting history parsing patterns."""

from __future__ import annotations

from app.services.import_service import parse_voting_history


class TestVotingHistoryL2Patterns:
    def test_canonical_general(self):
        row = {"General_2024": "Y", "name": "test"}
        assert parse_voting_history(row) == ["General_2024"]

    def test_canonical_primary(self):
        row = {"Primary_2024": "Y"}
        assert parse_voting_history(row) == ["Primary_2024"]

    def test_voted_in_yyyy_maps_to_general(self):
        """D-01: 'Voted in YYYY' (unqualified) maps to General_YYYY."""
        row = {"Voted in 2022": "Y"}
        assert parse_voting_history(row) == ["General_2022"]

    def test_voted_in_yyyy_primary_maps_to_primary(self):
        """D-02: 'Voted in YYYY Primary' maps to Primary_YYYY."""
        row = {"Voted in 2022 Primary": "A"}
        assert parse_voting_history(row) == ["Primary_2022"]

    def test_typo_voter_in_yyyy_primary(self):
        """D-04: 'Voter in YYYY Primary' (typo) maps to Primary_YYYY."""
        row = {"Voter in 2020 Primary": "E"}
        assert parse_voting_history(row) == ["Primary_2020"]

    def test_bare_year_maps_to_general(self):
        """D-03: Bare '2018' column maps to General_2018."""
        row = {"2018": "Y"}
        assert parse_voting_history(row) == ["General_2018"]

    def test_full_l2_history_all_patterns(self):
        """All 8 L2 voting history columns from sample file."""
        row = {
            "General_2024": "Y",
            "Primary_2024": "A",
            "Voted in 2022": "Y",
            "Voted in 2020": "E",
            "Voted in 2018": "Y",
            "Voted in 2022 Primary": "Y",
            "Voter in 2020 Primary": "A",
            "Voted in 2018 Primary": "Y",
        }
        result = parse_voting_history(row)
        assert result == sorted(
            [
                "General_2024",
                "Primary_2024",
                "General_2022",
                "General_2020",
                "General_2018",
                "Primary_2022",
                "Primary_2020",
                "Primary_2018",
            ]
        )

    def test_empty_value_excluded(self):
        row = {"General_2024": "", "Voted in 2022": "  "}
        assert parse_voting_history(row) == []

    def test_non_voted_value_excluded(self):
        row = {"General_2024": "N", "Voted in 2022": "X"}
        assert parse_voting_history(row) == []

    def test_voted_values_case_insensitive(self):
        row = {"Voted in 2022": "y", "Voted in 2020": "a", "2018": "e"}
        assert parse_voting_history(row) == [
            "General_2018",
            "General_2020",
            "General_2022",
        ]
