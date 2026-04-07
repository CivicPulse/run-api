"""Add webhook events idempotency table and phone number unique index.

Revision ID: 031_webhook_events
Revises: 030_org_phone_numbers
Create Date: 2026-04-07 18:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "031_webhook_events"
down_revision = "030_org_phone_numbers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Create webhook_events table for idempotency tracking
    op.create_table(
        "webhook_events",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("provider_sid", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payload_summary", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "provider_sid", "event_type", name="uq_webhook_events_sid_type"
        ),
    )

    # Step 2: Indexes for performance
    op.create_index(
        "ix_webhook_events_created_at",
        "webhook_events",
        ["created_at"],
    )
    op.create_index(
        "ix_webhook_events_org_id",
        "webhook_events",
        ["org_id"],
    )

    # Step 3: Grant permissions to app_user
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO app_user")

    # Step 4: Unique index on phone_number across all orgs
    op.create_index(
        "ix_org_phone_numbers_phone_unique",
        "org_phone_numbers",
        ["phone_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_org_phone_numbers_phone_unique", table_name="org_phone_numbers")
    op.drop_index("ix_webhook_events_org_id", table_name="webhook_events")
    op.drop_index("ix_webhook_events_created_at", table_name="webhook_events")
    op.drop_table("webhook_events")
