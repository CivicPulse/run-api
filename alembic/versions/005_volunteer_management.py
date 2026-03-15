"""Volunteer management models with RLS policies.

Revision ID: 005
Revises: 004
Create Date: 2026-03-09

Creates tables: volunteers, volunteer_tags, volunteer_tag_members,
volunteer_availability, shifts, shift_volunteers.

Enables RLS and creates isolation policies on all new tables.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

from alembic import op

revision: str = "005"
down_revision: str = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables with direct campaign_id for RLS
DIRECT_RLS_TABLES = [
    "volunteers",
    "volunteer_tags",
    "shifts",
]


def upgrade() -> None:
    # -- 1. Create volunteers table --
    op.create_table(
        "volunteers",
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
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("street", sa.String(500), nullable=True),
        sa.Column("city", sa.String(255), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("zip_code", sa.String(20), nullable=True),
        sa.Column("emergency_contact_name", sa.String(255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("skills", ARRAY(sa.String()), nullable=False, server_default="{}"),
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
    op.create_index("ix_volunteers_campaign_id", "volunteers", ["campaign_id"])
    op.create_index("ix_volunteers_user_id", "volunteers", ["user_id"])

    # -- 2. Create volunteer_tags table --
    op.create_table(
        "volunteer_tags",
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
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_volunteer_tags_campaign_id", "volunteer_tags", ["campaign_id"])

    # -- 3. Create volunteer_tag_members table --
    op.create_table(
        "volunteer_tag_members",
        sa.Column(
            "volunteer_id",
            sa.UUID(),
            sa.ForeignKey("volunteers.id"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.UUID(),
            sa.ForeignKey("volunteer_tags.id"),
            primary_key=True,
        ),
    )

    # -- 4. Create volunteer_availability table --
    op.create_table(
        "volunteer_availability",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "volunteer_id",
            sa.UUID(),
            sa.ForeignKey("volunteers.id"),
            nullable=False,
        ),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_volunteer_availability_vol_times",
        "volunteer_availability",
        ["volunteer_id", "start_at", "end_at"],
    )

    # -- 5. Create shifts table --
    op.create_table(
        "shifts",
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
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="scheduled"),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column("max_volunteers", sa.Integer(), nullable=False),
        sa.Column("location_name", sa.String(255), nullable=True),
        sa.Column("street", sa.String(500), nullable=True),
        sa.Column("city", sa.String(255), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("zip_code", sa.String(20), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "turf_id",
            sa.UUID(),
            sa.ForeignKey("turfs.id"),
            nullable=True,
        ),
        sa.Column(
            "phone_bank_session_id",
            sa.UUID(),
            sa.ForeignKey("phone_bank_sessions.id"),
            nullable=True,
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
    op.create_index("ix_shifts_campaign_id", "shifts", ["campaign_id"])
    op.create_index("ix_shifts_campaign_start", "shifts", ["campaign_id", "start_at"])

    # -- 6. Create shift_volunteers table --
    op.create_table(
        "shift_volunteers",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shift_id",
            sa.UUID(),
            sa.ForeignKey("shifts.id"),
            nullable=False,
        ),
        sa.Column(
            "volunteer_id",
            sa.UUID(),
            sa.ForeignKey("volunteers.id"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="signed_up",
        ),
        sa.Column("waitlist_position", sa.Integer(), nullable=True),
        sa.Column("check_in_at", sa.DateTime(), nullable=True),
        sa.Column("check_out_at", sa.DateTime(), nullable=True),
        sa.Column("adjusted_hours", sa.Float(), nullable=True),
        sa.Column("adjustment_reason", sa.String(500), nullable=True),
        sa.Column(
            "adjusted_by",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("adjusted_at", sa.DateTime(), nullable=True),
        sa.Column(
            "signed_up_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("shift_id", "volunteer_id", name="uq_shift_volunteer"),
    )
    op.create_index("ix_shift_volunteers_shift_id", "shift_volunteers", ["shift_id"])

    # -- 7. RLS policies --
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
    # volunteer_tag_members via volunteer_tags
    op.execute("ALTER TABLE volunteer_tag_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE volunteer_tag_members FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY volunteer_tag_members_isolation ON volunteer_tag_members "
        "USING (tag_id IN ("
        "SELECT id FROM volunteer_tags "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON volunteer_tag_members TO app_user"
    )

    # volunteer_availability via volunteers
    op.execute("ALTER TABLE volunteer_availability ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE volunteer_availability FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY volunteer_availability_isolation ON volunteer_availability "
        "USING (volunteer_id IN ("
        "SELECT id FROM volunteers "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON volunteer_availability TO app_user"
    )

    # shift_volunteers via shifts
    op.execute("ALTER TABLE shift_volunteers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE shift_volunteers FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY shift_volunteers_isolation ON shift_volunteers "
        "USING (shift_id IN ("
        "SELECT id FROM shifts "
        "WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON shift_volunteers TO app_user")


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_table("shift_volunteers")
    op.drop_table("shifts")
    op.drop_table("volunteer_availability")
    op.drop_table("volunteer_tag_members")
    op.drop_table("volunteer_tags")
    op.drop_table("volunteers")
