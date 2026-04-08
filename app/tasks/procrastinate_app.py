"""Procrastinate App singleton for background task processing.

Shared by both the API process (for deferring jobs via open_async)
and the worker process (for executing jobs via run_worker_async).
"""

from __future__ import annotations

import re

import procrastinate

from app.core.config import settings


def _make_conninfo() -> str:
    """Convert SQLAlchemy DATABASE_URL to standard PostgreSQL conninfo.

    Strips SQLAlchemy dialect prefixes (+asyncpg, +psycopg2) since
    Procrastinate uses psycopg3 directly with standard libpq URLs.
    """
    url = settings.database_url
    url = re.sub(r"postgresql\+\w+://", "postgresql://", url)
    return url


procrastinate_app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(
        conninfo=_make_conninfo(),
        kwargs={"options": "-c search_path=procrastinate,public"},
    ),
    import_paths=["app.tasks.import_task", "app.tasks.sms_tasks"],
)
