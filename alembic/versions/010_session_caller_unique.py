"""Add unique constraint on session_callers(session_id, user_id).

Revision ID: 010_session_caller_unique
Revises: 009_organizations
Create Date: 2026-03-19

The SessionCaller model declares uq_session_caller but the original
004_phone_banking migration did not create it.  This migration
deduplicates any existing rows then adds the constraint so that
ON CONFLICT (session_id, user_id) upserts work correctly.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "010_session_caller_unique"
down_revision: str = "009_organizations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) Deduplicate: keep the most recent row per (session_id, user_id)
    # When multiple rows share the same (session_id, user_id) and have NULL
    # check_in_at, the row with the highest id is preserved (arbitrary but
    # deterministic within a single DB).  The table has no created_at column.
    op.execute("""
    DELETE FROM session_callers sc
    USING (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY session_id, user_id
                 ORDER BY check_in_at DESC NULLS LAST, id DESC
               ) AS rn
        FROM session_callers
      ) t
      WHERE t.rn > 1
    ) d
    WHERE sc.id = d.id;
    """)

    # 2) Add the unique constraint
    op.create_unique_constraint(
        "uq_session_caller",
        "session_callers",
        ["session_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_session_caller", "session_callers", type_="unique")
