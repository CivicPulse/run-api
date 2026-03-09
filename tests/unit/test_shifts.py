"""Unit tests for shift management -- VOL-02 through VOL-06.

Skip-marked stubs for Phase 05. Implementation in Plan 02.
"""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_shift_canvassing() -> None:
    """Create canvassing shift with turf_id."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_shift_phone_banking() -> None:
    """Create phone banking shift with session_id."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_shift_general() -> None:
    """Create general shift (no operational link)."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_update_shift() -> None:
    """Update shift fields."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_shift_status_transitions() -> None:
    """Scheduled -> active -> completed, scheduled -> cancelled."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_signup() -> None:
    """Active volunteer signs up for shift."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_signup_capacity_full_waitlisted() -> None:
    """Signup when at capacity goes to waitlist."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_signup_manager_override_capacity() -> None:
    """Manager can add beyond capacity."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_self_cancel_before_start() -> None:
    """Volunteer cancels before shift.start_at."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_self_cancel_after_start_blocked() -> None:
    """Volunteer cannot cancel after start."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_manager_remove_volunteer() -> None:
    """Manager removes volunteer from shift."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_waitlist_auto_promote() -> None:
    """Cancellation promotes next waitlisted volunteer."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_check_in_volunteer() -> None:
    """Check-in records timestamp."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_check_in_canvassing_creates_walk_list_canvasser() -> None:
    """Side effect on canvassing shift."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_check_in_phone_banking_creates_session_caller() -> None:
    """Side effect on phone banking shift."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_check_out_volunteer() -> None:
    """Check-out records timestamp."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_hours_calculation() -> None:
    """(check_out - check_in) in hours."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_hours_with_adjustment() -> None:
    """Adjusted_hours overrides computed hours."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_hours_summary() -> None:
    """Aggregate hours across shifts."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_emergency_contact_required_for_field_shift() -> None:
    """Blocks signup without emergency contact."""
    raise NotImplementedError
