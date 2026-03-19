"""Add CHECK constraint for campaign_members.role column.

Revision ID: 011_campaign_member_role_check
Revises: 010_session_caller_unique
Create Date: 2026-03-19

Migration 008 added the role column but omitted the CHECK constraint
declared in the CampaignMember model.  This migration adds it.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "011_campaign_member_role_check"
down_revision: str = "010_session_caller_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_campaign_members_role_valid",
        "campaign_members",
        "role IS NULL OR role IN ('viewer', 'volunteer', 'manager', 'admin', 'owner')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_campaign_members_role_valid", "campaign_members")
