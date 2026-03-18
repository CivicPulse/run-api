#!/usr/bin/env python3
"""Backfill ZITADEL project grants for organizations.

For each Organization without a cached ``zitadel_project_grant_id``, calls
ZITADEL to ensure a project grant exists and stores the returned grant ID in
the local database.

The script is idempotent: it skips organizations that already have a grant ID,
and uses :meth:`~app.services.zitadel.ZitadelService.ensure_project_grant`
which will return an existing grant rather than creating a duplicate.

Usage:
    uv run python scripts/backfill_project_grants.py
    uv run python scripts/backfill_project_grants.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure the project root is on the path so `app` is importable.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from sqlalchemy import create_engine, text  # noqa: E402


def _get_sync_engine():
    """Build a synchronous SQLAlchemy engine.

    Reads the connection URL from ``DATABASE_URL_SYNC`` env var, falling back
    to the value declared in ``app.core.config.settings`` and finally to a
    hard-coded local default.

    Returns:
        A synchronous :class:`sqlalchemy.engine.Engine` instance.
    """
    url = os.environ.get("DATABASE_URL_SYNC")
    if not url:
        try:
            from app.core.config import settings

            url = settings.database_url_sync
        except Exception:
            url = "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api"
    return create_engine(url, future=True)


async def backfill(*, dry_run: bool = False) -> None:
    """Backfill ``zitadel_project_grant_id`` for every Organization that lacks one.

    For each qualifying organization the function:

    1. Calls :meth:`~app.services.zitadel.ZitadelService.ensure_project_grant`
       with all known :class:`~app.core.security.CampaignRole` names as the
       role key list.
    2. Persists the returned grant ID with an ``UPDATE`` statement and commits
       immediately so progress is preserved even if a later org fails.

    When *dry_run* is ``True``, the ZITADEL call is skipped and no DB write is
    performed.

    Args:
        dry_run: When ``True``, print what would happen but make no changes.
    """
    from app.core.config import settings
    from app.core.security import CampaignRole
    from app.services.zitadel import ZitadelService

    # Build the full list of role key strings (lower-case, matching ZITADEL keys).
    all_roles = [r.name.lower() for r in CampaignRole]

    zitadel = ZitadelService(
        issuer=settings.zitadel_issuer,
        client_id=settings.zitadel_service_client_id,
        client_secret=settings.zitadel_service_client_secret,
        base_url=settings.zitadel_base_url,
    )

    engine = _get_sync_engine()

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, zitadel_org_id, name
                FROM organizations
                WHERE zitadel_project_grant_id IS NULL
                ORDER BY created_at ASC
            """)
        ).fetchall()

        if not rows:
            print("All organizations already have project grants.")
            return

        print(f"Found {len(rows)} organization(s) needing project grants.")

        errors: list[str] = []

        for org_id, zitadel_org_id, name in rows:
            print(f"  Processing '{name}' (zitadel_org_id={zitadel_org_id})...")

            if dry_run:
                print(
                    f"    [DRY RUN] Would call ensure_project_grant for "
                    f"project={settings.zitadel_project_id}, org={zitadel_org_id}"
                )
                continue

            try:
                grant_id = await zitadel.ensure_project_grant(
                    settings.zitadel_project_id,
                    zitadel_org_id,
                    all_roles,
                )
                conn.execute(
                    text("""
                        UPDATE organizations
                        SET zitadel_project_grant_id = :grant_id
                        WHERE id = :org_id
                    """),
                    {"grant_id": grant_id, "org_id": str(org_id)},
                )
                # Commit after each org so progress is not lost on partial failure.
                conn.commit()
                print(f"    Stored grant_id={grant_id}")
            except Exception as exc:
                errors.append(f"'{name}' (zitadel_org_id={zitadel_org_id}): {exc}")
                print(f"    ERROR: {exc}")

        if dry_run:
            print("\n[DRY RUN] No changes were made.")
            return

        if errors:
            print(f"\n{len(errors)} error(s) encountered:")
            for err in errors:
                print(f"  - {err}")
            sys.exit(1)


def main() -> None:
    """Entry point: parse CLI arguments and delegate to :func:`backfill`."""
    parser = argparse.ArgumentParser(
        description=(
            "Backfill ZITADEL project grants for organizations. "
            "Calls ZITADEL for each org missing a project_grant_id and "
            "stores the grant ID in the database."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without calling ZITADEL or writing to the database.",
    )
    args = parser.parse_args()
    asyncio.run(backfill(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
