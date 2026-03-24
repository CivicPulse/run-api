"""Backfill missing CampaignMember records for multi-campaign orgs.

Revision ID: 014_backfill_members
Revises: 013_campaign_slug
Create Date: 2026-03-24

For each existing campaign_member, find the user's org via campaign ->
organization, then create membership for ALL campaigns in that org.
Uses ON CONFLICT to safely handle existing records (idempotent).
"""

from alembic import op

revision = "014_backfill_members"
down_revision = "013_campaign_slug"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Backfill campaign_members for users missing multi-campaign memberships."""
    op.execute("""
        INSERT INTO campaign_members (id, user_id, campaign_id, synced_at)
        SELECT
            gen_random_uuid(),
            cm_existing.user_id,
            c_other.id,
            NOW()
        FROM campaign_members cm_existing
        JOIN campaigns c_source ON cm_existing.campaign_id = c_source.id
        JOIN campaigns c_other ON c_other.organization_id = c_source.organization_id
        WHERE c_other.id != c_source.id
        ON CONFLICT (user_id, campaign_id) DO NOTHING
    """)


def downgrade() -> None:
    """Data migration -- downgrade is a no-op.

    Cannot determine which records were backfilled vs. originally created.
    """
