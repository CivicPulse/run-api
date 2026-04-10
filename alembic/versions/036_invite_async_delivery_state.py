"""Add invite async email delivery state.

Revision ID: 036_invite_async_delivery_state
Revises: 035_phone_validation_cache
Create Date: 2026-04-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "036_invite_async_delivery_state"
down_revision: str = "035_phone_validation_cache"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "invites",
        sa.Column(
            "email_delivery_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "invites",
        sa.Column(
            "email_delivery_queued_at", sa.DateTime(timezone=False), nullable=True
        ),
    )
    op.add_column(
        "invites",
        sa.Column("email_delivery_sent_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.add_column(
        "invites",
        sa.Column(
            "email_delivery_provider_message_id",
            sa.String(length=255),
            nullable=True,
        ),
    )
    op.add_column(
        "invites",
        sa.Column("email_delivery_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invites", "email_delivery_error")
    op.drop_column("invites", "email_delivery_provider_message_id")
    op.drop_column("invites", "email_delivery_sent_at")
    op.drop_column("invites", "email_delivery_queued_at")
    op.drop_column("invites", "email_delivery_status")
