"""Add call_records table, campaign calling hours, org API key columns.

Revision ID: 032_call_records_and_voice_config
Revises: 031_webhook_events
Create Date: 2026-04-07 22:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "032_call_records_and_voice_config"
down_revision = "031_webhook_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- call_records table ---
    op.create_table(
        "call_records",
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
        sa.Column("twilio_sid", sa.String(64), nullable=True),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "caller_user_id",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "phone_bank_session_id",
            sa.Uuid(),
            sa.ForeignKey("phone_bank_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "direction",
            sa.String(10),
            nullable=False,
            server_default="outbound",
        ),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="initiated",
        ),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # Unique partial index on twilio_sid WHERE NOT NULL
    op.execute(
        "CREATE UNIQUE INDEX ix_call_records_twilio_sid "
        "ON call_records (twilio_sid) WHERE twilio_sid IS NOT NULL"
    )

    # Composite indexes for common query patterns
    op.create_index(
        "ix_call_records_campaign_voter_created",
        "call_records",
        ["campaign_id", "voter_id", "created_at"],
    )
    op.create_index(
        "ix_call_records_campaign_caller_created",
        "call_records",
        ["campaign_id", "caller_user_id", "created_at"],
    )

    # RLS
    op.execute("ALTER TABLE call_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE call_records FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY call_records_isolation ON call_records "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )

    # Grant to app_user
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON call_records TO app_user"
    )

    # --- Organization: API key columns ---
    op.add_column(
        "organizations",
        sa.Column("twilio_api_key_sid", sa.String(64), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_api_key_secret_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_api_key_secret_key_id", sa.String(32), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("twilio_twiml_app_sid", sa.String(64), nullable=True),
    )

    # --- Campaign: calling hours columns ---
    op.add_column(
        "campaigns",
        sa.Column(
            "calling_hours_start",
            sa.Time(),
            server_default=sa.text("'09:00'::time"),
            nullable=False,
        ),
    )
    op.add_column(
        "campaigns",
        sa.Column(
            "calling_hours_end",
            sa.Time(),
            server_default=sa.text("'21:00'::time"),
            nullable=False,
        ),
    )
    op.add_column(
        "campaigns",
        sa.Column(
            "calling_hours_timezone",
            sa.String(64),
            server_default="America/New_York",
            nullable=False,
        ),
    )


def downgrade() -> None:
    # Campaign columns
    op.drop_column("campaigns", "calling_hours_timezone")
    op.drop_column("campaigns", "calling_hours_end")
    op.drop_column("campaigns", "calling_hours_start")

    # Organization columns
    op.drop_column("organizations", "twilio_twiml_app_sid")
    op.drop_column("organizations", "twilio_api_key_secret_key_id")
    op.drop_column("organizations", "twilio_api_key_secret_encrypted")
    op.drop_column("organizations", "twilio_api_key_sid")

    # call_records table (indexes drop with table)
    op.execute("DROP POLICY IF EXISTS call_records_isolation ON call_records")
    op.drop_index(
        "ix_call_records_campaign_caller_created", table_name="call_records"
    )
    op.drop_index(
        "ix_call_records_campaign_voter_created", table_name="call_records"
    )
    op.execute("DROP INDEX IF EXISTS ix_call_records_twilio_sid")
    op.drop_table("call_records")
