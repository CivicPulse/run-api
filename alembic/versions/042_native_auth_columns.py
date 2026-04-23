"""Add native-auth columns to users + create auth_access_tokens table.

Revision ID: 042_native_auth_columns
Revises: 041_invite_email_delivery_tz_aware
Create Date: 2026-04-23

Step 1 of the DIY auth rebuild (see `.planning/notes/diy-auth-plan.md`).
Adds the ``fastapi-users`` base-mixin columns to the existing ``users`` table
alongside the ZITADEL-managed rows, and creates the Postgres-backed access-token
table used by ``DatabaseStrategy``.

All new columns on ``users`` are nullable or defaulted so existing ZITADEL rows
remain valid. ``email`` is intentionally NOT made unique here -- Step 4 handles
dedupe after the backfill.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "042_native_auth_columns"
down_revision: str = "041_invite_email_delivery_tz_aware"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- users table: fastapi-users mixin columns ---
    op.add_column(
        "users",
        sa.Column("hashed_password", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # --- auth_access_tokens table: fastapi-users DatabaseStrategy storage ---
    op.create_table(
        "auth_access_tokens",
        sa.Column("token", sa.String(length=43), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=255),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_auth_access_tokens_user_id",
        "auth_access_tokens",
        ["user_id"],
    )
    op.create_index(
        "ix_auth_access_tokens_created_at",
        "auth_access_tokens",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_access_tokens_created_at", table_name="auth_access_tokens")
    op.drop_index("ix_auth_access_tokens_user_id", table_name="auth_access_tokens")
    op.drop_table("auth_access_tokens")

    op.drop_column("users", "is_verified")
    op.drop_column("users", "is_superuser")
    op.drop_column("users", "is_active")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "hashed_password")
