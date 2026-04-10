"""Add volunteer applications and approval queue state.

Revision ID: 039_volunteer_applications
Revises: 038_signup_links
Create Date: 2026-04-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "039_volunteer_applications"
down_revision: str = "038_signup_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "volunteer_applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), nullable=False),
        sa.Column("signup_link_id", sa.Uuid(), nullable=False),
        sa.Column("signup_link_label", sa.String(length=255), nullable=False),
        sa.Column("applicant_user_id", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=32), server_default="pending", nullable=False
        ),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_volunteer_applications_status_valid",
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["signup_link_id"], ["signup_links.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_volunteer_applications_campaign_status",
        "volunteer_applications",
        ["campaign_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_volunteer_applications_signup_link_id",
        "volunteer_applications",
        ["signup_link_id"],
        unique=False,
    )
    op.create_index(
        "ix_volunteer_applications_applicant_user_id",
        "volunteer_applications",
        ["applicant_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_volunteer_applications_email"),
        "volunteer_applications",
        ["email"],
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_volunteer_applications_pending_user
        ON volunteer_applications (campaign_id, applicant_user_id)
        WHERE status = 'pending' AND applicant_user_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_volunteer_applications_pending_email
        ON volunteer_applications (campaign_id, email)
        WHERE status = 'pending'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_volunteer_applications_pending_email")
    op.execute("DROP INDEX IF EXISTS uq_volunteer_applications_pending_user")
    op.drop_index(
        op.f("ix_volunteer_applications_email"),
        table_name="volunteer_applications",
    )
    op.drop_index(
        "ix_volunteer_applications_applicant_user_id",
        table_name="volunteer_applications",
    )
    op.drop_index(
        "ix_volunteer_applications_signup_link_id",
        table_name="volunteer_applications",
    )
    op.drop_index(
        "ix_volunteer_applications_campaign_status",
        table_name="volunteer_applications",
    )
    op.drop_table("volunteer_applications")
