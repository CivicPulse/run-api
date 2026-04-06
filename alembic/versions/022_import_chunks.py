"""Add import chunks table.

Revision ID: 022_import_chunks
Revises: 021_import_recovery_metadata
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "022_import_chunks"
down_revision: str = "021_import_recovery_metadata"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

import_chunk_status = sa.Enum(
    "pending",
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelled",
    name="import_chunk_status",
    native_enum=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    import_chunk_status.create(bind, checkfirst=True)

    op.create_table(
        "import_chunks",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "import_job_id",
            sa.Uuid(),
            sa.ForeignKey("import_jobs.id"),
            nullable=False,
        ),
        sa.Column("row_start", sa.Integer(), nullable=False),
        sa.Column("row_end", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            import_chunk_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("imported_rows", sa.Integer(), nullable=True),
        sa.Column("skipped_rows", sa.Integer(), nullable=True),
        sa.Column("last_committed_row", sa.Integer(), nullable=True),
        sa.Column("error_report_key", sa.String(length=500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_progress_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_import_chunks_import_job_row_start",
        "import_chunks",
        ["import_job_id", "row_start"],
    )
    op.create_index(
        "ix_import_chunks_campaign_status",
        "import_chunks",
        ["campaign_id", "status"],
    )

    op.execute("ALTER TABLE import_chunks ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY import_chunks_isolation ON import_chunks
        USING (
            campaign_id = NULLIF(
                current_setting('app.current_campaign_id', true),
                ''
            )::uuid
        )
        WITH CHECK (
            campaign_id = NULLIF(
                current_setting('app.current_campaign_id', true),
                ''
            )::uuid
        )
        """
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON import_chunks TO app_user")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS import_chunks_isolation ON import_chunks")
    op.drop_index("ix_import_chunks_campaign_status", table_name="import_chunks")
    op.drop_index(
        "ix_import_chunks_import_job_row_start",
        table_name="import_chunks",
    )
    op.drop_table("import_chunks")
    import_chunk_status.drop(op.get_bind(), checkfirst=True)
