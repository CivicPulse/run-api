"""Unit tests for phone banking dashboard service -- DASH-02."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_list import CallResultCode
from app.schemas.dashboard import (
    CallerBreakdown,
    CallListBreakdown,
    PhoneBankingSummary,
    SessionBreakdown,
)
from app.services.dashboard.phone_banking import (
    CONTACT_RESULTS,
    PhoneBankingDashboardService,
)

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()


def _mock_session(
    mappings_one: dict | None = None,
    mappings_all: list[dict] | None = None,
) -> AsyncMock:
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
    calls: int = 80,
    contacts: int = 30,
    **outcome_overrides: int,
) -> dict:
    outcomes = {r.value: 0 for r in CallResultCode}
    outcomes.update(outcome_overrides)
    return {
        "calls_made": calls,
        "contacts_reached": contacts,
        **outcomes,
    }


def _session_row(
    session_id: uuid.UUID | None = None,
    session_name: str = "Evening Calls",
    status: str = "active",
    calls: int = 40,
    contacts: int = 15,
) -> dict:
    row = {
        "session_id": session_id or uuid.uuid4(),
        "session_name": session_name,
        "status": status,
        "calls_made": calls,
        "contacts_reached": contacts,
    }
    row.update({r.value: 0 for r in CallResultCode})
    return row


def _caller_row(
    user_id: str = "caller-1",
    display_name: str = "Carol",
    calls: int = 25,
    contacts: int = 10,
) -> dict:
    row = {
        "user_id": user_id,
        "display_name": display_name,
        "calls_made": calls,
        "contacts_reached": contacts,
    }
    row.update({r.value: 0 for r in CallResultCode})
    return row


def _call_list_row(
    call_list_id: uuid.UUID | None = None,
    call_list_name: str = "Voter List A",
    total: int = 200,
    completed: int = 80,
    calls: int = 90,
    contacts: int = 35,
) -> dict:
    return {
        "call_list_id": call_list_id or uuid.uuid4(),
        "call_list_name": call_list_name,
        "total_entries": total,
        "completed_entries": completed,
        "calls_made": calls,
        "contacts_reached": contacts,
    }


# ---------------------------------------------------------------
# Tests
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_phone_banking_summary_returns_schema():
    """get_summary returns a PhoneBankingSummary."""
    session = _mock_session(
        mappings_one=_summary_row(calls=80, contacts=30),
    )
    result = await PhoneBankingDashboardService.get_summary(
        session, CAMPAIGN_ID,
    )

    assert isinstance(result, PhoneBankingSummary)
    assert result.calls_made == 80
    assert result.contacts_reached == 30
    assert result.contact_rate == round(30 / 80, 4)


@pytest.mark.asyncio
async def test_phone_banking_summary_empty_returns_zeros():
    """Empty data returns all zeros."""
    session = _mock_session(
        mappings_one=_summary_row(calls=0, contacts=0),
    )
    result = await PhoneBankingDashboardService.get_summary(
        session, CAMPAIGN_ID,
    )

    assert result.calls_made == 0
    assert result.contacts_reached == 0
    assert result.contact_rate == 0.0
    assert result.outcomes.answered == 0


@pytest.mark.asyncio
async def test_phone_banking_by_session_returns_list():
    """get_by_session returns list of SessionBreakdown."""
    rows = [
        _session_row(session_name="Morning"),
        _session_row(session_name="Evening"),
    ]
    session = _mock_session(mappings_all=rows)
    result = await PhoneBankingDashboardService.get_by_session(
        session, CAMPAIGN_ID,
    )

    assert len(result) == 2
    assert all(isinstance(r, SessionBreakdown) for r in result)
    assert result[0].session_name == "Morning"


@pytest.mark.asyncio
async def test_phone_banking_by_caller_returns_list():
    """get_by_caller returns list of CallerBreakdown."""
    rows = [
        _caller_row(user_id="c1", display_name="Carol"),
        _caller_row(user_id="c2", display_name="Dave"),
    ]
    session = _mock_session(mappings_all=rows)
    result = await PhoneBankingDashboardService.get_by_caller(
        session, CAMPAIGN_ID,
    )

    assert len(result) == 2
    assert all(isinstance(r, CallerBreakdown) for r in result)


@pytest.mark.asyncio
async def test_phone_banking_by_call_list_returns_list():
    """get_by_call_list returns list of CallListBreakdown."""
    rows = [_call_list_row(call_list_name="List A")]
    session = _mock_session(mappings_all=rows)
    result = await PhoneBankingDashboardService.get_by_call_list(
        session, CAMPAIGN_ID,
    )

    assert len(result) == 1
    assert isinstance(result[0], CallListBreakdown)
    assert result[0].call_list_name == "List A"
    assert result[0].completion_rate == round(80 / 200, 4)


@pytest.mark.asyncio
async def test_contacts_reached_includes_answered_and_refused():
    """ANSWERED and REFUSED count as contacts; others do not."""
    assert CallResultCode.ANSWERED.value in CONTACT_RESULTS
    assert CallResultCode.REFUSED.value in CONTACT_RESULTS

    non_contact = {
        CallResultCode.NO_ANSWER,
        CallResultCode.BUSY,
        CallResultCode.WRONG_NUMBER,
        CallResultCode.VOICEMAIL,
        CallResultCode.DECEASED,
        CallResultCode.DISCONNECTED,
    }
    for code in non_contact:
        assert code.value not in CONTACT_RESULTS
