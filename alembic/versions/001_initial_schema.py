"""Initial schema with RLS policies and app_user role.

Revision ID: 001
Revises:
Create Date: 2026-03-09

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Create tables ---

    op.create_table(
        "users",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
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

    op.create_table(
        "campaigns",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "zitadel_org_id",
            sa.String(255),
            unique=True,
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "type",
            sa.String(20),
            nullable=False,
        ),
        sa.Column("jurisdiction_fips", sa.String(15), nullable=True),
        sa.Column("jurisdiction_name", sa.String(255), nullable=True),
        sa.Column("election_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("candidate_name", sa.String(255), nullable=True),
        sa.Column("party_affiliation", sa.String(100), nullable=True),
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

    op.create_table(
        "campaign_members",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "campaign_id", name="uq_user_campaign"),
    )

    # --- Create app_user database role ---
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS ("
        "SELECT FROM pg_catalog.pg_roles "
        "WHERE rolname = 'app_user') THEN "
        "CREATE ROLE app_user WITH LOGIN PASSWORD 'app_password' NOINHERIT; "
        "END IF; "
        "END $$"
    )

    # --- Enable RLS on all tables ---
    op.execute("ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")

    # --- Create RLS policies ---
    # Campaigns: isolate by campaign id
    op.execute(
        "CREATE POLICY campaign_isolation ON campaigns "
        "USING (id = current_setting('app.current_campaign_id', true)::uuid)"
    )

    # Campaign members: isolate by campaign_id
    op.execute(
        "CREATE POLICY campaign_member_isolation ON campaign_members "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )

    # Users: accessible via campaign_members join
    op.execute(
        "CREATE POLICY user_campaign_isolation ON users "
        "USING (id IN ("
        "SELECT user_id FROM campaign_members "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )

    # --- Grant permissions to app_user ---
    op.execute("GRANT USAGE ON SCHEMA public TO app_user")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE "
        "ON ALL TABLES IN SCHEMA public TO app_user"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user"
    )


def downgrade() -> None:
    # Drop RLS policies
    op.execute("DROP POLICY IF EXISTS campaign_isolation ON campaigns")
    op.execute("DROP POLICY IF EXISTS campaign_member_isolation ON campaign_members")
    op.execute("DROP POLICY IF EXISTS user_campaign_isolation ON users")

    # Disable RLS
    op.execute("ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")

    # Revoke permissions
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user")
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_user")

    # Drop tables
    op.drop_table("campaign_members")
    op.drop_table("campaigns")
    op.drop_table("users")

    # Drop role
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN "
        "DROP ROLE app_user; "
        "END IF; "
        "END $$"
    )
