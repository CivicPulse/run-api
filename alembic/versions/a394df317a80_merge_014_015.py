"""merge_014_015

Revision ID: a394df317a80
Revises: 014_backfill_members, 015_org_members
Create Date: 2026-03-24 18:29:40.294545

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "a394df317a80"
down_revision: str | None = ("014_backfill_members", "015_org_members")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
