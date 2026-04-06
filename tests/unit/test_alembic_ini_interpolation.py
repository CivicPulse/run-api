"""REL-11: Assert alembic.ini uses env-var interpolation for sqlalchemy.url.

This test SHOULD FAIL on current main — alembic.ini line 5 hardcodes
`postgresql+psycopg2://postgres:postgres@localhost:5432/run_api`. Plan
76-04 will replace it with `%(DATABASE_URL_SYNC)s` so migrations run
against the environment-configured database in every deploy.
"""

from __future__ import annotations

from pathlib import Path

ALEMBIC_INI = Path("alembic.ini")

HARDCODED_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api"


def test_alembic_ini_uses_database_url_sync_interpolation() -> None:
    """alembic.ini must reference %(DATABASE_URL_SYNC)s for sqlalchemy.url."""
    content = ALEMBIC_INI.read_text()
    assert "%(DATABASE_URL_SYNC)s" in content, (
        "alembic.ini must use %(DATABASE_URL_SYNC)s interpolation for "
        "sqlalchemy.url so migrations pick up the environment DB URL "
        "(REL-11)."
    )


def test_alembic_ini_does_not_hardcode_local_postgres_url() -> None:
    """alembic.ini must not hardcode the localhost postgres URL."""
    content = ALEMBIC_INI.read_text()
    # Find the sqlalchemy.url line specifically
    sqlalchemy_url_lines = [
        line
        for line in content.splitlines()
        if line.strip().startswith("sqlalchemy.url")
    ]
    assert sqlalchemy_url_lines, "alembic.ini must declare a sqlalchemy.url line."
    for line in sqlalchemy_url_lines:
        assert HARDCODED_URL not in line, (
            f"alembic.ini sqlalchemy.url must not hardcode "
            f"{HARDCODED_URL!r}; use %(DATABASE_URL_SYNC)s instead. "
            f"Offending line: {line!r}"
        )
