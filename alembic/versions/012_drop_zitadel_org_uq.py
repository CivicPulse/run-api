"""Drop unique constraint on campaigns.zitadel_org_id.

Revision ID: 012_drop_zitadel_org_uq
Revises: 011_campaign_member_role_check
Create Date: 2026-03-19

Allows multiple campaigns to share the same ZITADEL organization.
The Organization model is the authoritative 1:1 mapping to ZITADEL orgs;
campaigns reference organizations via the organization_id FK.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import inspect, text

from alembic import op

revision: str = "012_drop_zitadel_org_uq"
down_revision: str = "011_campaign_member_role_check"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Check if the constraint exists before attempting to drop it.
    # On fresh databases the constraint may have a different auto-generated name
    # or may not exist if the column was previously altered.
    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE conrelid = 'campaigns'::regclass "
            "AND contype = 'u' "
            "AND conname LIKE '%zitadel_org_id%'"
        )
    ).fetchone()
    if result:
        op.drop_constraint(result[0], "campaigns", type_="unique")
    else:
        # Constraint doesn't exist — nothing to drop
        pass


def downgrade() -> None:
    op.create_unique_constraint(
        "campaigns_zitadel_org_id_key", "campaigns", ["zitadel_org_id"]
    )
