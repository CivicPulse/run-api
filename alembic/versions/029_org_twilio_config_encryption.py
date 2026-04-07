"""Add org-scoped encrypted Twilio configuration fields.

Revision ID: 029_org_twilio_config_encryption
Revises: 028_voter_search_surface
Create Date: 2026-04-07 14:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "029_org_twilio_config_encryption"
down_revision = "028_voter_search_surface"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("twilio_account_sid", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_auth_token_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_auth_token_key_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_auth_token_last4", sa.String(length=4), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "twilio_account_sid_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "twilio_auth_token_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "twilio_auth_token_updated_at")
    op.drop_column("organizations", "twilio_account_sid_updated_at")
    op.drop_column("organizations", "twilio_auth_token_last4")
    op.drop_column("organizations", "twilio_auth_token_key_id")
    op.drop_column("organizations", "twilio_auth_token_encrypted")
    op.drop_column("organizations", "twilio_account_sid")
