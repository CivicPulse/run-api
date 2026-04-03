"""Phase 63 secondary work state on import chunks."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "024_phase63_secondary_work_state"
down_revision = "023_phase61_chunk_aggregation_contracts"
branch_labels = None
depends_on = None


TASK_STATUS = sa.Enum(
    "pending",
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelled",
    name="import_chunk_task_status",
    native_enum=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    TASK_STATUS.create(bind, checkfirst=True)
    op.add_column(
        "import_chunks",
        sa.Column("phone_task_status", TASK_STATUS, nullable=True),
    )
    op.add_column(
        "import_chunks",
        sa.Column("geometry_task_status", TASK_STATUS, nullable=True),
    )
    op.add_column(
        "import_chunks",
        sa.Column("phone_task_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "import_chunks",
        sa.Column("geometry_task_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "import_chunks",
        sa.Column("phone_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "import_chunks",
        sa.Column(
            "geometry_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("import_chunks", "geometry_manifest")
    op.drop_column("import_chunks", "phone_manifest")
    op.drop_column("import_chunks", "geometry_task_error")
    op.drop_column("import_chunks", "phone_task_error")
    op.drop_column("import_chunks", "geometry_task_status")
    op.drop_column("import_chunks", "phone_task_status")
    bind = op.get_bind()
    TASK_STATUS.drop(bind, checkfirst=True)
