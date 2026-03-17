"""Unit tests for volunteer dashboard service -- DASH-03."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import (
    ShiftBreakdown,
    VolunteerBreakdown,
    VolunteerSummary,
)
from app.services.dashboard.volunteer import VolunteerDashboardService

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()


def _mock_session_multi(*mappings_ones: dict) -> AsyncMock:
    """Mock session that returns different mappings.one() per call.

    The volunteer summary issues three separate queries so we need
    three execute() calls each returning different data.
    """
    session = AsyncMock(spec=AsyncSession)
    results = []
    for mapping in mappings_ones:
        mock_result = MagicMock()
        mock_map = MagicMock()
        mock_map.one.return_value = mapping
        mock_result.mappings.return_value = mock_map
        results.append(mock_result)
    session.execute.side_effect = results
    return session


def _mock_session_all(rows: list[dict]) -> AsyncMock:
    """Mock session returning mappings().all() for drilldowns."""
    session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()
    mock_map = MagicMock()
    mock_map.all.return_value = rows
    mock_result.mappings.return_value = mock_map
    session.execute.return_value = mock_result
    return session


# ---------------------------------------------------------------
# Tests
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_volunteer_summary_returns_schema():
    """get_summary returns a VolunteerSummary with correct values."""
    session = _mock_session_multi(
        {"total_volunteers": 20, "active_volunteers": 15},
        {"scheduled_shifts": 8, "completed_shifts": 4},
        {"total_hours": 32.5},
    )
    result = await VolunteerDashboardService.get_summary(
        session,
        CAMPAIGN_ID,
    )

    assert isinstance(result, VolunteerSummary)
    assert result.active_volunteers == 15
    assert result.total_volunteers == 20
    assert result.scheduled_shifts == 8
    assert result.completed_shifts == 4
    assert result.total_hours == 32.5


@pytest.mark.asyncio
async def test_volunteer_summary_empty_returns_zeros():
    """Empty campaign returns all zeros."""
    session = _mock_session_multi(
        {"total_volunteers": 0, "active_volunteers": 0},
        {"scheduled_shifts": 0, "completed_shifts": 0},
        {"total_hours": 0.0},
    )
    result = await VolunteerDashboardService.get_summary(
        session,
        CAMPAIGN_ID,
    )

    assert result.active_volunteers == 0
    assert result.total_volunteers == 0
    assert result.total_hours == 0.0


@pytest.mark.asyncio
async def test_volunteer_by_volunteer_returns_list():
    """get_by_volunteer returns list of VolunteerBreakdown."""
    rows = [
        {
            "volunteer_id": uuid.uuid4(),
            "first_name": "Alice",
            "last_name": "Smith",
            "shifts_completed": 3,
            "hours_worked": 12.0,
            "status": "active",
        },
        {
            "volunteer_id": uuid.uuid4(),
            "first_name": "Bob",
            "last_name": "Jones",
            "shifts_completed": 1,
            "hours_worked": 4.5,
            "status": "active",
        },
    ]
    session = _mock_session_all(rows)
    result = await VolunteerDashboardService.get_by_volunteer(
        session,
        CAMPAIGN_ID,
    )

    assert len(result) == 2
    assert all(isinstance(r, VolunteerBreakdown) for r in result)
    assert result[0].first_name == "Alice"
    assert result[0].hours_worked == 12.0


@pytest.mark.asyncio
async def test_volunteer_by_shift_returns_list():
    """get_by_shift returns list of ShiftBreakdown."""
    rows = [
        {
            "shift_id": uuid.uuid4(),
            "shift_name": "Morning Canvass",
            "type": "canvassing",
            "status": "completed",
            "max_volunteers": 5,
            "signed_up": 4,
            "checked_in": 3,
            "checked_out": 3,
        },
    ]
    session = _mock_session_all(rows)
    result = await VolunteerDashboardService.get_by_shift(
        session,
        CAMPAIGN_ID,
    )

    assert len(result) == 1
    assert isinstance(result[0], ShiftBreakdown)
    assert result[0].shift_name == "Morning Canvass"
    assert result[0].signed_up == 4
    assert result[0].checked_out == 3


@pytest.mark.asyncio
async def test_hours_uses_adjusted_hours_override():
    """Adjusted hours take priority over computed hours.

    Validated by the service using func.coalesce(adjusted_hours, ...).
    Here we verify the returned schema carries the value through.
    """
    rows = [
        {
            "volunteer_id": uuid.uuid4(),
            "first_name": "Eve",
            "last_name": "Doe",
            "shifts_completed": 2,
            "hours_worked": 8.25,  # adjusted hours override
            "status": "active",
        },
    ]
    session = _mock_session_all(rows)
    result = await VolunteerDashboardService.get_by_volunteer(
        session,
        CAMPAIGN_ID,
    )

    assert result[0].hours_worked == 8.25
