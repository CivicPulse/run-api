"""Unit tests for canvassing dashboard service -- DASH-01."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.walk_list import DoorKnockResult
from app.schemas.dashboard import (
    CanvasserBreakdown,
    CanvassingSummary,
    TurfBreakdown,
)
from app.services.dashboard.canvassing import (
    CONTACT_RESULTS,
    CanvassingDashboardService,
)

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()


def _mock_session(
    mappings_one: dict | None = None,
    mappings_all: list[dict] | None = None,
) -> AsyncMock:
    """Return an AsyncMock session with execute returning mappings."""
    session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()
    mock_mappings = MagicMock()
    if mappings_one is not None:
        mock_mappings.one.return_value = mappings_one
    if mappings_all is not None:
        mock_mappings.all.return_value = mappings_all
    mock_result.mappings.return_value = mock_mappings
    session.execute.return_value = mock_result
    return session


def _summary_row(
    doors: int = 100,
    contacts: int = 45,
    **outcome_overrides: int,
) -> dict:
    """Build a mapping that mimics the summary query result."""
    outcomes = {r.value: 0 for r in DoorKnockResult}
    outcomes.update(outcome_overrides)
    return {
        "doors_knocked": doors,
        "contacts_made": contacts,
        **outcomes,
    }


def _turf_row(
    turf_id: uuid.UUID | None = None,
    turf_name: str = "Downtown",
    doors: int = 30,
    contacts: int = 15,
) -> dict:
    row = {
        "turf_id": turf_id or uuid.uuid4(),
        "turf_name": turf_name,
        "doors_knocked": doors,
        "contacts_made": contacts,
    }
    row.update({r.value: 0 for r in DoorKnockResult})
    return row


def _canvasser_row(
    user_id: str = "user-1",
    display_name: str = "Alice",
    doors: int = 20,
    contacts: int = 10,
) -> dict:
    row = {
        "user_id": user_id,
        "display_name": display_name,
        "doors_knocked": doors,
        "contacts_made": contacts,
    }
    row.update({r.value: 0 for r in DoorKnockResult})
    return row


# ---------------------------------------------------------------
# Tests
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_canvassing_summary_returns_schema():
    """get_summary returns a CanvassingSummary with correct values."""
    session = _mock_session(
        mappings_one=_summary_row(doors=100, contacts=45),
    )
    service = CanvassingDashboardService()
    result = await service.get_summary(session, CAMPAIGN_ID)

    assert isinstance(result, CanvassingSummary)
    assert result.doors_knocked == 100
    assert result.contacts_made == 45
    assert result.contact_rate == round(45 / 100, 4)


@pytest.mark.asyncio
async def test_canvassing_summary_empty_returns_zeros():
    """Empty campaign data returns all zeros."""
    session = _mock_session(
        mappings_one=_summary_row(doors=0, contacts=0),
    )
    result = await CanvassingDashboardService.get_summary(
        session, CAMPAIGN_ID,
    )

    assert result.doors_knocked == 0
    assert result.contacts_made == 0
    assert result.contact_rate == 0.0
    assert result.outcomes.supporter == 0
    assert result.outcomes.not_home == 0


@pytest.mark.asyncio
async def test_canvassing_summary_with_date_filter():
    """start_date and end_date are passed to the service."""
    from datetime import date

    session = _mock_session(
        mappings_one=_summary_row(doors=10, contacts=5),
    )
    result = await CanvassingDashboardService.get_summary(
        session,
        CAMPAIGN_ID,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )
    # Service still called execute; if date filter breaks the
    # query, the mock would not return correctly.
    assert isinstance(result, CanvassingSummary)
    assert result.doors_knocked == 10
    session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_canvassing_by_turf_returns_list():
    """get_by_turf returns a list of TurfBreakdown."""
    rows = [_turf_row(turf_name="Downtown"), _turf_row(turf_name="Uptown")]
    session = _mock_session(mappings_all=rows)
    result = await CanvassingDashboardService.get_by_turf(
        session, CAMPAIGN_ID,
    )

    assert len(result) == 2
    assert all(isinstance(r, TurfBreakdown) for r in result)
    assert result[0].turf_name == "Downtown"
    assert result[1].turf_name == "Uptown"


@pytest.mark.asyncio
async def test_canvassing_by_canvasser_returns_list():
    """get_by_canvasser returns a list of CanvasserBreakdown."""
    rows = [
        _canvasser_row(user_id="u1", display_name="Alice"),
        _canvasser_row(user_id="u2", display_name="Bob"),
    ]
    session = _mock_session(mappings_all=rows)
    result = await CanvassingDashboardService.get_by_canvasser(
        session, CAMPAIGN_ID,
    )

    assert len(result) == 2
    assert all(isinstance(r, CanvasserBreakdown) for r in result)
    assert result[0].display_name == "Alice"


@pytest.mark.asyncio
async def test_contact_rate_excludes_not_home():
    """NOT_HOME, MOVED, DECEASED, COME_BACK_LATER, INACCESSIBLE are not contacts."""  # noqa: E501
    non_contact = {
        DoorKnockResult.NOT_HOME,
        DoorKnockResult.MOVED,
        DoorKnockResult.DECEASED,
        DoorKnockResult.COME_BACK_LATER,
        DoorKnockResult.INACCESSIBLE,
    }
    for result in non_contact:
        assert result.value not in CONTACT_RESULTS

    # Contacts are supporter, undecided, opposed, refused
    for result in [
        DoorKnockResult.SUPPORTER,
        DoorKnockResult.UNDECIDED,
        DoorKnockResult.OPPOSED,
        DoorKnockResult.REFUSED,
    ]:
        assert result.value in CONTACT_RESULTS
