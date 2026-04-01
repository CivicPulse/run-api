"""Add import recovery metadata columns.

Revision ID: 021_import_recovery_metadata
Revises: 020_add_cancelled_at
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "021_import_recovery_metadata"
down_revision: str = "020_add_cancelled_at"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("last_progress_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.add_column(
        "import_jobs",
        sa.Column("orphaned_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.add_column(
        "import_jobs",
        sa.Column("orphaned_reason", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "import_jobs",
        sa.Column("source_exhausted_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.add_column(
        "import_jobs",
        sa.Column("recovery_started_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.execute(
        """
        UPDATE import_jobs
        SET last_progress_at = COALESCE(updated_at, created_at)
        WHERE last_progress_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "recovery_started_at")
    op.drop_column("import_jobs", "source_exhausted_at")
    op.drop_column("import_jobs", "orphaned_reason")
    op.drop_column("import_jobs", "orphaned_at")
    op.drop_column("import_jobs", "last_progress_at")
