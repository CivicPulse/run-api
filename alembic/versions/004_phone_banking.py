"""Phone banking models with RLS policies.

Revision ID: 004
Revises: 003
Create Date: 2026-03-09

Creates tables: call_lists, call_list_entries, phone_bank_sessions,
session_callers, do_not_call.

Enables RLS and creates isolation policies on all new tables.
NOTE: InteractionType uses native_enum=False (VARCHAR), so the new
PHONE_CALL Python enum value works without a migration step.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "004"
down_revision: str = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables with direct campaign_id for RLS
DIRECT_RLS_TABLES = [
    "call_lists",
    "phone_bank_sessions",
    "do_not_call",
]


def upgrade() -> None:
    # -- 1. Create call_lists table --
    op.create_table(
        "call_lists",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.UUID(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_list_id",
            sa.UUID(),
            sa.ForeignKey("voter_lists.id"),
            nullable=True,
        ),
        sa.Column(
            "script_id",
            sa.UUID(),
            sa.ForeignKey("survey_scripts.id"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="draft"
        ),
        sa.Column(
            "total_entries", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "completed_entries",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "max_attempts", sa.Integer(), nullable=False, server_default="3"
        ),
        sa.Column(
            "claim_timeout_minutes",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
        sa.Column(
            "cooldown_minutes",
            sa.Integer(),
            nullable=False,
            server_default="60",
        ),
        sa.Column(
            "created_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_call_lists_campaign_id", "call_lists", ["campaign_id"]
    )

    # -- 2. Create call_list_entries table --
    op.create_table(
        "call_list_entries",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "call_list_id",
            sa.UUID(),
            sa.ForeignKey("call_lists.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.UUID(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column(
            "priority_score",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("phone_numbers", JSONB(), nullable=False, server_default="[]"),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="available",
        ),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "claimed_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("phone_attempts", JSONB(), nullable=True),
    )
    op.create_index(
        "ix_call_list_entries_list_status",
        "call_list_entries",
        ["call_list_id", "status"],
    )
    op.create_index(
        "ix_call_list_entries_list_priority",
        "call_list_entries",
        ["call_list_id", "priority_score"],
    )

    # -- 3. Create phone_bank_sessions table --
    op.create_table(
        "phone_bank_sessions",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.UUID(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "call_list_id",
            sa.UUID(),
            sa.ForeignKey("call_lists.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="draft"
        ),
        sa.Column("scheduled_start", sa.DateTime(), nullable=True),
        sa.Column("scheduled_end", sa.DateTime(), nullable=True),
        sa.Column(
            "created_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_phone_bank_sessions_campaign_id",
        "phone_bank_sessions",
        ["campaign_id"],
    )

    # -- 4. Create session_callers table --
    op.create_table(
        "session_callers",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey("phone_bank_sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("check_in_at", sa.DateTime(), nullable=True),
        sa.Column("check_out_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_session_callers_session_id",
        "session_callers",
        ["session_id"],
    )

    # -- 5. Create do_not_call table --
    op.create_table(
        "do_not_call",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.UUID(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("phone_number", sa.String(50), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column(
            "added_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "added_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "campaign_id", "phone_number", name="uq_dnc_campaign_phone"
        ),
    )

    # -- 6. RLS policies --
    # Direct campaign_id isolation
    for table in DIRECT_RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        rls_using = (
            "campaign_id = "
            "current_setting('app.current_campaign_id', true)::uuid"
        )
        op.execute(
            f"CREATE POLICY {table}_isolation ON {table} "
            f"USING ({rls_using})"
        )
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user"
        )

    # Subquery isolation for child tables
    # call_list_entries via call_lists
    op.execute(
        "ALTER TABLE call_list_entries ENABLE ROW LEVEL SECURITY"
    )
    op.execute(
        "ALTER TABLE call_list_entries FORCE ROW LEVEL SECURITY"
    )
    op.execute(
        "CREATE POLICY call_list_entries_isolation ON call_list_entries "
        "USING (call_list_id IN ("
        "SELECT id FROM call_lists "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON call_list_entries TO app_user"
    )

    # session_callers via phone_bank_sessions
    op.execute(
        "ALTER TABLE session_callers ENABLE ROW LEVEL SECURITY"
    )
    op.execute(
        "ALTER TABLE session_callers FORCE ROW LEVEL SECURITY"
    )
    op.execute(
        "CREATE POLICY session_callers_isolation ON session_callers "
        "USING (session_id IN ("
        "SELECT id FROM phone_bank_sessions "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON session_callers TO app_user"
    )


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_table("session_callers")
    op.drop_table("phone_bank_sessions")
    op.drop_table("call_list_entries")
    op.drop_table("do_not_call")
    op.drop_table("call_lists")
