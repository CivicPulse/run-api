"""Unit tests for ImportService CSV processing."""

from __future__ import annotations

import csv
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.import_service import ImportService


class TestDetectColumns:
    """Tests for detect_columns method."""

    def test_detect_utf8_csv_columns(self):
        """Detects columns from UTF-8 CSV content."""
        content = b"First_Name,Last_Name,City,State\nJohn,Doe,Austin,TX\n"
        service = ImportService()
        columns = service.detect_columns(content)
        assert columns == ["First_Name", "Last_Name", "City", "State"]

    def test_detect_latin1_csv_columns(self):
        """Detects columns from Latin-1 encoded CSV content."""
        # Latin-1 encoded header with accented character
        content = "Pr\xe9nom,Nom,Ville\nJean,Dupont,Paris\n".encode("latin-1")
        service = ImportService()
        columns = service.detect_columns(content)
        assert columns[0] == "Pr\xe9nom"
        assert columns[1] == "Nom"
        assert columns[2] == "Ville"

    def test_detect_empty_csv(self):
        """Returns empty list for empty CSV."""
        service = ImportService()
        columns = service.detect_columns(b"")
        assert columns == []

    def test_detect_columns_strips_bom(self):
        """Handles UTF-8 BOM prefix correctly."""
        bom_content = b"\xef\xbb\xbfFirst_Name,Last_Name\nJohn,Doe\n"
        service = ImportService()
        columns = service.detect_columns(bom_content)
        assert columns == ["First_Name", "Last_Name"]


class TestProcessCsvBatch:
    """Tests for process_csv_batch method."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.fixture
    def basic_mapping(self):
        return {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "City": "city",
            "VoterID": "source_id",
        }

    def test_apply_mapping_to_rows(self, service, campaign_id, basic_mapping):
        """Maps CSV columns to canonical voter fields."""
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "City": "Austin", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, basic_mapping, campaign_id, "csv")
        assert len(mapped) == 1
        voter = mapped[0]["voter"]
        assert voter["first_name"] == "John"
        assert voter["last_name"] == "Doe"
        assert voter["city"] == "Austin"
        assert voter["source_id"] == "V001"

    def test_unmapped_columns_go_to_extra_data(self, service, campaign_id):
        """Columns not in mapping go to extra_data JSONB."""
        mapping = {"First_Name": "first_name", "Custom_Field": None}
        rows = [
            {"First_Name": "John", "Custom_Field": "custom_value"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = mapped[0]["voter"]
        assert voter["extra_data"]["Custom_Field"] == "custom_value"

    def test_skip_rows_missing_name_fields(self, service, campaign_id):
        """Rows without first_name AND last_name are skipped."""
        mapping = {"City": "city", "VoterID": "source_id"}
        rows = [
            {"City": "Austin", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        # Row has neither first_name nor last_name
        assert len(mapped) == 1
        assert mapped[0].get("error") is not None

    def test_row_with_first_name_only_is_valid(self, service, campaign_id):
        """Row with first_name but no last_name passes validation."""
        mapping = {"First_Name": "first_name", "VoterID": "source_id"}
        rows = [
            {"First_Name": "John", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert mapped[0].get("error") is None
        assert mapped[0]["voter"]["first_name"] == "John"

    def test_row_with_last_name_only_is_valid(self, service, campaign_id):
        """Row with last_name but no first_name passes validation."""
        mapping = {"Last_Name": "last_name", "VoterID": "source_id"}
        rows = [
            {"Last_Name": "Doe", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert mapped[0].get("error") is None
        assert mapped[0]["voter"]["last_name"] == "Doe"

    def test_campaign_id_and_source_type_added(self, service, campaign_id, basic_mapping):
        """campaign_id and source_type are set on every voter dict."""
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "City": "Austin", "VoterID": "V001"},
        ]
        mapped = service.apply_field_mapping(rows, basic_mapping, campaign_id, "l2")
        voter = mapped[0]["voter"]
        assert voter["campaign_id"] == campaign_id
        assert voter["source_type"] == "l2"

    def test_empty_rows_batch(self, service, campaign_id, basic_mapping):
        """Empty batch returns no results."""
        mapped = service.apply_field_mapping([], basic_mapping, campaign_id, "csv")
        assert mapped == []

    def test_extra_data_only_includes_unmapped_non_empty(self, service, campaign_id):
        """extra_data excludes empty string values from unmapped columns."""
        mapping = {"First_Name": "first_name", "Notes": None, "Empty": None}
        rows = [
            {"First_Name": "John", "Notes": "some note", "Empty": ""},
        ]
        mapped = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = mapped[0]["voter"]
        assert "Notes" in voter["extra_data"]
        # Empty strings are excluded from extra_data
        assert "Empty" not in voter["extra_data"]
