"""Drop unique constraint on campaigns.zitadel_org_id.

Revision ID: 012_drop_campaign_zitadel_org_unique
Revises: 011_campaign_member_role_check
Create Date: 2026-03-19

Allows multiple campaigns to share the same ZITADEL organization.
The Organization model is the authoritative 1:1 mapping to ZITADEL orgs;
campaigns reference organizations via the organization_id FK.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "012_drop_campaign_zitadel_org_unique"
down_revision: str = "011_campaign_member_role_check"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("campaigns_zitadel_org_id_key", "campaigns", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "campaigns_zitadel_org_id_key", "campaigns", ["zitadel_org_id"]
    )
