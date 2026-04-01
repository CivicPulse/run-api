"""Add L2 voter detail columns.

Revision ID: 019_l2_voter_columns
Revises: 018_last_committed_row
Create Date: 2026-03-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "019_l2_voter_columns"
down_revision: str = "018_last_committed_row"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Registration Address (L2 detail)
    op.add_column("voters", sa.Column("house_number", sa.String(50), nullable=True))
    op.add_column(
        "voters",
        sa.Column("street_number_parity", sa.String(10), nullable=True),
    )

    # Mailing Address (L2 detail)
    op.add_column(
        "voters",
        sa.Column("mailing_house_number", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_address_prefix", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_street_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_designator", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_suffix_direction", sa.String(10), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_apartment_number", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_bar_code", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_verifier", sa.String(50), nullable=True),
    )

    # Household (L2 mailing detail)
    op.add_column(
        "voters",
        sa.Column(
            "mailing_household_party_registration",
            sa.String(50),
            nullable=True,
        ),
    )
    op.add_column(
        "voters",
        sa.Column("mailing_household_size", sa.SmallInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("voters", "mailing_household_size")
    op.drop_column("voters", "mailing_household_party_registration")
    op.drop_column("voters", "mailing_verifier")
    op.drop_column("voters", "mailing_bar_code")
    op.drop_column("voters", "mailing_apartment_number")
    op.drop_column("voters", "mailing_suffix_direction")
    op.drop_column("voters", "mailing_designator")
    op.drop_column("voters", "mailing_street_name")
    op.drop_column("voters", "mailing_address_prefix")
    op.drop_column("voters", "mailing_house_number")
    op.drop_column("voters", "street_number_parity")
    op.drop_column("voters", "house_number")
