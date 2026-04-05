"""RLS hardening: FORCE on core tables + RLS on organizations.

Revision ID: 026_rls_hardening
Revises: 025_import_cleanup_and_processing_start
Create Date: 2026-04-04

Closes C5 (FORCE missing on campaigns/campaign_members/users) and
C6 (no RLS on organizations/organization_members) from the
2026-04-04 codebase review.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "026_rls_hardening"
down_revision: str = "025_import_cleanup_and_processing_start"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- C5: FORCE RLS on core tables (ENABLE already exists from 001) ---
    op.execute("ALTER TABLE campaigns FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")

    # --- C6: Enable RLS on organizations ---
    op.execute("ALTER TABLE organizations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY organizations_isolation ON organizations "
        "USING (id IN ("
        "SELECT organization_id FROM campaigns "
        "WHERE id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO app_user")

    # --- C6: Enable RLS on organization_members ---
    op.execute("ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organization_members FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY organization_members_isolation ON organization_members "
        "USING (organization_id IN ("
        "SELECT organization_id FROM campaigns "
        "WHERE id = current_setting('app.current_campaign_id', true)::uuid"
        "))"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO app_user"
    )


def downgrade() -> None:
    # C6 reversal: drop policies + DISABLE RLS (these tables had no RLS pre-026)
    op.execute(
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON organization_members FROM app_user"
    )
    op.execute(
        "DROP POLICY IF EXISTS organization_members_isolation ON organization_members"
    )
    op.execute("ALTER TABLE organization_members NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY")

    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON organizations FROM app_user")
    op.execute("DROP POLICY IF EXISTS organizations_isolation ON organizations")
    op.execute("ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations DISABLE ROW LEVEL SECURITY")

    # C5 reversal: NO FORCE (leave ENABLE + pre-existing policies in place)
    op.execute("ALTER TABLE users NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaign_members NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE campaigns NO FORCE ROW LEVEL SECURITY")
