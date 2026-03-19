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

from sqlalchemy import text

from alembic import op

revision: str = "012_drop_zitadel_org_uq"
down_revision: str = "011_campaign_member_role_check"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Find unique constraints on campaigns whose column set is exactly
    # {zitadel_org_id}.  Using an exact column-set match is more
    # deterministic than a LIKE on the constraint name.
    conn = op.get_bind()
    rows = conn.execute(
        text("""
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
            JOIN pg_attribute a
              ON a.attrelid = t.oid
             AND a.attnum = k.attnum
            WHERE n.nspname = current_schema()
              AND t.relname = 'campaigns'
              AND c.contype = 'u'
            GROUP BY c.conname
            HAVING array_agg(a.attname ORDER BY k.ord) = ARRAY['zitadel_org_id']
        """)
    ).fetchall()
    for (conname,) in rows:
        op.drop_constraint(conname, "campaigns", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "campaigns_zitadel_org_id_key", "campaigns", ["zitadel_org_id"]
    )
