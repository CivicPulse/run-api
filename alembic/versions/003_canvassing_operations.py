"""Canvassing operations models with PostGIS and RLS policies.

Revision ID: 003
Revises: 002b
Create Date: 2026-03-09

Enables PostGIS extension, adds geom column to voters (backfilled from lat/long),
creates tables: turfs, survey_scripts, survey_questions, survey_responses,
walk_lists, walk_list_entries, walk_list_canvassers.

Enables RLS and creates isolation policies on all new tables.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "003"
down_revision: str = "002b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables with direct campaign_id for RLS
DIRECT_RLS_TABLES = [
    "turfs",
    "walk_lists",
    "survey_scripts",
    "survey_responses",
]


def upgrade() -> None:
    # -- 1. Enable PostGIS extension --
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # -- 2. Add geom column to voters --
    op.add_column(
        "voters",
        sa.Column("geom", Geometry("POINT", srid=4326), nullable=True),
    )
    op.create_index("ix_voters_geom", "voters", ["geom"], postgresql_using="gist")

    # -- 3. Backfill voter geom from lat/long --
    op.execute(
        """
        UPDATE voters
        SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND geom IS NULL
        """
    )

    # -- 4. Create turfs table --
    op.create_table(
        "turfs",
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
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column(
            "boundary",
            Geometry("POLYGON", srid=4326),
            nullable=False,
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
    op.create_index("ix_turfs_campaign_status", "turfs", ["campaign_id", "status"])
    op.create_index("ix_turfs_boundary", "turfs", ["boundary"], postgresql_using="gist")

    # -- 5. Create survey_scripts table (before walk_lists due to FK) --
    op.create_table(
        "survey_scripts",
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
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
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

    # -- 6. Create survey_questions table --
    op.create_table(
        "survey_questions",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "script_id",
            sa.UUID(),
            sa.ForeignKey("survey_scripts.id"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(50), nullable=False),
        sa.Column("options", JSONB(), nullable=True),
    )
    op.create_index(
        "ix_survey_questions_script_pos",
        "survey_questions",
        ["script_id", "position"],
    )

    # -- 7. Create survey_responses table --
    op.create_table(
        "survey_responses",
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
            "script_id",
            sa.UUID(),
            sa.ForeignKey("survey_scripts.id"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            sa.UUID(),
            sa.ForeignKey("survey_questions.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.UUID(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("answer_value", sa.Text(), nullable=False),
        sa.Column(
            "answered_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "answered_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_survey_responses_campaign_voter_script",
        "survey_responses",
        ["campaign_id", "voter_id", "script_id"],
    )

    # -- 8. Create walk_lists table --
    op.create_table(
        "walk_lists",
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
            "turf_id",
            sa.UUID(),
            sa.ForeignKey("turfs.id"),
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
        sa.Column("total_entries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "visited_entries",
            sa.Integer(),
            nullable=False,
            server_default="0",
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
    )
    op.create_index("ix_walk_lists_campaign_id", "walk_lists", ["campaign_id"])

    # -- 9. Create walk_list_entries table --
    op.create_table(
        "walk_list_entries",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "walk_list_id",
            sa.UUID(),
            sa.ForeignKey("walk_lists.id"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.UUID(),
            sa.ForeignKey("voters.id"),
            nullable=False,
        ),
        sa.Column("household_key", sa.String(500), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="pending",
        ),
    )
    op.create_index(
        "ix_walk_list_entries_list_seq",
        "walk_list_entries",
        ["walk_list_id", "sequence"],
    )

    # -- 10. Create walk_list_canvassers table --
    op.create_table(
        "walk_list_canvassers",
        sa.Column(
            "walk_list_id",
            sa.UUID(),
            sa.ForeignKey("walk_lists.id"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            primary_key=True,
        ),
        sa.Column(
            "assigned_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )

    # -- 11. RLS policies --
    # Direct campaign_id isolation
    for table in DIRECT_RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        rls_using = (
            "campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        )
        op.execute(f"CREATE POLICY {table}_isolation ON {table} USING ({rls_using})")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")

    # Subquery isolation for child tables
    # walk_list_entries via walk_lists
    op.execute("ALTER TABLE walk_list_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE walk_list_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY walk_list_entries_isolation ON walk_list_entries "
        "USING (walk_list_id IN ("
        "SELECT id FROM walk_lists "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON walk_list_entries TO app_user")

    # walk_list_canvassers via walk_lists
    op.execute("ALTER TABLE walk_list_canvassers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE walk_list_canvassers FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY walk_list_canvassers_isolation ON walk_list_canvassers "
        "USING (walk_list_id IN ("
        "SELECT id FROM walk_lists "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON walk_list_canvassers TO app_user"
    )

    # survey_questions via survey_scripts
    op.execute("ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY survey_questions_isolation ON survey_questions "
        "USING (script_id IN ("
        "SELECT id FROM survey_scripts "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON survey_questions TO app_user")


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_table("walk_list_canvassers")
    op.drop_table("walk_list_entries")
    op.drop_table("walk_lists")
    op.drop_table("survey_responses")
    op.drop_table("survey_questions")
    op.drop_table("survey_scripts")
    op.drop_table("turfs")

    # Remove geom column from voters
    op.drop_index("ix_voters_geom", table_name="voters")
    op.drop_column("voters", "geom")

    # Do NOT drop PostGIS extension (other things may use it)
