"""Timezone-naive UTC helpers for TIMESTAMP WITHOUT TIME ZONE columns."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-naive datetime.

    The database uses ``TIMESTAMP WITHOUT TIME ZONE`` everywhere, so all
    Python datetimes persisted via asyncpg must be naive.  This helper
    keeps that conversion in a single place.
    """
    return datetime.now(UTC).replace(tzinfo=None)
