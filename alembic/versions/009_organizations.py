"""Add organizations table and campaign FK.

Revision ID: 009_organizations
Revises: 008_campaign_member_role
Create Date: 2026-03-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "009_organizations"
down_revision: str = "008_campaign_member_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "zitadel_org_id",
            sa.String(255),
            unique=True,
            index=True,
            nullable=False,
        ),
        sa.Column("zitadel_project_grant_id", sa.String(255), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "created_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "campaigns",
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "organization_id")
    op.drop_table("organizations")
