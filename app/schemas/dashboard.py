"""Dashboard Pydantic response schemas and date filter utility."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import ColumnElement

from app.schemas.common import BaseSchema

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def apply_date_filter(
    query,  # noqa: ANN001 -- generic Select
    column: ColumnElement,
    start_date: date | None,
    end_date: date | None,
):
    """Narrow a SELECT query to rows where *column* falls within a date range."""
    if start_date:
        query = query.where(column >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.where(column <= datetime.combine(end_date, time.max))
    return query


# ---------------------------------------------------------------------------
# Canvassing schemas
# ---------------------------------------------------------------------------


class OutcomeBreakdown(BaseSchema):
    """Per-result counts for door-knock outcomes."""

    not_home: int = 0
    refused: int = 0
    supporter: int = 0
    undecided: int = 0
    opposed: int = 0
    moved: int = 0
    deceased: int = 0
    come_back_later: int = 0
    inaccessible: int = 0


class CanvassingSummary(BaseSchema):
    """Campaign-wide canvassing totals."""

    doors_knocked: int = 0
    contacts_made: int = 0
    contact_rate: float = 0.0
    outcomes: OutcomeBreakdown = OutcomeBreakdown()


class TurfBreakdown(BaseSchema):
    """Per-turf canvassing stats."""

    turf_id: uuid.UUID
    turf_name: str
    doors_knocked: int = 0
    contacts_made: int = 0
    outcomes: OutcomeBreakdown = OutcomeBreakdown()


class CanvasserBreakdown(BaseSchema):
    """Per-canvasser canvassing stats."""

    user_id: str
    display_name: str
    doors_knocked: int = 0
    contacts_made: int = 0
    outcomes: OutcomeBreakdown = OutcomeBreakdown()


# ---------------------------------------------------------------------------
# Phone banking schemas
# ---------------------------------------------------------------------------


class CallOutcomeBreakdown(BaseSchema):
    """Per-result counts for phone call outcomes."""

    answered: int = 0
    no_answer: int = 0
    busy: int = 0
    wrong_number: int = 0
    voicemail: int = 0
    refused: int = 0
    deceased: int = 0
    disconnected: int = 0


class PhoneBankingSummary(BaseSchema):
    """Campaign-wide phone banking totals."""

    calls_made: int = 0
    contacts_reached: int = 0
    contact_rate: float = 0.0
    outcomes: CallOutcomeBreakdown = CallOutcomeBreakdown()


class SessionBreakdown(BaseSchema):
    """Per-session phone banking stats."""

    session_id: uuid.UUID
    session_name: str
    status: str
    calls_made: int = 0
    contacts_reached: int = 0
    outcomes: CallOutcomeBreakdown = CallOutcomeBreakdown()


class CallerBreakdown(BaseSchema):
    """Per-caller phone banking stats."""

    user_id: str
    display_name: str
    calls_made: int = 0
    contacts_reached: int = 0
    outcomes: CallOutcomeBreakdown = CallOutcomeBreakdown()


class CallListBreakdown(BaseSchema):
    """Per-call-list completion and call stats."""

    call_list_id: uuid.UUID
    call_list_name: str
    total_entries: int = 0
    completed_entries: int = 0
    completion_rate: float = 0.0
    calls_made: int = 0
    contacts_reached: int = 0


# ---------------------------------------------------------------------------
# Volunteer schemas
# ---------------------------------------------------------------------------


class VolunteerSummary(BaseSchema):
    """Campaign-wide volunteer totals."""

    active_volunteers: int = 0
    total_volunteers: int = 0
    scheduled_shifts: int = 0
    completed_shifts: int = 0
    total_hours: float = 0.0


class VolunteerBreakdown(BaseSchema):
    """Per-volunteer shift and hours stats."""

    volunteer_id: uuid.UUID
    first_name: str
    last_name: str
    shifts_completed: int = 0
    hours_worked: float = 0.0
    status: str


class ShiftBreakdown(BaseSchema):
    """Per-shift fill and completion stats."""

    shift_id: uuid.UUID
    shift_name: str
    type: str
    status: str
    max_volunteers: int
    signed_up: int = 0
    checked_in: int = 0
    checked_out: int = 0


# ---------------------------------------------------------------------------
# Cross-domain schemas
# ---------------------------------------------------------------------------


class OverviewResponse(BaseSchema):
    """Cross-domain dashboard highlights."""

    canvassing: CanvassingSummary = CanvassingSummary()
    phone_banking: PhoneBankingSummary = PhoneBankingSummary()
    volunteers: VolunteerSummary = VolunteerSummary()


class MyStatsResponse(BaseSchema):
    """Personal activity across all domains."""

    doors_knocked: int = 0
    calls_made: int = 0
    shifts_completed: int = 0
    hours_worked: float = 0.0
