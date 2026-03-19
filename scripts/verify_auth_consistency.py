#!/usr/bin/env python3
"""Verify auth consistency between local DB and ZITADEL.

Performs a series of read-only checks against the local database to surface
data-integrity issues that would cause authentication or authorization failures
at runtime.

Checks performed
----------------
1. Active campaigns without an ``organization_id`` (migration incomplete).
2. Organizations without a ``zitadel_project_grant_id`` (grant backfill needed).
3. Campaign creators who are members but do not have the ``owner`` role.
4. ``CampaignMember`` rows with a ``NULL`` role (informational — will fall back
   to the org-level JWT role at runtime).
5. ``CampaignMember`` rows belonging to deleted campaigns (cleanup candidate).

Exit codes
----------
* ``0`` — all checks passed or only informational items found.
* ``1`` — at least one WARNING was raised.

Usage:
    uv run python scripts/verify_auth_consistency.py
"""

from __future__ import annotations

import os
import sys
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
        except ImportError:
            url = "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api"
    return create_engine(url, future=True)


def verify() -> bool:
    """Run all consistency checks and print a summary report.

    Returns:
        ``True`` if no warnings were found (exit code 0), ``False`` otherwise
        (exit code 1).
    """
    engine = _get_engine()
    issues: list[str] = []

    with engine.connect() as conn:
        # ------------------------------------------------------------------
        # Check 1: Active campaigns without organization_id
        # ------------------------------------------------------------------
        orphan_campaigns: int = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM campaigns
                WHERE organization_id IS NULL
                  AND status != 'deleted'
            """)
        ).scalar_one()

        if orphan_campaigns > 0:
            issues.append(
                f"WARNING: {orphan_campaigns} active campaign(s) without "
                f"organization_id — run migrate_org_structure.py"
            )

        # ------------------------------------------------------------------
        # Check 2: Organizations without zitadel_project_grant_id
        # ------------------------------------------------------------------
        orgs_without_grant: int = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM organizations
                WHERE zitadel_project_grant_id IS NULL
            """)
        ).scalar_one()

        if orgs_without_grant > 0:
            issues.append(
                f"WARNING: {orgs_without_grant} organization(s) without "
                f"zitadel_project_grant_id — run backfill_project_grants.py"
            )

        # ------------------------------------------------------------------
        # Check 3: Campaign creators who lack the 'owner' role
        # ------------------------------------------------------------------
        bad_owner_rows = conn.execute(
            text("""
                SELECT c.id, c.name, c.created_by, cm.user_id, cm.role
                FROM campaigns c
                LEFT JOIN campaign_members cm
                     ON cm.campaign_id = c.id
                    AND cm.user_id = c.created_by
                WHERE c.status != 'deleted'
                  AND (cm.user_id IS NULL OR cm.role IS NULL OR cm.role != 'owner')
                ORDER BY c.name
            """)
        ).fetchall()

        for row in bad_owner_rows:
            campaign_id, campaign_name, creator_id, member_user_id, current_role = row
            if member_user_id is None:
                issues.append(
                    f"WARNING: Campaign '{campaign_name}' (id={campaign_id}) creator "
                    f"{creator_id} is missing a campaign_members row (expected 'owner')"
                )
            else:
                issues.append(
                    f"WARNING: Campaign '{campaign_name}' (id={campaign_id}) creator "
                    f"{creator_id} has role={current_role!r} (expected 'owner')"
                )

        # ------------------------------------------------------------------
        # Check 4: CampaignMembers with NULL role (informational)
        # ------------------------------------------------------------------
        null_role_count: int = conn.execute(
            text("SELECT COUNT(*) FROM campaign_members WHERE role IS NULL")
        ).scalar_one()

        if null_role_count > 0:
            issues.append(
                f"INFO: {null_role_count} campaign_member(s) with NULL role "
                f"(will inherit org-level role from JWT at runtime)"
            )

        # ------------------------------------------------------------------
        # Check 5: Campaign members in deleted campaigns (informational)
        # ------------------------------------------------------------------
        deleted_campaign_members: int = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM campaign_members cm
                JOIN campaigns c ON c.id = cm.campaign_id
                WHERE c.status = 'deleted'
            """)
        ).scalar_one()

        if deleted_campaign_members > 0:
            issues.append(
                f"INFO: {deleted_campaign_members} campaign_member(s) belong to "
                f"deleted campaigns (consider cleanup)"
            )

        # ------------------------------------------------------------------
        # Summary counts
        # ------------------------------------------------------------------
        total_campaigns: int = conn.execute(
            text("SELECT COUNT(*) FROM campaigns WHERE status != 'deleted'")
        ).scalar_one()

        total_orgs: int = conn.execute(
            text("SELECT COUNT(*) FROM organizations")
        ).scalar_one()

        total_members: int = conn.execute(
            text("SELECT COUNT(*) FROM campaign_members")
        ).scalar_one()

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------
    print("=" * 60)
    print("Auth Consistency Report")
    print("=" * 60)
    print(f"Total active campaigns: {total_campaigns}")
    print(f"Total organizations:    {total_orgs}")
    print(f"Total campaign members: {total_members}")
    print()

    if issues:
        print("Issues found:")
        for issue in issues:
            print(f"  - {issue}")
        print()

        warnings = [i for i in issues if i.startswith("WARNING")]
        if warnings:
            print(
                f"RESULT: {len(warnings)} warning(s) found. "
                "Review and fix before deployment."
            )
            return False

        print("RESULT: Only informational items found. System is consistent.")
        return True

    print("RESULT: All checks passed. System is consistent.")
    return True


def main() -> None:
    """Entry point: run :func:`verify` and exit with the appropriate code."""
    ok = verify()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
