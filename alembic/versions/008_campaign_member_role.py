"""Add role column to campaign_members table.

Revision ID: 008_campaign_member_role
Revises: 007
Create Date: 2026-03-18

Adds an optional VARCHAR(50) ``role`` column to ``campaign_members``.
A NULL value means the row has no per-campaign override and callers should
fall back to the org-level role carried in the ZITADEL JWT claims.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008_campaign_member_role"
down_revision: str = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "campaign_members",
        sa.Column("role", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("campaign_members", "role")
