"""Integration tests for volunteer management RLS isolation.

Verifies that RLS policies correctly prevent cross-campaign data access
for volunteers, volunteer_tags, volunteer_tag_members, shifts,
shift_volunteers, and volunteer_availability tables.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_isolation() -> None:
    """Campaign A cannot see campaign B volunteers."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_shift_isolation() -> None:
    """Campaign A cannot see campaign B shifts."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_tag_isolation() -> None:
    """Tags isolated by campaign."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_shift_volunteer_isolation() -> None:
    """Shift signups isolated."""
    raise NotImplementedError


@pytest.mark.skip(reason="Phase 05 stub")
def test_volunteer_availability_isolation() -> None:
    """Availability isolated."""
    raise NotImplementedError
