"""Add client_uuid to voter_interactions for door-knock idempotency.

Revision ID: 040_door_knock_client_uuid
Revises: 039_volunteer_applications
Create Date: 2026-04-11

Plan 110-02 / OFFLINE-01: introduces a volunteer-device-generated
``client_uuid`` column on ``voter_interactions`` and enforces
exactly-once delivery for door-knock POSTs via a partial UNIQUE index
scoped to ``type = 'door_knock'``. Existing non-door-knock rows remain
NULL and are unaffected. The migration is idempotent (safe to re-run
via ``IF NOT EXISTS`` guards) and fully reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "040_door_knock_client_uuid"
down_revision: str = "039_volunteer_applications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add the nullable column. NULLABLE because non-door-knock
    #    interaction types (notes, tags, imports, ...) legitimately do
    #    not carry a client_uuid. The partial unique index below
    #    enforces non-null + uniqueness for door_knock rows only.
    op.execute(
        """
        ALTER TABLE voter_interactions
        ADD COLUMN IF NOT EXISTS client_uuid UUID
        """
    )

    # 2. Backfill existing door_knock rows with a generated UUID so the
    #    partial unique index can apply without violating pre-existing
    #    data. pgcrypto provides gen_random_uuid(); the 001 migration
    #    enables it. Non-door-knock rows stay NULL.
    #
    #    NOTE: the ``type`` column is a native_enum=False SQLAlchemy Enum
    #    over ``InteractionType`` (StrEnum), which stores the *member
    #    NAME* ("DOOR_KNOCK"), not the StrEnum value ("door_knock"). The
    #    partial index predicate and backfill filter must both match the
    #    on-disk uppercase form or the index will never be populated.
    op.execute(
        """
        UPDATE voter_interactions
        SET client_uuid = gen_random_uuid()
        WHERE type = 'DOOR_KNOCK' AND client_uuid IS NULL
        """
    )

    # 3. Create the partial UNIQUE index. Using op.execute for a partial
    #    index (Alembic's create_index doesn't expose postgresql_where
    #    cleanly for unique constraints in all versions). IF NOT EXISTS
    #    keeps the migration re-runnable.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_voter_interactions_door_knock_client_uuid
        ON voter_interactions (campaign_id, client_uuid)
        WHERE type = 'DOOR_KNOCK'
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS uq_voter_interactions_door_knock_client_uuid"
    )
    op.execute(
        "ALTER TABLE voter_interactions DROP COLUMN IF EXISTS client_uuid"
    )


# Silence ruff unused import in case future edits don't reference sa.
_ = sa
