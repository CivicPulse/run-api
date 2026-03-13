"""Add phones_created column and update L2 mapping template.

Revision ID: 007
Revises: 006
Create Date: 2026-03-13

Adds phones_created nullable Integer column to import_jobs for tracking
phone records created during import. Updates L2 system mapping template
with 21 new field mappings for propensity, demographics, household,
phone, and mailing address columns.
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "007"
down_revision: str = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# New L2 template mappings to add
_NEW_L2_MAPPINGS = {
    "Voters_CellPhoneFull": "__cell_phone",
    "Residence_Addresses_Zip4": "registration_zip4",
    "Residence_Addresses_AptType": "registration_apartment_type",
    "Mail_VAddressLine1": "mailing_line1",
    "Mail_VAddressLine2": "mailing_line2",
    "Mail_VCity": "mailing_city",
    "Mail_VState": "mailing_state",
    "Mail_VZip": "mailing_zip",
    "Mail_VZip4": "mailing_zip4",
    "Mail_VCountry": "mailing_country",
    "General_Turnout_Score": "propensity_general",
    "Primary_Turnout_Score": "propensity_primary",
    "Overall_Turnout_Score": "propensity_combined",
    "Voters_Language": "spoken_language",
    "CommercialData_MaritalStatus": "marital_status",
    "CommercialData_MilitaryActive": "military_status",
    "Voters_PartyChangeIndicator": "party_change_indicator",
    "CellPhoneConfidence": "cell_phone_confidence",
    "Voters_HHPartyRegistration": "household_party_registration",
    "Voters_HHSize": "household_size",
    "Voters_FamilyId": "family_id",
}


def upgrade() -> None:
    # -- 1. Add phones_created column to import_jobs --
    op.add_column(
        "import_jobs",
        sa.Column("phones_created", sa.Integer(), nullable=True),
    )

    # -- 2. Update L2 system mapping template with new field mappings --
    # Uses jsonb concatenation (||) so it's a no-op if template doesn't exist
    op.execute(
        sa.text(
            "UPDATE field_mapping_templates "
            "SET mapping = mapping || CAST(:new_mappings AS jsonb) "
            "WHERE is_system = true AND source_type = 'l2'"
        ).bindparams(new_mappings=json.dumps(_NEW_L2_MAPPINGS))
    )


def downgrade() -> None:
    # -- Reverse 2: Remove added template mappings --
    # Remove all keys that were added using the JSONB - text[] operator
    _keys_sql = ", ".join(f"'{k}'" for k in _NEW_L2_MAPPINGS)
    op.execute(
        sa.text(
            "UPDATE field_mapping_templates "
            f"SET mapping = mapping - ARRAY[{_keys_sql}]::text[] "
            "WHERE is_system = true AND source_type = 'l2'"
        )
    )

    # -- Reverse 1: Drop phones_created column --
    op.drop_column("import_jobs", "phones_created")
