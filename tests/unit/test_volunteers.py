"""Unit tests for volunteer management -- VOL-01.

Skip-marked stubs for Phase 05. Implementation in Plan 02.
"""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_volunteer_with_profile() -> None:
    """Manager creates volunteer with full profile."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_self_register_volunteer() -> None:
    """Logged-in user self-registers (auto-links user_id)."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_volunteer_walk_in() -> None:
    """Manager creates walk-in volunteer (no user_id)."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_update_volunteer_profile() -> None:
    """Update profile fields."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_status_transitions() -> None:
    """Pending -> active -> inactive only."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_add_volunteer_skills() -> None:
    """Add predefined skill categories."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_add_volunteer_tags() -> None:
    """Add free-form campaign-scoped tags."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_remove_volunteer_tag() -> None:
    """Remove tag from volunteer."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_create_availability_slot() -> None:
    """Add availability time window."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_delete_availability_slot() -> None:
    """Remove availability."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_list_volunteers_with_filters() -> None:
    """Search/filter volunteers."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_get_volunteer_detail() -> None:
    """Includes tags and availability."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_pending_cannot_signup() -> None:
    """Pending status blocks shift signup."""
    raise NotImplementedError
