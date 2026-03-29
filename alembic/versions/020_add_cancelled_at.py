"""Add cancelled_at to import_jobs.

Revision ID: 020_add_cancelled_at
Revises: 019_l2_voter_columns
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "020_add_cancelled_at"
down_revision: str = "019_l2_voter_columns"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("cancelled_at", sa.DateTime(timezone=False), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "cancelled_at")
