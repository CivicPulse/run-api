"""Volunteer→user reconciliation helper.

One-time data reconciliation that links existing ``volunteers`` rows to
``users`` rows for the Julia Callahan pattern: same human present as
both a ``volunteers`` row (no ``user_id`` set) and a ``campaign_members``
row, identified by case-insensitive email match within the same campaign.

The helper is shared between:
- ``alembic/versions/041_volunteer_user_reconciliation.py`` (called from
  ``upgrade()`` via ``op.get_bind()``)
- ``tests/integration/test_volunteer_reconciliation.py`` (called via
  ``await conn.run_sync(reconcile_volunteers)``)

Idempotent: only updates rows where ``volunteers.user_id IS NULL``.
Re-running produces zero new links.

Multi-tenant safe: the join requires a ``campaign_members`` row in the
SAME campaign as the volunteer. Cross-campaign email matches are
rejected (D-02).

Ambiguous rows (multiple matching users in the same campaign) are left
untouched per D-03 and surfaced in the report's ``ambiguous_details``
list for operator follow-up.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection


@dataclass
class AmbiguousVolunteer:
    """A volunteer row that matched multiple users in its campaign."""

    volunteer_id: str
    email: str
    candidate_user_ids: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "volunteer_id": self.volunteer_id,
            "email": self.email,
            "candidate_user_ids": self.candidate_user_ids,
        }


@dataclass
class ReconciliationReport:
    """Aggregate result of a reconciliation run."""

    linked: int = 0
    ambiguous: int = 0
    unchanged: int = 0
    ambiguous_details: list[AmbiguousVolunteer] = field(default_factory=list)

    def summary_line(self) -> str:
        return (
            f"[reconcile_volunteers] linked={self.linked} "
            f"ambiguous={self.ambiguous} unchanged={self.unchanged}"
        )


# JSONL artifact path (D-05). Revision-numbered so re-runs are obvious.
ARTIFACT_PATH = Path("/tmp/reconciliation-041.jsonl")


def reconcile_volunteers(
    connection: Connection,
    *,
    artifact_path: Path | None = None,
) -> ReconciliationReport:
    """Run reconciliation and return a report.

    Args:
        connection: A synchronous SQLAlchemy Connection (use
            ``op.get_bind()`` from Alembic, or
            ``await async_session.connection()`` then ``run_sync``).
        artifact_path: Override the JSONL artifact destination. Defaults
            to ``/tmp/reconciliation-041.jsonl``. The file is overwritten
            on every run.

    Returns:
        ReconciliationReport with linked / ambiguous / unchanged counts
        and the list of AmbiguousVolunteer details.
    """
    out_path = artifact_path if artifact_path is not None else ARTIFACT_PATH

    # 1. Find ambiguous rows (multiple matching users in same campaign).
    ambiguous_sql = text(
        """
        SELECT v.id::text AS volunteer_id,
               v.email,
               array_agg(u.id ORDER BY u.id) AS candidate_user_ids
        FROM volunteers v
        JOIN users u
          ON LOWER(TRIM(u.email)) = LOWER(TRIM(v.email))
        JOIN campaign_members cm
          ON cm.user_id = u.id
         AND cm.campaign_id = v.campaign_id
        WHERE v.user_id IS NULL
          AND v.email IS NOT NULL
          AND TRIM(v.email) <> ''
        GROUP BY v.id, v.email
        HAVING COUNT(*) > 1
        """
    )
    ambiguous_rows = connection.execute(ambiguous_sql).all()
    ambiguous_details = [
        AmbiguousVolunteer(
            volunteer_id=row.volunteer_id,
            email=row.email,
            candidate_user_ids=list(row.candidate_user_ids),
        )
        for row in ambiguous_rows
    ]

    # 2. Apply the unambiguous links. HAVING COUNT(*) = 1 guarantees
    #    only single-match groups are linked. RETURNING gives us the
    #    linked count without a second query.
    link_sql = text(
        """
        UPDATE volunteers v
        SET user_id = sub.user_id
        FROM (
            SELECT v2.id AS volunteer_id, MIN(u.id) AS user_id
            FROM volunteers v2
            JOIN users u
              ON LOWER(TRIM(u.email)) = LOWER(TRIM(v2.email))
            JOIN campaign_members cm
              ON cm.user_id = u.id
             AND cm.campaign_id = v2.campaign_id
            WHERE v2.user_id IS NULL
              AND v2.email IS NOT NULL
              AND TRIM(v2.email) <> ''
            GROUP BY v2.id
            HAVING COUNT(*) = 1
        ) sub
        WHERE v.id = sub.volunteer_id
        RETURNING v.id
        """
    )
    linked_rows = connection.execute(link_sql).all()
    linked_count = len(linked_rows)

    # 3. Count "unchanged": every volunteers row that is still
    #    user_id IS NULL after the update. This includes:
    #    - Volunteers with no email (NULL or empty)
    #    - Volunteers whose email matches no user in their campaign
    #    - Volunteers in the ambiguous bucket (left untouched per D-03)
    unchanged_sql = text(
        "SELECT COUNT(*) FROM volunteers WHERE user_id IS NULL"
    )
    unchanged_count = connection.execute(unchanged_sql).scalar_one()

    report = ReconciliationReport(
        linked=linked_count,
        ambiguous=len(ambiguous_details),
        unchanged=unchanged_count,
        ambiguous_details=ambiguous_details,
    )

    # 4. Write the JSONL artifact (one line per ambiguous row).
    #    Always written, even when empty, so operators have a stable
    #    artifact path to check after every run.
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            for detail in ambiguous_details:
                fh.write(json.dumps(detail.to_dict()) + "\n")
    except OSError as exc:
        # Don't fail the migration on an artifact write error -- counts
        # are still emitted to stdout.
        print(
            f"[reconcile_volunteers] WARNING: failed to write artifact "
            f"{out_path}: {exc}"
        )

    return report
