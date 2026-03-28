"""Drop unique index on campaigns.zitadel_org_id, replace with non-unique.

Revision ID: 016_drop_zitadel_idx
Revises: a394df317a80
Create Date: 2026-03-28

Migration 012 dropped the unique CONSTRAINT but SQLAlchemy created the
uniqueness as a unique INDEX (ix_campaigns_zitadel_org_id), which was
not caught. This migration drops the unique index and recreates it as
non-unique so multiple campaigns can share the same ZITADEL org.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "016_drop_zitadel_idx"
down_revision: str = "a394df317a80"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_campaigns_zitadel_org_id", table_name="campaigns")
    op.create_index(
        "ix_campaigns_zitadel_org_id",
        "campaigns",
        ["zitadel_org_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_campaigns_zitadel_org_id", table_name="campaigns")
    op.create_index(
        "ix_campaigns_zitadel_org_id",
        "campaigns",
        ["zitadel_org_id"],
        unique=True,
    )
