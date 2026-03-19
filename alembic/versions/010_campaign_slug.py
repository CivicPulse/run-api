"""Add slug column to campaigns table with backfill.

Revision ID: 010_campaign_slug
Revises: 009_organizations
Create Date: 2026-03-18

Backfills ``slug`` from the campaign ``name`` using the same transformation
applied by ``app.utils.slug.generate_slug``:
1. Lowercase.
2. Replace non-alphanumeric runs with a single hyphen.
3. Strip leading/trailing hyphens.

Duplicate slugs after backfill are disambiguated with numeric suffixes
via a PostgreSQL CTE that assigns ``ROW_NUMBER()`` per base-slug partition
and appends ``-<n>`` for rows 2 and onward.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "010_campaign_slug"
down_revision: str = "009_organizations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable slug column then backfill from name, handling duplicates."""
    # 1. Add the column as nullable (so existing rows don't violate NOT NULL)
    op.add_column(
        "campaigns",
        sa.Column("slug", sa.String(255), nullable=True),
    )

    # 2. Backfill: derive base slug from name, then disambiguate duplicates.
    #    The CTE ranks rows sharing the same base slug by id (deterministic).
    #    Row 1 keeps the plain base slug; rows 2+ get "-<rank>" appended.
    op.execute(
        """
        WITH base AS (
            SELECT
                id,
                LOWER(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'),
                        '^-|-$',
                        '',
                        'g'
                    )
                ) AS base_slug
            FROM campaigns
        ),
        ranked AS (
            SELECT
                id,
                base_slug,
                ROW_NUMBER() OVER (
                    PARTITION BY base_slug ORDER BY id
                ) AS rn
            FROM base
        )
        UPDATE campaigns
        SET slug = CASE
            WHEN ranked.rn = 1 THEN ranked.base_slug
            ELSE ranked.base_slug || '-' || ranked.rn::text
        END
        FROM ranked
        WHERE campaigns.id = ranked.id
        """
    )

    # 3. Now that all rows have a value, add the unique index.
    #    We do NOT set NOT NULL — new campaigns always get a slug via the
    #    service layer, but nullable allows a safe rollout without data loss.
    op.create_index(
        "ix_campaigns_slug",
        "campaigns",
        ["slug"],
        unique=True,
    )


def downgrade() -> None:
    """Remove slug index and column."""
    op.drop_index("ix_campaigns_slug", table_name="campaigns")
    op.drop_column("campaigns", "slug")
