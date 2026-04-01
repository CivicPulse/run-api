"""Add last_committed_row to import_jobs.

Revision ID: 018_last_committed_row
Revises: 017_procrastinate
Create Date: 2026-03-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "018_last_committed_row"
down_revision: str = "017_procrastinate"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column(
            "last_committed_row", sa.Integer(), nullable=True, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "last_committed_row")
