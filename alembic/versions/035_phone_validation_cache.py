"""Add phone validation cache.

Revision ID: 035_phone_validation_cache
Revises: 034_communication_spend_foundation
Create Date: 2026-04-08 02:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "035_phone_validation_cache"
down_revision = "034_communication_spend_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "phone_validations",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("normalized_phone_number", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("is_valid", sa.Boolean(), nullable=True),
        sa.Column("carrier_name", sa.String(length=255), nullable=True),
        sa.Column("line_type", sa.String(length=64), nullable=True),
        sa.Column("sms_capable", sa.Boolean(), nullable=True),
        sa.Column("lookup_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=500), nullable=True),
        sa.Column("last_lookup_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint(
            "campaign_id",
            "normalized_phone_number",
            name="uq_phone_validation_campaign_phone",
        ),
    )
    op.create_index(
        "ix_phone_validations_campaign_phone",
        "phone_validations",
        ["campaign_id", "normalized_phone_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_phone_validations_campaign_phone", table_name="phone_validations")
    op.drop_table("phone_validations")
