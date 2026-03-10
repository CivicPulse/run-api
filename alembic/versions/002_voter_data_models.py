"""Voter data models with RLS policies.

Revision ID: 002b
Revises: 002a
Create Date: 2026-03-09

Creates tables: voters, voter_tags, voter_tag_members, voter_phones,
voter_emails, voter_addresses, voter_lists, voter_list_members,
voter_interactions, import_jobs, field_mapping_templates.

Enables RLS and creates isolation policies on all tables with campaign_id.
Seeds the L2 system mapping template.
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from alembic import op

revision: str = "002b"
down_revision: str = "002a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables that need RLS campaign_id isolation
_CAMPAIGN_TABLES = [
    "voters",
    "voter_tags",
    "voter_tag_members",
    "voter_phones",
    "voter_emails",
    "voter_addresses",
    "voter_lists",
    "voter_list_members",
    "voter_interactions",
    "import_jobs",
    "field_mapping_templates",
]

# Standard L2 field mapping template
_L2_MAPPING = {
    "LALVOTERID": "source_id",
    "Voters_FirstName": "first_name",
    "Voters_MiddleName": "middle_name",
    "Voters_LastName": "last_name",
    "Voters_NameSuffix": "suffix",
    "Voters_BirthDate": "date_of_birth",
    "Voters_Gender": "gender",
    "Residence_Addresses_AddressLine": "address_line1",
    "Residence_Addresses_ExtraAddressLine": "address_line2",
    "Residence_Addresses_City": "city",
    "Residence_Addresses_State": "state",
    "Residence_Addresses_Zip": "zip_code",
    "Residence_Addresses_County": "county",
    "Parties_Description": "party",
    "Voters_FIPS": "precinct",
    "ElectionDistricts_USCongress": "congressional_district",
    "ElectionDistricts_StateSenate": "state_senate_district",
    "ElectionDistricts_StateHouse": "state_house_district",
    "Voters_OfficialRegDate": "registration_date",
    "Ethnic_Description": "ethnicity",
    "Voters_Age": "age",
    "Residence_Addresses_Latitude": "latitude",
    "Residence_Addresses_Longitude": "longitude",
    "Voters_HHId": "household_id",
}


def upgrade() -> None:
    # --- voters ---
    op.create_table(
        "voters",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("middle_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("suffix", sa.String(50), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(20), nullable=True),
        sa.Column("address_line1", sa.String(500), nullable=True),
        sa.Column("address_line2", sa.String(500), nullable=True),
        sa.Column("city", sa.String(255), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("zip_code", sa.String(10), nullable=True),
        sa.Column("county", sa.String(255), nullable=True),
        sa.Column("party", sa.String(50), nullable=True),
        sa.Column("precinct", sa.String(100), nullable=True),
        sa.Column("congressional_district", sa.String(10), nullable=True),
        sa.Column("state_senate_district", sa.String(10), nullable=True),
        sa.Column("state_house_district", sa.String(10), nullable=True),
        sa.Column("registration_date", sa.Date(), nullable=True),
        sa.Column("voting_history", ARRAY(sa.String), nullable=True),
        sa.Column("ethnicity", sa.String(100), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("household_id", sa.String(255), nullable=True),
        sa.Column("extra_data", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voters_campaign_source",
        "voters",
        ["campaign_id", "source_type", "source_id"],
        unique=True,
    )
    op.create_index(
        "ix_voters_campaign_party", "voters", ["campaign_id", "party"]
    )
    op.create_index(
        "ix_voters_campaign_precinct", "voters", ["campaign_id", "precinct"]
    )
    op.create_index(
        "ix_voters_campaign_zip", "voters", ["campaign_id", "zip_code"]
    )
    op.create_index(
        "ix_voters_campaign_last_name", "voters", ["campaign_id", "last_name"]
    )

    # --- voter_tags ---
    op.create_table(
        "voter_tags",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.UniqueConstraint(
            "campaign_id", "name", name="uq_voter_tag_campaign_name"
        ),
    )

    # --- voter_tag_members ---
    op.create_table(
        "voter_tag_members",
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Uuid(),
            sa.ForeignKey("voter_tags.id"),
            primary_key=True,
        ),
    )

    # --- voter_phones ---
    op.create_table(
        "voter_phones",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("value", sa.String(50), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- voter_emails ---
    op.create_table(
        "voter_emails",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- voter_addresses ---
    op.create_table(
        "voter_addresses",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("address_line1", sa.String(500), nullable=False),
        sa.Column("address_line2", sa.String(500), nullable=True),
        sa.Column("city", sa.String(255), nullable=False),
        sa.Column("state", sa.String(2), nullable=False),
        sa.Column("zip_code", sa.String(10), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- voter_lists ---
    op.create_table(
        "voter_lists",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("list_type", sa.String(20), nullable=False),
        sa.Column("filter_query", JSONB, nullable=True),
        sa.Column(
            "created_by",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- voter_list_members ---
    op.create_table(
        "voter_list_members",
        sa.Column(
            "voter_list_id",
            sa.Uuid(),
            sa.ForeignKey("voter_lists.id"),
            primary_key=True,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            primary_key=True,
        ),
        sa.Column(
            "added_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- voter_interactions ---
    op.create_table(
        "voter_interactions",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("payload", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_by",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- import_jobs ---
    op.create_table(
        "import_jobs",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("file_key", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column(
            "source_type", sa.String(50), nullable=False, server_default="csv"
        ),
        sa.Column("field_mapping", JSONB, nullable=True),
        sa.Column("detected_columns", JSONB, nullable=True),
        sa.Column("suggested_mapping", JSONB, nullable=True),
        sa.Column("total_rows", sa.Integer(), nullable=True),
        sa.Column("imported_rows", sa.Integer(), nullable=True),
        sa.Column("skipped_rows", sa.Integer(), nullable=True),
        sa.Column("error_report_key", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- field_mapping_templates ---
    op.create_table(
        "field_mapping_templates",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("mapping", JSONB, nullable=False),
        sa.Column(
            "is_system", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column(
            "created_by",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- Enable RLS and create isolation policies ---
    for table in _CAMPAIGN_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

        # Determine the campaign column: voter_tag_members uses a join
        if table == "voter_tag_members":
            op.execute(
                f"CREATE POLICY {table}_isolation ON {table} "
                "USING (voter_id IN ("
                "SELECT id FROM voters "
                "WHERE campaign_id = current_setting("
                "'app.current_campaign_id', true)::uuid"
                "))"
            )
        elif table == "voter_list_members":
            op.execute(
                f"CREATE POLICY {table}_isolation ON {table} "
                "USING (voter_list_id IN ("
                "SELECT id FROM voter_lists "
                "WHERE campaign_id = current_setting("
                "'app.current_campaign_id', true)::uuid"
                "))"
            )
        elif table == "field_mapping_templates":
            # System templates (campaign_id IS NULL) are visible to all;
            # campaign-scoped templates use standard isolation
            op.execute(
                f"CREATE POLICY {table}_isolation ON {table} "
                "USING (campaign_id IS NULL OR "
                "campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
            )
        else:
            op.execute(
                f"CREATE POLICY {table}_isolation ON {table} "
                "USING (campaign_id = current_setting("
                "'app.current_campaign_id', true)::uuid)"
            )

    # --- Grant permissions to app_user ---
    for table in _CAMPAIGN_TABLES:
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user"
        )

    # --- Seed L2 system mapping template ---
    op.execute(
        sa.text(
            "INSERT INTO field_mapping_templates "
            "(id, campaign_id, name, source_type, mapping, is_system, created_by) "
            "VALUES (gen_random_uuid(), NULL, 'L2 Voter File', "
            "'l2', CAST(:mapping AS jsonb), true, NULL)"
        ).bindparams(mapping=json.dumps(_L2_MAPPING))
    )


def downgrade() -> None:
    # Drop RLS policies
    for table in _CAMPAIGN_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Revoke permissions
    for table in _CAMPAIGN_TABLES:
        op.execute(f"REVOKE ALL ON {table} FROM app_user")

    # Drop tables in reverse dependency order
    op.drop_table("voter_list_members")
    op.drop_table("voter_tag_members")
    op.drop_table("voter_interactions")
    op.drop_table("voter_phones")
    op.drop_table("voter_emails")
    op.drop_table("voter_addresses")
    op.drop_table("voter_lists")
    op.drop_table("voter_tags")
    op.drop_table("import_jobs")
    op.drop_table("field_mapping_templates")
    op.drop_table("voters")
