"""Add Phase 61 chunk aggregation contracts.

Revision ID: 023_phase61_chunk_aggregation_contracts
Revises: 022_import_chunks
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "023_phase61_chunk_aggregation_contracts"
down_revision: str = "022_import_chunks"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_chunks",
        sa.Column("phones_created", sa.Integer(), nullable=True),
    )
    op.alter_column(
        "import_jobs",
        "status",
        existing_type=sa.String(length=20),
        type_=sa.String(length=30),
        existing_nullable=False,
        existing_server_default="pending",
    )


def downgrade() -> None:
    op.alter_column(
        "import_jobs",
        "status",
        existing_type=sa.String(length=30),
        type_=sa.String(length=20),
        existing_nullable=False,
        existing_server_default="pending",
    )
    op.drop_column("import_chunks", "phones_created")
