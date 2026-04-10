"""Add communication spend foundation.

Revision ID: 034_communication_spend_foundation
Revises: 033_sms_domain_foundation
Create Date: 2026-04-08 01:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "034_communication_spend_foundation"
down_revision = "033_sms_domain_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("twilio_soft_budget_cents", sa.Integer(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "twilio_budget_warning_percent",
            sa.Integer(),
            nullable=False,
            server_default="80",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "twilio_budget_updated_at", sa.DateTime(timezone=True), nullable=True
        ),
    )

    op.create_table(
        "communication_ledgers",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("provider_sid", sa.String(64), nullable=True),
        sa.Column("provider_status", sa.String(32), nullable=True),
        sa.Column("cost_cents", sa.Integer(), nullable=True),
        sa.Column(
            "pending_cost",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
    )
    op.create_index(
        "ix_communication_ledgers_org_created",
        "communication_ledgers",
        ["org_id", "created_at"],
    )
    op.create_index(
        "ix_communication_ledgers_provider_event",
        "communication_ledgers",
        ["provider_sid", "event_type"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_communication_ledgers_provider_event", table_name="communication_ledgers"
    )
    op.drop_index(
        "ix_communication_ledgers_org_created", table_name="communication_ledgers"
    )
    op.drop_table("communication_ledgers")
    op.drop_column("organizations", "twilio_budget_updated_at")
    op.drop_column("organizations", "twilio_budget_warning_percent")
    op.drop_column("organizations", "twilio_soft_budget_cents")
