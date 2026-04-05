"""REL-05: Assert create_async_engine call has pool_timeout=10 and statement_timeout.

This test SHOULD FAIL on current main — app/db/session.py does not set
pool_timeout or connect_args. Plan 76-02 will add both.
"""

from __future__ import annotations

from pathlib import Path

SESSION_SOURCE = Path("app/db/session.py")


def test_engine_has_pool_timeout_of_10_seconds() -> None:
    """create_async_engine must be called with pool_timeout=10."""
    text = SESSION_SOURCE.read_text()
    assert "pool_timeout=10" in text, (
        "app/db/session.py must pass pool_timeout=10 to create_async_engine "
        "to fail fast when the pool is exhausted (REL-05)."
    )


def test_engine_has_statement_timeout_30s_via_connect_args() -> None:
    """create_async_engine must set Postgres statement_timeout to 30000 ms."""
    text = SESSION_SOURCE.read_text()
    assert '"statement_timeout": "30000"' in text, (
        "app/db/session.py must pass "
        'connect_args={"server_settings": {"statement_timeout": "30000"}} '
        "to create_async_engine so runaway queries abort after 30s (REL-05)."
    )
    assert "connect_args" in text, (
        "app/db/session.py must pass connect_args to create_async_engine."
    )
