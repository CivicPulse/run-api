#!/usr/bin/env python3
"""Migrate existing campaigns to the Organization model.

Groups campaigns by zitadel_org_id, creates Organization rows,
backfills Campaign.organization_id, and sets owner roles on
CampaignMember rows where the campaign creator is a member.

Usage:
    uv run python scripts/migrate_org_structure.py
    uv run python scripts/migrate_org_structure.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

# Ensure the project root is on the path so `app` is importable.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from sqlalchemy import create_engine, text  # noqa: E402


def _get_engine():
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


def migrate(*, dry_run: bool = False) -> None:
    """Run the org-structure migration.

    Steps performed inside a single transaction:

    1. Find every distinct ``zitadel_org_id`` that still has at least one
       campaign whose ``organization_id`` is ``NULL``.
    2. For each such ``zitadel_org_id``, insert a row into ``organizations``
       using the earliest campaign's ``name`` and ``created_by``.  The insert
       is idempotent via ``ON CONFLICT (zitadel_org_id) DO NOTHING``.
    3. Backfill ``campaigns.organization_id`` for all campaigns sharing that
       ``zitadel_org_id``.
    4. Set ``campaign_members.role = 'owner'`` for members whose ``user_id``
       matches the owning campaign's ``created_by`` and whose current role is
       ``NULL``.

    When *dry_run* is ``True`` the transaction is rolled back so no changes
    persist.

    Args:
        dry_run: When ``True``, print what would happen but make no changes.
    """
    engine = _get_engine()

    with engine.begin() as conn:
        rows = conn.execute(
            text("""
                SELECT DISTINCT ON (c.zitadel_org_id)
                    c.zitadel_org_id,
                    c.name,
                    c.created_by
                FROM campaigns c
                WHERE c.organization_id IS NULL
                  AND c.zitadel_org_id IS NOT NULL
                ORDER BY c.zitadel_org_id, c.created_at ASC
            """)
        ).fetchall()

        if not rows:
            print("No campaigns need migration.")
            return

        print(f"Found {len(rows)} distinct org(s) to migrate.")

        for zitadel_org_id, campaign_name, created_by in rows:
            org_id = uuid.uuid4()
            print(
                f"  Creating Organization '{campaign_name}' "
                f"for zitadel_org_id={zitadel_org_id}"
            )

            if not dry_run:
                now = datetime.now(UTC)

                # Insert the organization; skip silently if already present.
                conn.execute(
                    text("""
                        INSERT INTO organizations (
                            id, zitadel_org_id, name,
                            created_by, created_at, updated_at
                        )
                        VALUES (
                            :id, :zitadel_org_id, :name,
                            :created_by, :created_at, :updated_at
                        )
                        ON CONFLICT (zitadel_org_id) DO NOTHING
                    """),
                    {
                        "id": str(org_id),
                        "zitadel_org_id": zitadel_org_id,
                        "name": campaign_name,
                        "created_by": created_by,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

                # Resolve the actual org_id (may differ if ON CONFLICT fired).
                actual_org_id = conn.execute(
                    text(
                        "SELECT id FROM organizations "
                        "WHERE zitadel_org_id = :zitadel_org_id"
                    ),
                    {"zitadel_org_id": zitadel_org_id},
                ).scalar_one()

                # Backfill organization_id on all un-migrated campaigns.
                result = conn.execute(
                    text("""
                        UPDATE campaigns
                        SET organization_id = :org_id
                        WHERE zitadel_org_id = :zitadel_org_id
                          AND organization_id IS NULL
                    """),
                    {"org_id": str(actual_org_id), "zitadel_org_id": zitadel_org_id},
                )
                print(f"    Updated {result.rowcount} campaign(s)")

                # Set owner role on members where the member IS the campaign creator.
                result = conn.execute(
                    text("""
                        UPDATE campaign_members cm
                        SET role = 'owner'
                        FROM campaigns c
                        WHERE cm.campaign_id = c.id
                          AND cm.user_id = c.created_by
                          AND cm.role IS NULL
                          AND c.zitadel_org_id = :zitadel_org_id
                    """),
                    {"zitadel_org_id": zitadel_org_id},
                )
                print(f"    Set {result.rowcount} owner role(s)")

        if dry_run:
            print("\n[DRY RUN] No changes were made. Run without --dry-run to apply.")
            conn.rollback()


def main() -> None:
    """Entry point: parse CLI arguments and delegate to :func:`migrate`."""
    parser = argparse.ArgumentParser(
        description=(
            "Migrate campaigns to the Organization model. "
            "Groups campaigns by zitadel_org_id, creates Organization rows, "
            "backfills Campaign.organization_id, and sets owner roles."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying them to the database.",
    )
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
