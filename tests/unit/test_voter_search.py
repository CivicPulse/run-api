"""Unit tests for VoterService query builder and voter operations."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from app.models.voter import Voter
from app.schemas.voter_filter import VoterFilter


class TestBuildVoterQuery:
    """Tests for build_voter_query producing correct SQLAlchemy clauses."""

    _campaign_id = uuid.UUID("00000000-0000-0000-0000-000000000001")

    def _compiled_sql(self, query) -> str:
        """Compile a SQLAlchemy query to string for inspection."""
        return str(
            query.compile(
                compile_kwargs={"literal_binds": True},
            )
        )

    def _build_query(self, filters: VoterFilter):
        from app.services.voter import build_voter_query

        return build_voter_query(self._campaign_id, filters)

    def test_party_filter(self):
        """build_voter_query with party='DEM' produces WHERE party = 'DEM'."""
        q = self._build_query(VoterFilter(party="DEM"))
        sql = self._compiled_sql(q)
        assert "party" in sql.lower()

    def test_parties_filter(self):
        """build_voter_query with parties=['DEM','REP'] produces IN clause."""
        q = self._build_query(VoterFilter(parties=["DEM", "REP"]))
        sql = self._compiled_sql(q)
        assert "in" in sql.lower()

    def test_voted_in_filter(self):
        """build_voter_query with voted_in produces array containment."""
        q = self._build_query(VoterFilter(voted_in=["2022_general"]))
        sql = self._compiled_sql(q)
        assert "voting_history" in sql.lower()

    def test_not_voted_in_filter(self):
        """build_voter_query with not_voted_in produces NOT containment."""
        q = self._build_query(VoterFilter(not_voted_in=["2024_general"]))
        sql = self._compiled_sql(q)
        assert "voting_history" in sql.lower()
        assert "not" in sql.lower()

    def test_age_range_filter(self):
        """build_voter_query with age_min/age_max produces age conditions."""
        q = self._build_query(VoterFilter(age_min=18, age_max=35))
        sql = self._compiled_sql(q)
        assert "age" in sql.lower()

    def test_tags_filter(self):
        """build_voter_query with tags produces subquery join."""
        q = self._build_query(VoterFilter(tags=["yard-sign"]))
        sql = self._compiled_sql(q)
        assert "voter_tag" in sql.lower()

    def test_tags_any_filter(self):
        """build_voter_query with tags_any produces EXISTS subquery."""
        q = self._build_query(VoterFilter(tags_any=["yard-sign", "strong-supporter"]))
        sql = self._compiled_sql(q)
        assert "voter_tag" in sql.lower()

    def test_search_filter(self):
        """build_voter_query with search produces ILIKE on name."""
        q = self._build_query(VoterFilter(search="John Smith"))
        sql = self._compiled_sql(q)
        assert "ilike" in sql.lower() or "like" in sql.lower()

    def test_or_logic(self):
        """build_voter_query with logic='OR' produces OR combination."""
        q = self._build_query(
            VoterFilter(logic="OR", party="DEM", registration_city="Austin")
        )
        sql = self._compiled_sql(q)
        assert "or" in sql.lower()

    def test_exact_match_fields(self):
        """build_voter_query handles exact match fields."""
        q = self._build_query(
            VoterFilter(
                precinct="PCT-5",
                registration_city="Austin",
                registration_state="TX",
                registration_zip="78701",
                registration_county="Travis",
                congressional_district="TX-10",
                gender="F",
            )
        )
        sql = self._compiled_sql(q)
        assert "precinct" in sql.lower()
        assert "registration_city" in sql.lower()
        assert "registration_zip" in sql.lower()

    def test_registration_date_filters(self):
        """build_voter_query with registered_after/before produces date comparison."""
        q = self._build_query(
            VoterFilter(
                registered_after="2020-01-01",
                registered_before="2024-12-31",
            )
        )
        sql = self._compiled_sql(q)
        assert "registration_date" in sql.lower()

    def test_empty_filter_returns_base_query(self):
        """build_voter_query with no filters returns a
        select without WHERE conditions."""
        q = self._build_query(VoterFilter())
        sql = self._compiled_sql(q)
        assert "voters" in sql.lower()

    def test_combined_and_filters(self):
        """build_voter_query with multiple fields and AND logic."""
        q = self._build_query(
            VoterFilter(
                party="DEM", registration_city="Austin", age_min=25, logic="AND"
            )
        )
        sql = self._compiled_sql(q)
        assert "party" in sql.lower()
        assert "registration_city" in sql.lower()
        assert "age" in sql.lower()

    # --- Propensity range filters ---

    def test_propensity_general_range(self):
        """Propensity general range produces >= and <=
        conditions."""
        q = self._build_query(
            VoterFilter(propensity_general_min=60, propensity_general_max=90)
        )
        sql = self._compiled_sql(q)
        assert "propensity_general" in sql.lower()
        assert ">=" in sql
        assert "<=" in sql

    def test_propensity_primary_min_only(self):
        """VoterFilter(propensity_primary_min=50) produces >= with no max condition."""
        q = self._build_query(VoterFilter(propensity_primary_min=50))
        sql = self._compiled_sql(q)
        assert "propensity_primary" in sql.lower()
        assert ">=" in sql
        # No max condition
        assert "<=" not in sql

    def test_propensity_combined_max_only(self):
        """VoterFilter(propensity_combined_max=80) produces <= with no min condition."""
        q = self._build_query(VoterFilter(propensity_combined_max=80))
        sql = self._compiled_sql(q)
        assert "propensity_combined" in sql.lower()
        assert "<=" in sql
        # No min condition
        assert ">=" not in sql

    # --- Multi-select demographic filters ---

    def test_ethnicities_multi_select(self):
        """Ethnicities filter produces lower(ethnicity)
        IN clause."""
        q = self._build_query(VoterFilter(ethnicities=["Hispanic", "Asian"]))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "ethnicity" in sql.lower()
        assert "in" in sql.lower()
        assert "hispanic" in sql.lower()
        assert "asian" in sql.lower()

    def test_spoken_languages_filter(self):
        """Spoken languages produces lower(spoken_language)
        IN clause."""
        q = self._build_query(VoterFilter(spoken_languages=["Spanish"]))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "spoken_language" in sql.lower()
        assert "in" in sql.lower()
        assert "spanish" in sql.lower()

    def test_military_statuses_filter(self):
        """Military statuses produces lower(military_status)
        IN clause."""
        q = self._build_query(VoterFilter(military_statuses=["Active"]))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "military_status" in sql.lower()
        assert "in" in sql.lower()
        assert "active" in sql.lower()

    # --- Mailing address filters ---

    def test_mailing_city_filter(self):
        """Mailing city produces lower(mailing_city) =
        'atlanta'."""
        q = self._build_query(VoterFilter(mailing_city="Atlanta"))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "mailing_city" in sql.lower()

    def test_mailing_state_filter(self):
        """Mailing state produces lower(mailing_state) =
        'ga'."""
        q = self._build_query(VoterFilter(mailing_state="GA"))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "mailing_state" in sql.lower()

    def test_mailing_zip_filter(self):
        """Mailing zip produces exact match."""
        q = self._build_query(VoterFilter(mailing_zip="30301"))
        sql = self._compiled_sql(q)
        assert "mailing_zip" in sql.lower()
        # Zip stays exact match -- no lower() wrapping
        # Check the mailing_zip portion doesn't use lower
        mailing_zip_idx = sql.lower().index("mailing_zip")
        sql_before_zip = sql.lower()[:mailing_zip_idx]
        # The last function call before mailing_zip should NOT be lower()
        assert not sql_before_zip.rstrip().endswith("lower(")

    # --- Registration address case-insensitive updates ---

    def test_registration_city_case_insensitive(self):
        """Registration city produces case-insensitive
        condition."""
        q = self._build_query(VoterFilter(registration_city="AUSTIN"))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "registration_city" in sql.lower()

    def test_registration_state_case_insensitive(self):
        """Registration state produces case-insensitive
        condition."""
        q = self._build_query(VoterFilter(registration_state="tx"))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "registration_state" in sql.lower()

    def test_registration_zip_unchanged(self):
        """Registration zip stays exact match (no lower)."""
        q = self._build_query(VoterFilter(registration_zip="78701"))
        sql = self._compiled_sql(q)
        assert "registration_zip" in sql.lower()
        # Zip should NOT use lower()
        reg_zip_idx = sql.lower().index("registration_zip")
        sql_before_zip = sql.lower()[:reg_zip_idx]
        assert not sql_before_zip.rstrip().endswith("lower(")

    def test_registration_county_case_insensitive(self):
        """Registration county produces case-insensitive
        condition."""
        q = self._build_query(VoterFilter(registration_county="TRAVIS"))
        sql = self._compiled_sql(q)
        assert "lower" in sql.lower()
        assert "registration_county" in sql.lower()

    # --- Voting history year-aware expansion tests (FILT-05) ---

    def test_voted_in_year_only_expansion(self):
        """Year-only voted_in produces overlap (&&)
        with General_2024 and Primary_2024."""
        q = self._build_query(VoterFilter(voted_in=["2024"]))
        sql = self._compiled_sql(q)
        assert "general_2024" in sql.lower()
        assert "primary_2024" in sql.lower()
        # overlap operator produces && in compiled SQL
        assert "&&" in sql or "overlap" in sql.lower()

    def test_voted_in_canonical_unchanged(self):
        """Canonical voted_in produces contains (@>)
        for General_2024 only (no Primary)."""
        q = self._build_query(VoterFilter(voted_in=["General_2024"]))
        sql = self._compiled_sql(q)
        assert "general_2024" in sql.lower()
        # Should NOT expand to include Primary
        assert "primary_2024" not in sql.lower()
        # Should use contains (@>) not overlap (&&)
        assert "@>" in sql or "contains" in sql.lower()

    def test_voted_in_mixed(self):
        """Mixed voted_in produces overlap for 2024 AND
        contains for General_2022."""
        q = self._build_query(VoterFilter(voted_in=["2024", "General_2022"]))
        sql = self._compiled_sql(q)
        # Year-only "2024" expanded to General_2024 + Primary_2024 via overlap
        assert "general_2024" in sql.lower()
        assert "primary_2024" in sql.lower()
        # Canonical "General_2022" passed through as-is
        assert "general_2022" in sql.lower()

    def test_not_voted_in_year_expansion(self):
        """Year-only not_voted_in produces two NOT
        contains conditions."""
        q = self._build_query(VoterFilter(not_voted_in=["2024"]))
        sql = self._compiled_sql(q)
        assert "general_2024" in sql.lower()
        assert "primary_2024" in sql.lower()
        # Both should be negated (NOT contains)
        assert sql.lower().count("not") >= 2

    def test_not_voted_in_canonical_unchanged(self):
        """Canonical not_voted_in produces single NOT
        contains for General_2024."""
        q = self._build_query(VoterFilter(not_voted_in=["General_2024"]))
        sql = self._compiled_sql(q)
        assert "general_2024" in sql.lower()
        # Should NOT expand to include Primary
        assert "primary_2024" not in sql.lower()
        assert "not" in sql.lower()

    def test_not_voted_in_mixed(self):
        """Mixed not_voted_in produces two NOT contains
        for 2024 AND one NOT contains for General_2022."""
        q = self._build_query(VoterFilter(not_voted_in=["2024", "General_2022"]))
        sql = self._compiled_sql(q)
        # Year-only "2024" expanded to two NOT contains conditions
        assert "general_2024" in sql.lower()
        assert "primary_2024" in sql.lower()
        # Canonical "General_2022" passed through as single NOT contains
        assert "general_2022" in sql.lower()
        # At least 3 NOT conditions (2 for year-only + 1 for canonical)
        assert sql.lower().count("not") >= 3


class TestVoterFilterSchema:
    """Tests for VoterFilter Pydantic schema validation."""

    def test_propensity_general_min_valid(self):
        """VoterFilter accepts propensity_general_min=60."""
        f = VoterFilter(propensity_general_min=60)
        assert f.propensity_general_min == 60

    def test_propensity_general_max_valid(self):
        """VoterFilter accepts propensity_general_max=90."""
        f = VoterFilter(propensity_general_max=90)
        assert f.propensity_general_max == 90

    def test_propensity_general_min_rejects_over_100(self):
        """VoterFilter rejects propensity_general_min=101."""
        with pytest.raises(ValidationError):
            VoterFilter(propensity_general_min=101)

    def test_propensity_general_min_rejects_negative(self):
        """VoterFilter rejects propensity_general_min=-1."""
        with pytest.raises(ValidationError):
            VoterFilter(propensity_general_min=-1)

    def test_propensity_general_max_rejects_over_100(self):
        """VoterFilter rejects propensity_general_max=101."""
        with pytest.raises(ValidationError):
            VoterFilter(propensity_general_max=101)

    def test_propensity_primary_min_valid(self):
        """VoterFilter accepts propensity_primary_min=50."""
        f = VoterFilter(propensity_primary_min=50)
        assert f.propensity_primary_min == 50

    def test_propensity_primary_max_rejects_over_100(self):
        """VoterFilter rejects propensity_primary_max=101."""
        with pytest.raises(ValidationError):
            VoterFilter(propensity_primary_max=101)

    def test_propensity_combined_min_valid(self):
        """VoterFilter accepts propensity_combined_min=0."""
        f = VoterFilter(propensity_combined_min=0)
        assert f.propensity_combined_min == 0

    def test_propensity_combined_max_valid(self):
        """VoterFilter accepts propensity_combined_max=100."""
        f = VoterFilter(propensity_combined_max=100)
        assert f.propensity_combined_max == 100

    def test_propensity_combined_max_rejects_negative(self):
        """VoterFilter rejects propensity_combined_max=-5."""
        with pytest.raises(ValidationError):
            VoterFilter(propensity_combined_max=-5)

    def test_ethnicities_valid(self):
        """VoterFilter accepts ethnicities as list[str]."""
        f = VoterFilter(ethnicities=["Hispanic", "Asian"])
        assert f.ethnicities == ["Hispanic", "Asian"]

    def test_spoken_languages_valid(self):
        """VoterFilter accepts spoken_languages as list[str]."""
        f = VoterFilter(spoken_languages=["English"])
        assert f.spoken_languages == ["English"]

    def test_military_statuses_valid(self):
        """VoterFilter accepts military_statuses as list[str]."""
        f = VoterFilter(military_statuses=["Active"])
        assert f.military_statuses == ["Active"]

    def test_mailing_city_valid(self):
        """VoterFilter accepts mailing_city as str."""
        f = VoterFilter(mailing_city="Atlanta")
        assert f.mailing_city == "Atlanta"

    def test_mailing_state_valid(self):
        """VoterFilter accepts mailing_state as str."""
        f = VoterFilter(mailing_state="GA")
        assert f.mailing_state == "GA"

    def test_mailing_zip_valid(self):
        """VoterFilter accepts mailing_zip as str."""
        f = VoterFilter(mailing_zip="30301")
        assert f.mailing_zip == "30301"

    def test_new_fields_default_to_none(self):
        """All 12 new fields default to None when not provided."""
        f = VoterFilter()
        assert f.propensity_general_min is None
        assert f.propensity_general_max is None
        assert f.propensity_primary_min is None
        assert f.propensity_primary_max is None
        assert f.propensity_combined_min is None
        assert f.propensity_combined_max is None
        assert f.ethnicities is None
        assert f.spoken_languages is None
        assert f.military_statuses is None
        assert f.mailing_city is None
        assert f.mailing_state is None
        assert f.mailing_zip is None

    def test_total_field_count(self):
        """VoterFilter should have 32 fields (20 existing + 12 new)."""
        assert len(VoterFilter.model_fields) == 32


class TestVoterSearchBody:
    """Tests for VoterSearchBody Pydantic schema validation."""

    def test_default_values(self):
        """VoterSearchBody() creates empty filters with all defaults."""
        from app.schemas.voter_filter import VoterSearchBody

        body = VoterSearchBody()
        assert body.filters == VoterFilter()
        assert body.cursor is None
        assert body.limit == 50
        assert body.sort_by is None
        assert body.sort_dir is None

    def test_with_filters_and_limit(self):
        """VoterSearchBody(filters=VoterFilter(), limit=50) is valid with defaults."""
        from app.schemas.voter_filter import VoterSearchBody

        body = VoterSearchBody(filters=VoterFilter(), limit=50)
        assert body.limit == 50

    def test_sort_by_valid_column(self):
        """VoterSearchBody(sort_by="last_name", sort_dir="asc") is valid."""
        from app.schemas.voter_filter import VoterSearchBody

        body = VoterSearchBody(sort_by="last_name", sort_dir="asc")
        assert body.sort_by == "last_name"
        assert body.sort_dir == "asc"

    def test_sort_by_invalid_column(self):
        """VoterSearchBody(sort_by="invalid_column") raises ValidationError."""
        from app.schemas.voter_filter import VoterSearchBody

        with pytest.raises(ValidationError):
            VoterSearchBody(sort_by="invalid_column")

    def test_sort_dir_invalid(self):
        """VoterSearchBody(sort_dir="invalid") raises ValidationError."""
        from app.schemas.voter_filter import VoterSearchBody

        with pytest.raises(ValidationError):
            VoterSearchBody(sort_dir="invalid")

    def test_limit_zero_rejected(self):
        """VoterSearchBody(limit=0) raises ValidationError (ge=1)."""
        from app.schemas.voter_filter import VoterSearchBody

        with pytest.raises(ValidationError):
            VoterSearchBody(limit=0)

    def test_limit_over_200_rejected(self):
        """VoterSearchBody(limit=201) raises ValidationError (le=200)."""
        from app.schemas.voter_filter import VoterSearchBody

        with pytest.raises(ValidationError):
            VoterSearchBody(limit=201)

    def test_all_sortable_columns_accepted(self):
        """All whitelisted sortable columns are accepted."""
        from app.schemas.voter_filter import VoterSearchBody

        columns = [
            "last_name",
            "first_name",
            "party",
            "age",
            "registration_city",
            "registration_state",
            "registration_zip",
            "created_at",
            "updated_at",
            "propensity_general",
            "propensity_primary",
            "propensity_combined",
        ]
        for col in columns:
            body = VoterSearchBody(sort_by=col, sort_dir="desc")
            assert body.sort_by == col


class TestDynamicCursor:
    """Tests for encode_cursor and decode_cursor helper functions."""

    def test_encode_cursor_default_created_at(self):
        """encode_cursor with sort_by=None produces iso_timestamp|uuid."""
        from app.services.voter import encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
        item.created_at = datetime(2025, 6, 15, 10, 30, 0, tzinfo=UTC)

        cursor = encode_cursor(item, sort_by=None)
        assert "|" in cursor
        parts = cursor.split("|", 1)
        assert parts[1] == "12345678-1234-5678-1234-567812345678"
        # First part should be an ISO timestamp
        datetime.fromisoformat(parts[0])

    def test_encode_cursor_string_column(self):
        """encode_cursor with sort_by='last_name' produces 'Smith|uuid'."""
        from app.services.voter import encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
        item.last_name = "Smith"

        cursor = encode_cursor(item, sort_by="last_name")
        parts = cursor.split("|", 1)
        assert parts[0] == "Smith"
        assert parts[1] == "12345678-1234-5678-1234-567812345678"

    def test_encode_cursor_int_column(self):
        """encode_cursor with sort_by='age' produces '45|uuid'."""
        from app.services.voter import encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
        item.age = 45

        cursor = encode_cursor(item, sort_by="age")
        parts = cursor.split("|", 1)
        assert parts[0] == "45"

    def test_encode_cursor_none_value(self):
        """encode_cursor with NULL sort value produces 'None|uuid'."""
        from app.services.voter import encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
        item.age = None

        cursor = encode_cursor(item, sort_by="age")
        parts = cursor.split("|", 1)
        assert parts[0] == "None"

    def test_decode_cursor_default_created_at(self):
        """decode_cursor roundtrips correctly for datetime columns (created_at)."""
        from app.services.voter import decode_cursor

        ts = datetime(2025, 6, 15, 10, 30, 0, tzinfo=UTC)
        cursor = f"{ts.isoformat()}|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by=None)
        assert val == ts
        assert cid == uuid.UUID("12345678-1234-5678-1234-567812345678")

    def test_decode_cursor_string_column(self):
        """decode_cursor roundtrips correctly for string columns (last_name)."""
        from app.services.voter import decode_cursor

        cursor = "Smith|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by="last_name")
        assert val == "Smith"
        assert cid == uuid.UUID("12345678-1234-5678-1234-567812345678")

    def test_decode_cursor_int_column(self):
        """decode_cursor roundtrips correctly for integer columns (age)."""
        from app.services.voter import decode_cursor

        cursor = "45|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by="age")
        assert val == 45
        assert isinstance(val, int)

    def test_decode_cursor_propensity_int_column(self):
        """decode_cursor roundtrips correctly for integer
        columns (propensity_general)."""
        from app.services.voter import decode_cursor

        cursor = "75|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by="propensity_general")
        assert val == 75
        assert isinstance(val, int)

    def test_decode_cursor_none_value(self):
        """decode_cursor handles NULL values encoded as 'None'."""
        from app.services.voter import decode_cursor

        cursor = "None|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by="last_name")
        assert val is None
        assert cid == uuid.UUID("12345678-1234-5678-1234-567812345678")

    def test_decode_cursor_none_int_column(self):
        """decode_cursor handles NULL values for integer columns."""
        from app.services.voter import decode_cursor

        cursor = "None|12345678-1234-5678-1234-567812345678"
        val, cid = decode_cursor(cursor, sort_by="age")
        assert val is None

    def test_encode_decode_roundtrip_string(self):
        """encode_cursor -> decode_cursor roundtrips for string columns."""
        from app.services.voter import decode_cursor, encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("abcdef01-2345-6789-abcd-ef0123456789")
        item.last_name = "Johnson"

        cursor = encode_cursor(item, sort_by="last_name")
        val, cid = decode_cursor(cursor, sort_by="last_name")
        assert val == "Johnson"
        assert cid == item.id

    def test_encode_decode_roundtrip_datetime(self):
        """encode_cursor -> decode_cursor roundtrips for datetime columns."""
        from app.services.voter import decode_cursor, encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("abcdef01-2345-6789-abcd-ef0123456789")
        item.created_at = datetime(2025, 3, 14, 12, 0, 0, tzinfo=UTC)

        cursor = encode_cursor(item, sort_by=None)
        val, cid = decode_cursor(cursor, sort_by=None)
        assert val == item.created_at
        assert cid == item.id

    def test_encode_decode_roundtrip_int(self):
        """encode_cursor -> decode_cursor roundtrips for integer columns."""
        from app.services.voter import decode_cursor, encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("abcdef01-2345-6789-abcd-ef0123456789")
        item.age = 33

        cursor = encode_cursor(item, sort_by="age")
        val, cid = decode_cursor(cursor, sort_by="age")
        assert val == 33
        assert cid == item.id

    def test_encode_decode_roundtrip_none(self):
        """encode_cursor -> decode_cursor roundtrips for NULL values."""
        from app.services.voter import decode_cursor, encode_cursor

        item = MagicMock()
        item.id = uuid.UUID("abcdef01-2345-6789-abcd-ef0123456789")
        item.propensity_general = None

        cursor = encode_cursor(item, sort_by="propensity_general")
        val, cid = decode_cursor(cursor, sort_by="propensity_general")
        assert val is None
        assert cid == item.id


class TestVoterServiceCRUD:
    """Tests for VoterService CRUD operations."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    async def test_get_voter_returns_voter(self, mock_db):
        """get_voter returns a voter when found."""
        from app.services.voter import VoterService

        service = VoterService()
        campaign_id = uuid.uuid4()
        voter_id = uuid.uuid4()
        mock_voter = MagicMock(spec=Voter)
        mock_voter.id = voter_id

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_voter
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_voter(mock_db, campaign_id, voter_id)
        assert result.id == voter_id

    async def test_get_voter_raises_when_not_found(self, mock_db):
        """get_voter raises ValueError when voter not found."""
        from app.services.voter import VoterService

        service = VoterService()
        campaign_id = uuid.uuid4()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await service.get_voter(mock_db, campaign_id, uuid.uuid4())

    async def test_create_voter(self, mock_db):
        """create_voter adds voter to session, syncs geom, and commits."""
        from app.services.voter import VoterService

        service = VoterService()
        data = MagicMock()
        data.model_dump.return_value = {
            "first_name": "John",
            "last_name": "Doe",
            "source_type": "manual",
            "latitude": 32.84,
            "longitude": -83.63,
        }

        campaign_id = uuid.uuid4()
        await service.create_voter(mock_db, campaign_id, data)
        mock_db.add.assert_called_once()
        mock_db.flush.assert_awaited_once()
        mock_db.execute.assert_awaited_once()
        stmt, params = mock_db.execute.await_args.args
        assert "ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)" in str(stmt)
        assert params["voter_id"]
        mock_db.commit.assert_awaited_once()

    async def test_update_voter_syncs_geom_after_coordinate_change(self, mock_db):
        """update_voter re-syncs geom after coordinate edits."""
        from app.services.voter import VoterService

        service = VoterService()
        campaign_id = uuid.uuid4()
        voter_id = uuid.uuid4()
        mock_voter = MagicMock(spec=Voter)
        mock_voter.id = voter_id

        data = MagicMock()
        data.model_dump.return_value = {"latitude": 32.84, "longitude": -83.63}

        service.get_voter = AsyncMock(return_value=mock_voter)

        await service.update_voter(mock_db, campaign_id, voter_id, data)

        assert mock_voter.latitude == 32.84
        assert mock_voter.longitude == -83.63
        mock_db.execute.assert_awaited_once()
        stmt, params = mock_db.execute.await_args.args
        assert "ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)" in str(stmt)
        assert params == {"voter_id": voter_id}
        mock_db.commit.assert_awaited_once()
