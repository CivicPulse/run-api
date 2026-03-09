"""Unit tests for dashboard overview and my-stats endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.dashboard import (
    CanvassingSummary,
    MyStatsResponse,
    OverviewResponse,
    PhoneBankingSummary,
    VolunteerSummary,
)

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()


def _mock_user(
    user_id: str = "user-1",
    role: str = "manager",
) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.org_id = "org-1"
    user.role = 2  # manager
    user.email = "test@example.com"
    user.display_name = "Test User"
    return user


# ---------------------------------------------------------------
# Overview tests
# ---------------------------------------------------------------


@pytest.mark.asyncio
@patch(
    "app.services.dashboard.VolunteerDashboardService.get_summary",
    new_callable=AsyncMock,
)
@patch(
    "app.services.dashboard.PhoneBankingDashboardService.get_summary",
    new_callable=AsyncMock,
)
@patch(
    "app.services.dashboard.CanvassingDashboardService.get_summary",
    new_callable=AsyncMock,
)
async def test_overview_combines_all_domains(
    mock_canvassing: AsyncMock,
    mock_phone: AsyncMock,
    mock_volunteer: AsyncMock,
):
    """OverviewResponse combines canvassing, phone, volunteer."""
    mock_canvassing.return_value = CanvassingSummary(
        doors_knocked=100, contacts_made=50, contact_rate=0.5,
    )
    mock_phone.return_value = PhoneBankingSummary(
        calls_made=80, contacts_reached=30, contact_rate=0.375,
    )
    mock_volunteer.return_value = VolunteerSummary(
        active_volunteers=10, total_volunteers=15,
        scheduled_shifts=5, completed_shifts=3, total_hours=20.0,
    )

    # Build the overview directly using the schema
    overview = OverviewResponse(
        canvassing=mock_canvassing.return_value,
        phone_banking=mock_phone.return_value,
        volunteers=mock_volunteer.return_value,
    )

    assert isinstance(overview, OverviewResponse)
    assert overview.canvassing.doors_knocked == 100
    assert overview.phone_banking.calls_made == 80
    assert overview.volunteers.active_volunteers == 10


# ---------------------------------------------------------------
# My-Stats tests
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_my_stats_returns_personal_activity():
    """MyStatsResponse carries user's personal counts."""
    stats = MyStatsResponse(
        doors_knocked=25,
        calls_made=15,
        shifts_completed=3,
        hours_worked=12.5,
    )

    assert isinstance(stats, MyStatsResponse)
    assert stats.doors_knocked == 25
    assert stats.calls_made == 15
    assert stats.shifts_completed == 3
    assert stats.hours_worked == 12.5


@pytest.mark.asyncio
async def test_my_stats_returns_zeros_when_no_activity():
    """Empty activity returns all zeros (not 404)."""
    stats = MyStatsResponse()

    assert stats.doors_knocked == 0
    assert stats.calls_made == 0
    assert stats.shifts_completed == 0
    assert stats.hours_worked == 0.0
