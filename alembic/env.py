"""Alembic migration environment configuration.

Supports both sync (psycopg2) for offline and async (asyncpg) for online migrations.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from geoalchemy2 import alembic_helpers
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.db.base import Base

config = context.config

# Override alembic.ini URL with env var if set (for containerized environments)
db_url = os.environ.get("DATABASE_URL_SYNC")
if db_url:
    # Escape percent signs for configparser interpolation
    config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

target_metadata = Base.metadata

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode using sync URL."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=alembic_helpers.include_object,
        process_revision_directives=alembic_helpers.writer,
        render_item=alembic_helpers.render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def _ensure_version_table_width(connection: Connection) -> None:
    """Ensure ``alembic_version.version_num`` is wide enough for our long migration IDs.

    Alembic hardcodes ``Column('version_num', String(32))`` in ``MigrationContext``
    — there is no config knob for this. Several of our migration IDs exceed 32 chars
    (the widest today is ``037_email_delivery_attempts_and_mailgun_webhooks`` at 47),
    so a fresh DB crashes the moment alembic tries to record one of them.

    Runs before ``context.run_migrations()`` so:
      - On a fresh DB: we pre-create the table; alembic detects it and reuses it.
      - On an existing narrow DB: the column gets widened in place.
      - On an already-widened DB (dev/prod after the 2026-04-05 hotfix): no-op.

    Closes CivicPulse/run-api#19.
    """
    # On Postgres 15+, the public schema is not writable by non-owner roles
    # by default. `CREATE TABLE IF NOT EXISTS` still requires CREATE privilege
    # even when the table exists, so we must check existence first.
    exists = (
        connection.execute(
            text(
                "SELECT 1 FROM pg_tables "
                "WHERE schemaname = current_schema() AND tablename = 'alembic_version'"
            )
        ).scalar()
        is not None
    )
    if not exists:
        connection.execute(
            text(
                "CREATE TABLE alembic_version ("
                "version_num VARCHAR(128) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)"
                ")"
            )
        )
    connection.execute(
        text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    )


def do_run_migrations(connection: Connection) -> None:
    """Execute migrations within a connection context."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=alembic_helpers.include_object,
        process_revision_directives=alembic_helpers.writer,
        render_item=alembic_helpers.render_item,
    )

    _ensure_version_table_width(connection)

    with context.begin_transaction():
        context.run_migrations()


def _run_sync_migrations() -> None:
    """Run migrations with the sync psycopg2 driver (handles complex DDL)."""
    from sqlalchemy import create_engine

    url = config.get_main_option("sqlalchemy.url") or ""
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using async engine."""
    configuration = config.get_section(config.config_ini_section, {})
    # Override to use asyncpg for online migrations
    url = configuration.get("sqlalchemy.url", "")
    if "+psycopg2" in url:
        url = url.replace("+psycopg2", "+asyncpg")
    configuration["sqlalchemy.url"] = url

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Prefer sync psycopg2 driver when DATABASE_URL_SYNC is available — asyncpg's
    prepared-statement protocol rejects complex DDL (CREATE FUNCTION with $$ bodies).
    """
    url = config.get_main_option("sqlalchemy.url") or ""
    if "+psycopg2" in url:
        _run_sync_migrations()
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
