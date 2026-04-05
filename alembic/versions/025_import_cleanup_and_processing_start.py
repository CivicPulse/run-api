"""Add processing start timestamp and cascade chunk cleanup.

Revision ID: 025_import_cleanup_and_processing_start
Revises: 024_phase63_secondary_work_state
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "025_import_cleanup_and_processing_start"
down_revision: str = "024_phase63_secondary_work_state"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("processing_started_at", sa.DateTime(timezone=False), nullable=True),
    )
    with op.batch_alter_table("import_chunks") as batch_op:
        batch_op.drop_constraint(
            "import_chunks_import_job_id_fkey",
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            "import_chunks_import_job_id_fkey",
            "import_jobs",
            ["import_job_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("import_chunks") as batch_op:
        batch_op.drop_constraint(
            "import_chunks_import_job_id_fkey",
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            "import_chunks_import_job_id_fkey",
            "import_jobs",
            ["import_job_id"],
            ["id"],
        )
    op.drop_column("import_jobs", "processing_started_at")
