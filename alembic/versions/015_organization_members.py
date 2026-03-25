"""Create organization_members table and seed org_owner records.

Revision ID: 015_org_members
Revises: 013_campaign_slug
Create Date: 2026-03-24

Seeds org_owner membership rows from each Organization's ``created_by``
user so that existing organization creators are automatically granted
the org_owner role.
"""

import sqlalchemy as sa

from alembic import op

revision = "015_org_members"
down_revision = "013_campaign_slug"
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_members",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("invited_by", sa.String(), nullable=True),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.UniqueConstraint(
            "user_id",
            "organization_id",
            name="uq_user_organization",
        ),
        sa.CheckConstraint(
            "role IN ('org_owner', 'org_admin')",
            name="ck_organization_members_role_valid",
        ),
    )

    # Seed org_owner records from organizations.created_by
    op.execute(
        sa.text("""
        INSERT INTO organization_members
            (id, user_id, organization_id, role, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            o.created_by,
            o.id,
            'org_owner',
            NOW(),
            NOW()
        FROM organizations o
        ON CONFLICT DO NOTHING
        """)
    )


def downgrade() -> None:
    op.drop_table("organization_members")
