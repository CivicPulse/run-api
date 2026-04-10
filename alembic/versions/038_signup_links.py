"""Add volunteer signup links.

Revision ID: 038_signup_links
Revises: 037_email_delivery_attempts_and_mailgun_webhooks
Create Date: 2026-04-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "038_signup_links"
down_revision: str = "037_email_delivery_attempts_and_mailgun_webhooks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "signup_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("token", sa.Uuid(), nullable=False),
        sa.Column(
            "status", sa.String(length=32), server_default="active", nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("disabled_at", sa.DateTime(), nullable=True),
        sa.Column("regenerated_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'regenerated')",
            name="ck_signup_links_status_valid",
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(
        op.f("ix_signup_links_campaign_id"),
        "signup_links",
        ["campaign_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_signup_links_token"), "signup_links", ["token"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_signup_links_token"), table_name="signup_links")
    op.drop_index(op.f("ix_signup_links_campaign_id"), table_name="signup_links")
    op.drop_table("signup_links")
