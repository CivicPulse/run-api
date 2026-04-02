"""Integration test: full L2 import flow with sample file.

Per D-19: Verifies suggest_field_mapping + detect_l2_format +
parse_voting_history + ImportService.apply_field_mapping work correctly
together with the real L2 sample CSV.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from app.services.import_service import (
    ImportService,
    detect_l2_format,
    parse_voting_history,
    suggest_field_mapping,
)

_SAMPLE_PATH = Path(__file__).resolve().parents[2] / "data" / "example-2026-02-24.csv"

pytestmark = pytest.mark.skipif(
    not _SAMPLE_PATH.exists(), reason="L2 sample CSV not available"
)


def _read_sample_rows(
    max_rows: int = 5,
) -> tuple[list[str], list[dict[str, str]]]:
    """Read headers and first N data rows from L2 sample."""
    with open(_SAMPLE_PATH) as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        rows = []
        for i, row in enumerate(reader):
            if i >= max_rows:
                break
            rows.append(row)
    return list(headers), rows


# Voting history column names in the L2 sample (8 columns)
_HISTORY_COLS = {
    "General_2024",
    "Primary_2024",
    "Voted in 2022",
    "Voted in 2020",
    "Voted in 2018",
    "Voted in 2022 Primary",
    "Voter in 2020 Primary",
    "Voted in 2018 Primary",
}


@pytest.mark.integration
class TestL2FullImportFlow:
    def test_l2_format_detected(self):
        """L2 sample file is detected as L2 format."""
        headers, _ = _read_sample_rows(0)
        mapping = suggest_field_mapping(headers)
        fmt = detect_l2_format(mapping)
        assert fmt == "l2", f"Expected 'l2', got '{fmt}'"

    def test_all_data_columns_mapped(self):
        """All 47 non-history columns map to a canonical field."""
        headers, _ = _read_sample_rows(0)
        mapping = suggest_field_mapping(headers)

        unmapped = []
        for col in headers:
            if col in _HISTORY_COLS:
                continue
            entry = mapping.get(col, {})
            if entry.get("field") is None:
                unmapped.append(col)
        assert unmapped == [], f"Unmapped data columns: {unmapped}"

    def test_voting_history_parsed_for_all_rows(self):
        """Each sample row's voting history columns parse into canonical entries."""
        _, rows = _read_sample_rows(5)
        for i, row in enumerate(rows):
            history = parse_voting_history(row)
            # Every row should produce some history entries
            # (sample has Y values in various history columns)
            for entry in history:
                assert entry.startswith("General_") or entry.startswith("Primary_"), (
                    f"Row {i}: non-canonical history entry '{entry}'"
                )

    def test_apply_field_mapping_populates_new_columns(self):
        """apply_field_mapping correctly maps L2 CSV values to canonical
        field names including new columns.
        """
        headers, rows = _read_sample_rows(3)
        mapping_result = suggest_field_mapping(headers)

        # Build the mapping dict: csv_col -> canonical_field (only mapped)
        field_mapping: dict[str, str | None] = {}
        for col, entry in mapping_result.items():
            field_mapping[col] = entry.get("field")

        svc = ImportService()
        results = svc.apply_field_mapping(rows, field_mapping, "test-campaign-id", "l2")

        for i, result in enumerate(results):
            voter = result["voter"]
            assert "error" not in result, (
                f"Row {i}: unexpected error: {result.get('error')}"
            )

            # Verify core fields populated
            assert voter.get("first_name"), f"Row {i}: first_name missing"
            assert voter.get("last_name"), f"Row {i}: last_name missing"
            assert voter.get("source_id"), f"Row {i}: source_id missing"

            # Verify campaign_id and source_type propagation
            assert voter.get("campaign_id") == "test-campaign-id"
            assert voter.get("source_type") == "l2"

            # Verify new L2 columns populated from CSV
            original_row = rows[i]

            if original_row.get("House Number"):
                assert voter.get("house_number") == original_row["House Number"], (
                    f"Row {i}: house_number mismatch"
                )

            if original_row.get("Mailng Designator"):
                assert (
                    voter.get("mailing_designator") == original_row["Mailng Designator"]
                ), f"Row {i}: mailing_designator mismatch (typo alias)"

            if original_row.get("Mailing Aptartment Number"):
                assert (
                    voter.get("mailing_apartment_number")
                    == original_row["Mailing Aptartment Number"]
                ), f"Row {i}: mailing_apartment_number mismatch (typo alias)"

            # Verify voting history was parsed (integrated into voter dict)
            if any(original_row.get(col) in ("Y", "A", "E") for col in _HISTORY_COLS):
                history = voter.get("voting_history", [])
                assert len(history) > 0, f"Row {i}: voting_history should be non-empty"

    def test_integer_coercion_mailing_household_size(self):
        """mailing_household_size CSV string values coerce to integers."""
        headers, rows = _read_sample_rows(3)
        mapping_result = suggest_field_mapping(headers)

        field_mapping: dict[str, str | None] = {}
        for col, entry in mapping_result.items():
            field_mapping[col] = entry.get("field")

        svc = ImportService()
        results = svc.apply_field_mapping(rows, field_mapping, "test-campaign-id", "l2")

        for i, result in enumerate(results):
            voter = result["voter"]
            val = voter.get("mailing_household_size")
            if val is not None:
                assert isinstance(val, int), (
                    f"Row {i}: mailing_household_size should be int, "
                    f"got {type(val).__name__}: {val}"
                )

    def test_propensity_parsed_to_int(self):
        """Propensity percentage strings (e.g. '77%') parsed to integers."""
        headers, rows = _read_sample_rows(3)
        mapping_result = suggest_field_mapping(headers)

        field_mapping: dict[str, str | None] = {}
        for col, entry in mapping_result.items():
            field_mapping[col] = entry.get("field")

        svc = ImportService()
        results = svc.apply_field_mapping(rows, field_mapping, "test-campaign-id", "l2")

        for i, result in enumerate(results):
            voter = result["voter"]
            for prop_field in (
                "propensity_general",
                "propensity_primary",
                "propensity_combined",
            ):
                val = voter.get(prop_field)
                if val is not None:
                    assert isinstance(val, int), (
                        f"Row {i}: {prop_field} should be int, "
                        f"got {type(val).__name__}: {val}"
                    )

    def test_latitude_longitude_parsed_to_float(self):
        """Latitude/longitude CSV strings parsed to floats."""
        headers, rows = _read_sample_rows(3)
        mapping_result = suggest_field_mapping(headers)

        field_mapping: dict[str, str | None] = {}
        for col, entry in mapping_result.items():
            field_mapping[col] = entry.get("field")

        svc = ImportService()
        results = svc.apply_field_mapping(rows, field_mapping, "test-campaign-id", "l2")

        for i, result in enumerate(results):
            voter = result["voter"]
            lat = voter.get("latitude")
            lon = voter.get("longitude")
            if lat is not None:
                assert isinstance(lat, float), (
                    f"Row {i}: latitude should be float, got {type(lat).__name__}"
                )
            if lon is not None:
                assert isinstance(lon, float), (
                    f"Row {i}: longitude should be float, got {type(lon).__name__}"
                )
