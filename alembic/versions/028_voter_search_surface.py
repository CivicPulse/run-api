"""Campaign-scoped voter search surface.

Revision ID: 028_voter_search_surface
Revises: 027_data_integrity
Create Date: 2026-04-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "028_voter_search_surface"
down_revision: str = "027_data_integrity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    op.create_table(
        "voter_search_records",
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "name_full", sa.String(length=511), nullable=False, server_default=""
        ),
        sa.Column(
            "name_first", sa.String(length=255), nullable=False, server_default=""
        ),
        sa.Column(
            "name_last", sa.String(length=255), nullable=False, server_default=""
        ),
        sa.Column("city", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("state", sa.String(length=2), nullable=False, server_default=""),
        sa.Column("zip_code", sa.String(length=10), nullable=False, server_default=""),
        sa.Column("source_ids", sa.Text(), nullable=False, server_default=""),
        sa.Column("email_values", sa.Text(), nullable=False, server_default=""),
        sa.Column("phone_values", sa.Text(), nullable=False, server_default=""),
        sa.Column("phone_digits", sa.Text(), nullable=False, server_default=""),
        sa.Column("address_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("document", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "refreshed_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_voter_search_records_campaign_id",
        "voter_search_records",
        ["campaign_id"],
    )
    op.create_index(
        "ix_voter_search_records_name_full",
        "voter_search_records",
        ["name_full"],
    )
    op.create_index(
        "ix_voter_search_records_phone_digits",
        "voter_search_records",
        ["phone_digits"],
    )
    op.create_index(
        "ix_voter_search_records_source_ids",
        "voter_search_records",
        ["source_ids"],
    )
    op.execute(
        "CREATE INDEX ix_voter_search_records_document_trgm "
        "ON voter_search_records USING gin (document gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_voter_search_records_name_full_trgm "
        "ON voter_search_records USING gin (name_full gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_voter_search_records_address_text_trgm "
        "ON voter_search_records USING gin (address_text gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_voter_search_records_email_values_trgm "
        "ON voter_search_records USING gin (email_values gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_voter_search_records_source_ids_trgm "
        "ON voter_search_records USING gin (source_ids gin_trgm_ops)"
    )

    op.execute("ALTER TABLE voter_search_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE voter_search_records FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY voter_search_records_isolation ON voter_search_records "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON voter_search_records TO app_user"
    )

    op.execute(
        """
        INSERT INTO voter_search_records (
            voter_id,
            campaign_id,
            name_full,
            name_first,
            name_last,
            city,
            state,
            zip_code,
            source_ids,
            email_values,
            phone_values,
            phone_digits,
            address_text,
            document,
            refreshed_at
        )
        SELECT
            v.id,
            v.campaign_id,
            lower(trim(concat_ws(' ', v.first_name, v.last_name))),
            lower(coalesce(v.first_name, '')),
            lower(coalesce(v.last_name, '')),
            lower(coalesce(v.registration_city, '')),
            lower(coalesce(v.registration_state, '')),
            coalesce(v.registration_zip, ''),
            lower(trim(concat_ws(' ', v.source_type, v.source_id))),
            coalesce(emails.email_values, ''),
            coalesce(phones.phone_values, ''),
            coalesce(phones.phone_digits, ''),
            trim(concat_ws(' ', base_address.address_text, coalesce(addresses.address_text, ''))),
            trim(
                concat_ws(
                    ' ',
                    lower(trim(concat_ws(' ', v.first_name, v.last_name))),
                    lower(coalesce(v.first_name, '')),
                    lower(coalesce(v.last_name, '')),
                    lower(coalesce(v.registration_city, '')),
                    lower(coalesce(v.registration_state, '')),
                    coalesce(v.registration_zip, ''),
                    lower(trim(concat_ws(' ', v.source_type, v.source_id))),
                    coalesce(emails.email_values, ''),
                    coalesce(phones.phone_values, ''),
                    coalesce(phones.phone_digits, ''),
                    base_address.address_text,
                    coalesce(addresses.address_text, '')
                )
            ),
            now()
        FROM voters v
        LEFT JOIN (
            SELECT
                vp.voter_id,
                lower(string_agg(vp.value, ' ' ORDER BY vp.is_primary DESC, vp.updated_at DESC, vp.id)) AS phone_values,
                string_agg(regexp_replace(vp.value, '\\D', '', 'g'), ' ' ORDER BY vp.is_primary DESC, vp.updated_at DESC, vp.id) AS phone_digits
            FROM voter_phones vp
            GROUP BY vp.voter_id
        ) phones ON phones.voter_id = v.id
        LEFT JOIN (
            SELECT
                ve.voter_id,
                lower(string_agg(ve.value, ' ' ORDER BY ve.is_primary DESC, ve.updated_at DESC, ve.id)) AS email_values
            FROM voter_emails ve
            GROUP BY ve.voter_id
        ) emails ON emails.voter_id = v.id
        LEFT JOIN (
            SELECT
                va.voter_id,
                lower(
                    string_agg(
                        trim(concat_ws(' ', va.address_line1, va.address_line2, va.city, va.state, va.zip_code)),
                        ' '
                        ORDER BY va.is_primary DESC, va.updated_at DESC, va.id
                    )
                ) AS address_text
            FROM voter_addresses va
            GROUP BY va.voter_id
        ) addresses ON addresses.voter_id = v.id
        LEFT JOIN (
            SELECT
                v2.id AS voter_id,
                lower(
                    trim(
                        concat_ws(
                            ' ',
                            v2.registration_line1,
                            v2.registration_line2,
                            v2.mailing_line1,
                            v2.mailing_line2,
                            v2.registration_city,
                            v2.registration_state,
                            v2.registration_zip
                        )
                    )
                ) AS address_text
            FROM voters v2
        ) base_address ON base_address.voter_id = v.id
        """
    )


def downgrade() -> None:
    op.execute(
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON voter_search_records FROM app_user"
    )
    op.execute(
        "DROP POLICY IF EXISTS voter_search_records_isolation ON voter_search_records"
    )
    op.execute("ALTER TABLE voter_search_records NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE voter_search_records DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS ix_voter_search_records_source_ids_trgm")
    op.execute("DROP INDEX IF EXISTS ix_voter_search_records_email_values_trgm")
    op.execute("DROP INDEX IF EXISTS ix_voter_search_records_address_text_trgm")
    op.execute("DROP INDEX IF EXISTS ix_voter_search_records_name_full_trgm")
    op.execute("DROP INDEX IF EXISTS ix_voter_search_records_document_trgm")
    op.drop_index(
        "ix_voter_search_records_source_ids", table_name="voter_search_records"
    )
    op.drop_index(
        "ix_voter_search_records_phone_digits",
        table_name="voter_search_records",
    )
    op.drop_index(
        "ix_voter_search_records_name_full", table_name="voter_search_records"
    )
    op.drop_index(
        "ix_voter_search_records_campaign_id",
        table_name="voter_search_records",
    )
    op.drop_table("voter_search_records")
