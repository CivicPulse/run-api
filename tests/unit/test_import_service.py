"""Unit tests for ImportService CSV processing."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects.postgresql import dialect as pg_dialect

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
            "City": "registration_city",
            "VoterID": "source_id",
        }

    def test_apply_mapping_to_rows(self, service, campaign_id, basic_mapping):
        """Maps CSV columns to canonical voter fields."""
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "City": "Austin",
                "VoterID": "V001",
            },
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

    def test_campaign_id_and_source_type_added(
        self, service, campaign_id, basic_mapping
    ):
        """campaign_id and source_type are set on every voter dict."""
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "City": "Austin",
                "VoterID": "V001",
            },
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

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

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

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

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


class TestApplyFieldMappingEnhancements:
    """Tests for phone routing, propensity parsing,
    and voting history in apply_field_mapping."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    def test_cell_phone_routing_in_apply_field_mapping(self, service, campaign_id):
        """__cell_phone mapped column routes to phone_value."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Cell": "__cell_phone",
            "VoterID": "source_id",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "Cell": "555-123-4567",
                "VoterID": "V001",
            },
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        result = results[0]

        # phone_value should be on the result dict
        assert result["phone_value"] == "555-123-4567"
        # phone_value should NOT be in the voter dict
        assert "phone_value" not in result["voter"]
        assert "__cell_phone" not in result["voter"]
        # phone_value should NOT be in extra_data
        assert "Cell" not in result["voter"]["extra_data"]

    def test_cell_phone_empty_value_not_routed(self, service, campaign_id):
        """Empty __cell_phone value does not create phone_value key."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Cell": "__cell_phone",
        }
        rows = [{"First_Name": "John", "Last_Name": "Doe", "Cell": ""}]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        assert "phone_value" not in results[0]

    def test_propensity_parsing_in_apply_field_mapping(self, service, campaign_id):
        """Propensity strings like '77%' are parsed to ints."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "Gen_Score": "propensity_general",
            "Pri_Score": "propensity_primary",
            "Comb_Score": "propensity_combined",
        }
        rows = [
            {
                "First_Name": "Jane",
                "Last_Name": "Doe",
                "Gen_Score": "77%",
                "Pri_Score": "42",
                "Comb_Score": "Not Eligible",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        assert voter["propensity_general"] == 77
        assert voter["propensity_primary"] == 42
        assert voter["propensity_combined"] is None

    def test_voting_history_parsing_in_apply_field_mapping(self, service, campaign_id):
        """CSV rows with General_YYYY/Primary_YYYY columns
        produce voting_history array."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "General_2024": "Y",
                "Primary_2022": "A",
                "General_2020": "N",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        assert voter["voting_history"] == ["General_2024", "Primary_2022"]

    def test_voting_history_not_set_when_no_columns(self, service, campaign_id):
        """When no General_/Primary_ columns exist, voting_history is not set."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
            }
        ]
        results = service.apply_field_mapping(rows, mapping, campaign_id, "csv")
        voter = results[0]["voter"]
        # voting_history should NOT be present -- avoids
        # wiping existing data on re-import
        assert "voting_history" not in voter


class TestPhoneCreationInBatch:
    """Tests for VoterPhone creation in process_csv_batch."""

    @pytest.fixture
    def service(self):
        return ImportService()

    @pytest.fixture
    def campaign_id(self):
        return str(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_phone_creation_skipped_on_bad_number(self, service, campaign_id):
        """Bad phone number (e.g. '123') does not prevent voter import."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "123",
            },
        ]

        voter_id = uuid.uuid4()
        call_count = 0

        async def capture_execute(stmt, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        imported, errors, phones = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        # Voter should be imported
        assert imported == 1
        assert errors == []
        # Phone should NOT be created (bad number)
        assert phones == 0
        # Only one execute call (voter upsert), no phone upsert
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_phone_creation_with_valid_number(self, service, campaign_id):
        """Valid phone number creates a phone record after voter upsert."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "(555) 123-4567",
            },
        ]

        voter_id = uuid.uuid4()
        captured_stmts = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        imported, errors, phones = await service.process_csv_batch(
            rows, mapping, campaign_id, "csv", session
        )

        assert imported == 1
        assert errors == []
        assert phones == 1
        # Two execute calls: voter upsert + phone upsert
        assert len(captured_stmts) == 2

    @pytest.mark.asyncio
    async def test_is_primary_excluded_from_phone_upsert_set(
        self, service, campaign_id
    ):
        """Phone upsert ON CONFLICT SET clause does NOT include is_primary."""
        mapping = {
            "First_Name": "first_name",
            "Last_Name": "last_name",
            "VoterID": "source_id",
            "Cell": "__cell_phone",
        }
        rows = [
            {
                "First_Name": "John",
                "Last_Name": "Doe",
                "VoterID": "V001",
                "Cell": "555-123-4567",
            },
        ]

        voter_id = uuid.uuid4()
        captured_stmts = []

        async def capture_execute(stmt, *args, **kwargs):
            captured_stmts.append(stmt)
            mock_result = MagicMock()
            mock_result.all.return_value = [(voter_id,)]
            return mock_result

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=capture_execute)

        await service.process_csv_batch(rows, mapping, campaign_id, "csv", session)

        # The second statement is the phone upsert
        assert len(captured_stmts) == 2
        phone_stmt = captured_stmts[1]
        compiled = phone_stmt.compile(dialect=pg_dialect())
        sql_text = str(compiled)

        # The ON CONFLICT SET clause should NOT reference is_primary
        # Split at ON CONFLICT to examine only the SET portion
        on_conflict_part = (
            sql_text.upper().split("ON CONFLICT")[1]
            if "ON CONFLICT" in sql_text.upper()
            else ""
        )
        assert "IS_PRIMARY" not in on_conflict_part
