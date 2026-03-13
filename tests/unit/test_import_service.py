"""Unit tests for ImportService CSV processing."""

from __future__ import annotations

import csv
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.dialects.postgresql import dialect as pg_dialect

from app.models.voter import Voter
from app.services.import_service import ImportService, _UPSERT_EXCLUDE


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
            "City": "registration_city",
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
        assert voter["registration_city"] == "Austin"
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
        mapping = {"City": "registration_city", "VoterID": "source_id"}
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


class TestUpsertSetClause:
    """Tests for the fixed SET clause and RETURNING in process_csv_batch."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_upsert_set_clause_all_columns(self, service, campaign_id):
        """SET clause is derived from Voter model columns, not first row keys.

        Even when the first batch row lacks propensity_general, the SET
        clause must still include it because it comes from Voter.__table__.columns.
        """
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "VoterID": "V001"},
        ]

        captured_stmt = None

        async def capture_execute(stmt, *args, **kwargs):
            nonlocal captured_stmt
            captured_stmt = stmt
            mock_result = MagicMock()
            mock_result.all.return_value = [(uuid.uuid4(),)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        # Compile the captured statement to SQL text
        assert captured_stmt is not None
        compiled = captured_stmt.compile(dialect=pg_dialect())
        sql_text = str(compiled)

        # Verify propensity_general is in the SET clause even though
        # the first row didn't have it -- proves we derive from model columns
        assert "propensity_general" in sql_text
        assert "voting_history" in sql_text

        # Verify excluded identity columns are NOT in the SET clause params
        # (id, campaign_id, source_type, source_id, created_at, geom are excluded)
        for excluded in ("geom",):
            assert f"SET {excluded}" not in sql_text.upper().replace('"', "")

    @pytest.mark.asyncio
    async def test_returning_clause_present(self, service, campaign_id):
        """Upsert statement includes RETURNING voters.id."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "Jane", "Last_Name": "Doe", "VoterID": "V002"},
        ]

        captured_stmt = None

        async def capture_execute(stmt, *args, **kwargs):
            nonlocal captured_stmt
            captured_stmt = stmt
            mock_result = MagicMock()
            mock_result.all.return_value = [(uuid.uuid4(),)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        assert captured_stmt is not None
        compiled = captured_stmt.compile(dialect=pg_dialect())
        sql_text = str(compiled)
        assert "RETURNING" in sql_text.upper()

    @pytest.mark.asyncio
    async def test_process_csv_batch_returns_three_tuple(self, service, campaign_id):
        """process_csv_batch returns (count, errors, phones_created)."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
        }
        rows = [
            {"First_Name": "John", "Last_Name": "Doe", "VoterID": "V001"},
        ]

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [(uuid.uuid4(),)]
        session.execute = AsyncMock(return_value=mock_result)

        result = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        assert len(result) == 3
        imported, errors, phones = result
        assert imported == 1
        assert errors == []
        assert phones == 0  # No phone data in this batch
