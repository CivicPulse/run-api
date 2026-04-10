"""Add email delivery attempts and invite delivery summary fields.

Revision ID: 037_email_delivery_attempts_and_mailgun_webhooks
Revises: 036_invite_async_delivery_state
Create Date: 2026-04-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "037_email_delivery_attempts_and_mailgun_webhooks"
down_revision: str = "036_invite_async_delivery_state"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "invites",
        sa.Column(
            "email_delivery_last_event_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.create_table(
        "email_delivery_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("invite_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("campaign_id", sa.Uuid(), nullable=False),
        sa.Column("template_key", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("provider_event_key", sa.String(length=255), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invite_id"], ["invites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider_message_id", name="uq_email_delivery_attempts_provider_message_id"
        ),
    )
    op.create_index(
        op.f("ix_email_delivery_attempts_campaign_id"),
        "email_delivery_attempts",
        ["campaign_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_delivery_attempts_invite_id"),
        "email_delivery_attempts",
        ["invite_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_delivery_attempts_organization_id"),
        "email_delivery_attempts",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_delivery_attempts_provider_message_id"),
        "email_delivery_attempts",
        ["provider_message_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_delivery_attempts_status"),
        "email_delivery_attempts",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_email_delivery_attempts_status"), table_name="email_delivery_attempts"
    )
    op.drop_index(
        op.f("ix_email_delivery_attempts_provider_message_id"),
        table_name="email_delivery_attempts",
    )
    op.drop_index(
        op.f("ix_email_delivery_attempts_organization_id"),
        table_name="email_delivery_attempts",
    )
    op.drop_index(
        op.f("ix_email_delivery_attempts_invite_id"),
        table_name="email_delivery_attempts",
    )
    op.drop_index(
        op.f("ix_email_delivery_attempts_campaign_id"),
        table_name="email_delivery_attempts",
    )
    op.drop_table("email_delivery_attempts")
    op.drop_column("invites", "email_delivery_last_event_at")
