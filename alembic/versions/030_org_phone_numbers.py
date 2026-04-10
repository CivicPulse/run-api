"""Add org phone numbers inventory table and default FK columns.

Revision ID: 030_org_phone_numbers
Revises: 029_org_twilio_config_encryption
Create Date: 2026-04-07 17:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "030_org_phone_numbers"
down_revision = "029_org_twilio_config_encryption"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Create the phone numbers table
    op.create_table(
        "org_phone_numbers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("friendly_name", sa.String(64), nullable=True),
        sa.Column(
            "phone_type",
            sa.String(20),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column(
            "voice_capable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "sms_capable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "mms_capable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("twilio_sid", sa.String(40), nullable=False),
        sa.Column(
            "capabilities_synced_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_org_phone_numbers_org_id",
        "org_phone_numbers",
        ["org_id"],
    )
    op.create_index(
        "ix_org_phone_numbers_org_phone",
        "org_phone_numbers",
        ["org_id", "phone_number"],
        unique=True,
    )

    # Step 2: Add nullable FK columns to organizations
    op.add_column(
        "organizations",
        sa.Column("default_voice_number_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("default_sms_number_id", sa.Uuid(), nullable=True),
    )

    # Step 3: Add FK constraints separately (breaks circular dependency)
    op.create_foreign_key(
        "fk_org_default_voice_number",
        "organizations",
        "org_phone_numbers",
        ["default_voice_number_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_org_default_sms_number",
        "organizations",
        "org_phone_numbers",
        ["default_sms_number_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Reverse order: drop FK constraints, then columns, then table
    op.drop_constraint("fk_org_default_sms_number", "organizations", type_="foreignkey")
    op.drop_constraint(
        "fk_org_default_voice_number", "organizations", type_="foreignkey"
    )
    op.drop_column("organizations", "default_sms_number_id")
    op.drop_column("organizations", "default_voice_number_id")
    op.drop_index("ix_org_phone_numbers_org_phone", table_name="org_phone_numbers")
    op.drop_index("ix_org_phone_numbers_org_id", table_name="org_phone_numbers")
    op.drop_table("org_phone_numbers")
