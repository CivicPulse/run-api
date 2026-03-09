"""Create invites table with RLS.

Revision ID: 002
Revises: 001
Create Date: 2026-03-09

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invites",
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
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column(
            "token",
            sa.Uuid(),
            unique=True,
            nullable=False,
            index=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
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
        sa.UniqueConstraint(
            "email", "campaign_id", name="uq_pending_invite_email_campaign"
        ),
    )

    # Enable RLS on invites table
    op.execute("ALTER TABLE invites ENABLE ROW LEVEL SECURITY")

    # RLS policy: isolate by campaign_id
    op.execute(
        "CREATE POLICY invite_isolation ON invites "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )

    # Grant permissions to app_user
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO app_user"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS invite_isolation ON invites")
    op.execute("ALTER TABLE invites DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON invites FROM app_user")
    op.drop_table("invites")
