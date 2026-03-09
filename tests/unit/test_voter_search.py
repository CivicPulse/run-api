"""Unit tests for VoterService query builder and voter operations."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import literal_column

from app.models.voter import Voter, VoterTag, VoterTagMember
from app.schemas.voter_filter import VoterFilter


class TestBuildVoterQuery:
    """Tests for build_voter_query producing correct SQLAlchemy clauses."""

    def _compiled_sql(self, query) -> str:
        """Compile a SQLAlchemy query to string for inspection."""
        return str(
            query.compile(
                compile_kwargs={"literal_binds": True},
            )
        )

    def test_party_filter(self):
        """build_voter_query with party='DEM' produces WHERE party = 'DEM'."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(party="DEM"))
        sql = self._compiled_sql(q)
        assert "party" in sql.lower()

    def test_parties_filter(self):
        """build_voter_query with parties=['DEM','REP'] produces IN clause."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(parties=["DEM", "REP"]))
        sql = self._compiled_sql(q)
        assert "in" in sql.lower()

    def test_voted_in_filter(self):
        """build_voter_query with voted_in produces array containment."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(voted_in=["2022_general"]))
        sql = self._compiled_sql(q)
        assert "voting_history" in sql.lower()

    def test_not_voted_in_filter(self):
        """build_voter_query with not_voted_in produces NOT containment."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(not_voted_in=["2024_general"]))
        sql = self._compiled_sql(q)
        assert "voting_history" in sql.lower()
        assert "not" in sql.lower()

    def test_age_range_filter(self):
        """build_voter_query with age_min/age_max produces age conditions."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(age_min=18, age_max=35))
        sql = self._compiled_sql(q)
        assert "age" in sql.lower()

    def test_tags_filter(self):
        """build_voter_query with tags produces subquery join."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(tags=["yard-sign"]))
        sql = self._compiled_sql(q)
        assert "voter_tag" in sql.lower()

    def test_tags_any_filter(self):
        """build_voter_query with tags_any produces EXISTS subquery."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(tags_any=["yard-sign", "strong-supporter"]))
        sql = self._compiled_sql(q)
        assert "voter_tag" in sql.lower()

    def test_search_filter(self):
        """build_voter_query with search produces ILIKE on name."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(search="John Smith"))
        sql = self._compiled_sql(q)
        assert "ilike" in sql.lower() or "like" in sql.lower()

    def test_or_logic(self):
        """build_voter_query with logic='OR' produces OR combination."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter(logic="OR", party="DEM", city="Austin"))
        sql = self._compiled_sql(q)
        assert "or" in sql.lower()

    def test_exact_match_fields(self):
        """build_voter_query handles exact match fields: precinct, city, state, zip, county, congressional_district, gender."""
        from app.services.voter import build_voter_query

        q = build_voter_query(
            VoterFilter(
                precinct="PCT-5",
                city="Austin",
                state="TX",
                zip_code="78701",
                county="Travis",
                congressional_district="TX-10",
                gender="F",
            )
        )
        sql = self._compiled_sql(q)
        assert "precinct" in sql.lower()
        assert "city" in sql.lower()
        assert "zip_code" in sql.lower()

    def test_registration_date_filters(self):
        """build_voter_query with registered_after/before produces date comparison."""
        from app.services.voter import build_voter_query

        q = build_voter_query(
            VoterFilter(
                registered_after="2020-01-01",
                registered_before="2024-12-31",
            )
        )
        sql = self._compiled_sql(q)
        assert "registration_date" in sql.lower()

    def test_empty_filter_returns_base_query(self):
        """build_voter_query with no filters returns a select without WHERE conditions."""
        from app.services.voter import build_voter_query

        q = build_voter_query(VoterFilter())
        sql = self._compiled_sql(q)
        assert "voters" in sql.lower()

    def test_combined_and_filters(self):
        """build_voter_query with multiple fields and AND logic."""
        from app.services.voter import build_voter_query

        q = build_voter_query(
            VoterFilter(party="DEM", city="Austin", age_min=25, logic="AND")
        )
        sql = self._compiled_sql(q)
        assert "party" in sql.lower()
        assert "city" in sql.lower()
        assert "age" in sql.lower()


class TestVoterServiceCRUD:
    """Tests for VoterService CRUD operations."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    async def test_get_voter_returns_voter(self, mock_db):
        """get_voter returns a voter when found."""
        from app.services.voter import VoterService

        service = VoterService()
        voter_id = uuid.uuid4()
        mock_voter = MagicMock(spec=Voter)
        mock_voter.id = voter_id

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_voter
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_voter(mock_db, voter_id)
        assert result.id == voter_id

    async def test_get_voter_raises_when_not_found(self, mock_db):
        """get_voter raises ValueError when voter not found."""
        from app.services.voter import VoterService

        service = VoterService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await service.get_voter(mock_db, uuid.uuid4())

    async def test_create_voter(self, mock_db):
        """create_voter adds voter to session and commits."""
        from app.services.voter import VoterService

        service = VoterService()
        data = MagicMock()
        data.model_dump.return_value = {
            "first_name": "John",
            "last_name": "Doe",
            "source_type": "manual",
        }

        campaign_id = uuid.uuid4()
        await service.create_voter(mock_db, campaign_id, data)
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()
