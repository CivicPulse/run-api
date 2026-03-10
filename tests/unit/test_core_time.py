"""Tests for app.core.time helpers."""

from __future__ import annotations

from datetime import datetime

from app.core.time import utcnow


def test_utcnow_returns_naive_datetime() -> None:
    """utcnow() must return a timezone-naive datetime."""
    now = utcnow()
    assert isinstance(now, datetime)
    assert now.tzinfo is None


def test_utcnow_is_close_to_real_utc() -> None:
    """Value should be within a few seconds of real UTC."""
    from datetime import UTC

    now = utcnow()
    aware_now = datetime.now(UTC).replace(tzinfo=None)
    delta = abs((aware_now - now).total_seconds())
    assert delta < 2, f"utcnow() drifted {delta}s from real UTC"
