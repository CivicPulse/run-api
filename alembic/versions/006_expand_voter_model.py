"""Expand voter model with address renames and new columns.

Revision ID: 006
Revises: 005
Create Date: 2026-03-13

Renames 6 registration address columns with registration_ prefix, adds 22
new columns (mailing address, propensity scores, demographics, household),
creates indexes for Phase 25 filter queries, adds VoterPhone unique
constraint with defensive dedup, and updates L2 mapping template.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "006"
down_revision: str = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- 1. Rename registration address columns --
    op.alter_column("voters", "address_line1", new_column_name="registration_line1")
    op.alter_column("voters", "address_line2", new_column_name="registration_line2")
    op.alter_column("voters", "city", new_column_name="registration_city")
    op.alter_column("voters", "state", new_column_name="registration_state")
    op.alter_column("voters", "zip_code", new_column_name="registration_zip")
    op.alter_column("voters", "county", new_column_name="registration_county")

    # -- 2. Drop old index and create renamed index --
    op.drop_index("ix_voters_campaign_zip", table_name="voters")
    op.create_index(
        "ix_voters_campaign_reg_zip", "voters", ["campaign_id", "registration_zip"]
    )

    # -- 3. Add new registration address columns --
    op.add_column(
        "voters", sa.Column("registration_zip4", sa.String(4), nullable=True)
    )
    op.add_column(
        "voters",
        sa.Column("registration_apartment_type", sa.String(20), nullable=True),
    )

    # -- 4. Add mailing address columns --
    op.add_column(
        "voters", sa.Column("mailing_line1", sa.String(500), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_line2", sa.String(500), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_city", sa.String(255), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_state", sa.String(2), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_zip", sa.String(10), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_zip4", sa.String(4), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_country", sa.String(100), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("mailing_type", sa.String(20), nullable=True)
    )

    # -- 5. Add propensity score columns --
    op.add_column(
        "voters", sa.Column("propensity_general", sa.SmallInteger(), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("propensity_primary", sa.SmallInteger(), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("propensity_combined", sa.SmallInteger(), nullable=True)
    )

    # -- 6. Add demographic columns --
    op.add_column(
        "voters", sa.Column("spoken_language", sa.String(100), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("marital_status", sa.String(50), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("military_status", sa.String(50), nullable=True)
    )
    op.add_column(
        "voters",
        sa.Column("party_change_indicator", sa.String(50), nullable=True),
    )

    # -- 7. Add phone confidence column --
    op.add_column(
        "voters",
        sa.Column("cell_phone_confidence", sa.SmallInteger(), nullable=True),
    )

    # -- 8. Add household columns --
    op.add_column(
        "voters",
        sa.Column("household_party_registration", sa.String(50), nullable=True),
    )
    op.add_column(
        "voters", sa.Column("household_size", sa.SmallInteger(), nullable=True)
    )
    op.add_column(
        "voters", sa.Column("family_id", sa.String(255), nullable=True)
    )

    # -- 9. Create indexes for Phase 25 filter queries --
    op.create_index(
        "ix_voters_campaign_mailing_zip",
        "voters",
        ["campaign_id", "mailing_zip"],
    )
    op.create_index(
        "ix_voters_campaign_mailing_city",
        "voters",
        ["campaign_id", "mailing_city"],
    )
    op.create_index(
        "ix_voters_campaign_mailing_state",
        "voters",
        ["campaign_id", "mailing_state"],
    )

    # -- 10. VoterPhone unique constraint (defensive dedup first) --
    op.execute(
        """
        DELETE FROM voter_phones a USING voter_phones b
        WHERE a.id > b.id
          AND a.campaign_id = b.campaign_id
          AND a.voter_id = b.voter_id
          AND a.value = b.value
        """
    )
    op.create_unique_constraint(
        "uq_voter_phone_campaign_voter_value",
        "voter_phones",
        ["campaign_id", "voter_id", "value"],
    )

    # -- 11. Update L2 mapping template for renamed columns --
    op.execute(
        """
        UPDATE field_mapping_templates
        SET mapping = jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(mapping,
                                '{Residence_Addresses_AddressLine}', '"registration_line1"'),
                            '{Residence_Addresses_ExtraAddressLine}', '"registration_line2"'),
                        '{Residence_Addresses_City}', '"registration_city"'),
                    '{Residence_Addresses_State}', '"registration_state"'),
                '{Residence_Addresses_Zip}', '"registration_zip"'),
            '{Residence_Addresses_County}', '"registration_county"')
        WHERE is_system = true AND source_type = 'l2'
        """
    )


def downgrade() -> None:
    # -- Reverse 11: L2 mapping template (revert to old column names) --
    op.execute(
        """
        UPDATE field_mapping_templates
        SET mapping = jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(mapping,
                                '{Residence_Addresses_AddressLine}', '"address_line1"'),
                            '{Residence_Addresses_ExtraAddressLine}', '"address_line2"'),
                        '{Residence_Addresses_City}', '"city"'),
                    '{Residence_Addresses_State}', '"state"'),
                '{Residence_Addresses_Zip}', '"zip_code"'),
            '{Residence_Addresses_County}', '"county"')
        WHERE is_system = true AND source_type = 'l2'
        """
    )

    # -- Reverse 10: Drop VoterPhone unique constraint --
    op.drop_constraint(
        "uq_voter_phone_campaign_voter_value", "voter_phones", type_="unique"
    )

    # -- Reverse 9: Drop mailing indexes --
    op.drop_index("ix_voters_campaign_mailing_state", table_name="voters")
    op.drop_index("ix_voters_campaign_mailing_city", table_name="voters")
    op.drop_index("ix_voters_campaign_mailing_zip", table_name="voters")

    # -- Reverse 8: Drop household columns --
    op.drop_column("voters", "family_id")
    op.drop_column("voters", "household_size")
    op.drop_column("voters", "household_party_registration")

    # -- Reverse 7: Drop phone confidence column --
    op.drop_column("voters", "cell_phone_confidence")

    # -- Reverse 6: Drop demographic columns --
    op.drop_column("voters", "party_change_indicator")
    op.drop_column("voters", "military_status")
    op.drop_column("voters", "marital_status")
    op.drop_column("voters", "spoken_language")

    # -- Reverse 5: Drop propensity score columns --
    op.drop_column("voters", "propensity_combined")
    op.drop_column("voters", "propensity_primary")
    op.drop_column("voters", "propensity_general")

    # -- Reverse 4: Drop mailing address columns --
    op.drop_column("voters", "mailing_type")
    op.drop_column("voters", "mailing_country")
    op.drop_column("voters", "mailing_zip4")
    op.drop_column("voters", "mailing_zip")
    op.drop_column("voters", "mailing_state")
    op.drop_column("voters", "mailing_city")
    op.drop_column("voters", "mailing_line2")
    op.drop_column("voters", "mailing_line1")

    # -- Reverse 3: Drop new registration address columns --
    op.drop_column("voters", "registration_apartment_type")
    op.drop_column("voters", "registration_zip4")

    # -- Reverse 2: Drop renamed index and recreate old index --
    op.drop_index("ix_voters_campaign_reg_zip", table_name="voters")
    op.create_index(
        "ix_voters_campaign_zip", "voters", ["campaign_id", "zip_code"]
    )

    # -- Reverse 1: Rename columns back --
    op.alter_column("voters", "registration_county", new_column_name="county")
    op.alter_column("voters", "registration_zip", new_column_name="zip_code")
    op.alter_column("voters", "registration_state", new_column_name="state")
    op.alter_column("voters", "registration_city", new_column_name="city")
    op.alter_column("voters", "registration_line2", new_column_name="address_line2")
    op.alter_column("voters", "registration_line1", new_column_name="address_line1")
