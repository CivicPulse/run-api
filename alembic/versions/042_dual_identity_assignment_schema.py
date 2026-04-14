"""Dual-identity schema for session_callers and walk_list_canvassers.

Revision ID: 042_dual_identity_assignment_schema
Revises: 041_volunteer_user_reconciliation
Create Date: 2026-04-14

Phase 111 / ASSIGN-01 + ASSIGN-02: Widens both assignment tables to
accept EITHER user_id (logged-in member) OR volunteer_id (pre-signup
volunteer) as primary identity, with an exactly-one CHECK constraint
enforced via num_nonnulls(user_id, volunteer_id) = 1. Per-table
uniqueness (one assignment per identity per session/walk-list) is
recovered via two partial unique indexes per table.

session_callers changes:
- DROP NOT NULL on user_id
- ADD volunteer_id uuid NULL REFERENCES volunteers(id)
- DROP UniqueConstraint uq_session_caller (session_id, user_id)
- ADD CHECK ck_session_callers_exactly_one_identity
- ADD partial UNIQUE uq_session_callers_session_user
- ADD partial UNIQUE uq_session_callers_session_volunteer

walk_list_canvassers changes (more invasive -- composite PK is dropped):
- ADD surrogate id uuid PK
- DROP composite PK (walk_list_id, user_id)
- DROP NOT NULL on user_id
- ADD volunteer_id uuid NULL REFERENCES volunteers(id)
- ADD CHECK ck_walk_list_canvassers_exactly_one_identity
- ADD partial UNIQUE uq_walk_list_canvassers_list_user
- ADD partial UNIQUE uq_walk_list_canvassers_list_volunteer

Reversibility:
- downgrade() blocks with a clear error if any row has volunteer_id
  IS NOT NULL on either table. Operator must run the Phase 112
  invite-acceptance backfill (or DELETE the pre-signup rows manually)
  before downgrade can proceed. No silent data loss (D-13).
- When zero volunteer_id rows exist, downgrade restores:
    * session_callers.user_id NOT NULL
    * uq_session_caller (session_id, user_id) UniqueConstraint
    * walk_list_canvassers composite PK (walk_list_id, user_id)
    * Drops surrogate id, volunteer_id, CHECK, partial indexes on
      both tables.

Cross-identity uniqueness (preventing the same person from appearing
once as user_id AND once as volunteer_id on the same session) is NOT
enforced here -- it's deferred to Phase 112's accept_invite backfill
which uses ON CONFLICT DO NOTHING + DELETE (D-16).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "042_dual_identity_assignment_schema"
down_revision: str = "041_volunteer_user_reconciliation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ============================================================
    # session_callers
    # ============================================================

    # 1. Drop the existing UniqueConstraint -- it conflicts with the
    #    nullable user_id and will be replaced by a partial unique index.
    op.execute(
        "ALTER TABLE session_callers DROP CONSTRAINT IF EXISTS uq_session_caller"
    )

    # 2. Drop NOT NULL on user_id.
    op.alter_column("session_callers", "user_id", nullable=True)

    # 3. Add nullable volunteer_id FK.
    op.add_column(
        "session_callers",
        sa.Column(
            "volunteer_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("volunteers.id"),
            nullable=True,
        ),
    )

    # 4. Add the exactly-one-identity CHECK constraint.
    op.execute(
        """
        ALTER TABLE session_callers
        ADD CONSTRAINT ck_session_callers_exactly_one_identity
        CHECK (num_nonnulls(user_id, volunteer_id) = 1)
        """
    )

    # 5. Two partial unique indexes recover per-identity uniqueness.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_session_callers_session_user
        ON session_callers (session_id, user_id)
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_session_callers_session_volunteer
        ON session_callers (session_id, volunteer_id)
        WHERE volunteer_id IS NOT NULL
        """
    )

    # ============================================================
    # walk_list_canvassers (more invasive -- composite PK rework)
    # ============================================================

    # 1. Add a temporary surrogate id column. We'll promote it to PK
    #    after dropping the composite PK.
    op.execute(
        """
        ALTER TABLE walk_list_canvassers
        ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()
        """
    )
    # Backfill: every row gets a fresh uuid (DEFAULT only applies to
    # new inserts, but existing rows may have been created before the
    # ADD COLUMN -- belt-and-suspenders here).
    op.execute(
        """
        UPDATE walk_list_canvassers
        SET id = gen_random_uuid()
        WHERE id IS NULL
        """
    )
    op.execute("ALTER TABLE walk_list_canvassers ALTER COLUMN id SET NOT NULL")

    # 2. Drop the existing composite PK and promote id.
    op.execute(
        "ALTER TABLE walk_list_canvassers "
        "DROP CONSTRAINT IF EXISTS walk_list_canvassers_pkey"
    )
    op.create_primary_key(
        "walk_list_canvassers_pkey",
        "walk_list_canvassers",
        ["id"],
    )

    # 3. Drop NOT NULL on user_id.
    op.alter_column("walk_list_canvassers", "user_id", nullable=True)

    # 4. Add nullable volunteer_id FK.
    op.add_column(
        "walk_list_canvassers",
        sa.Column(
            "volunteer_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("volunteers.id"),
            nullable=True,
        ),
    )

    # 5. CHECK constraint.
    op.execute(
        """
        ALTER TABLE walk_list_canvassers
        ADD CONSTRAINT ck_walk_list_canvassers_exactly_one_identity
        CHECK (num_nonnulls(user_id, volunteer_id) = 1)
        """
    )

    # 6. Two partial unique indexes.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_walk_list_canvassers_list_user
        ON walk_list_canvassers (walk_list_id, user_id)
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_walk_list_canvassers_list_volunteer
        ON walk_list_canvassers (walk_list_id, volunteer_id)
        WHERE volunteer_id IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()

    # Guard: refuse to downgrade if any pre-signup volunteer rows exist.
    # Operators must run the Phase 112 backfill (which converts
    # volunteer_id -> user_id on accept) or DELETE the pre-signup rows
    # before this downgrade can proceed (D-13).
    sc_count = bind.execute(
        sa.text("SELECT COUNT(*) FROM session_callers WHERE volunteer_id IS NOT NULL")
    ).scalar_one()
    wlc_count = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM walk_list_canvassers WHERE volunteer_id IS NOT NULL"
        )
    ).scalar_one()
    if sc_count or wlc_count:
        raise RuntimeError(
            f"Refusing to downgrade 042_dual_identity_assignment_schema: "
            f"{sc_count} session_callers rows and {wlc_count} "
            f"walk_list_canvassers rows still have volunteer_id set. "
            f"Run the Phase 112 invite-acceptance backfill OR delete "
            f"these rows manually before retrying the downgrade."
        )

    # ============================================================
    # walk_list_canvassers downgrade
    # ============================================================
    op.execute("DROP INDEX IF EXISTS uq_walk_list_canvassers_list_volunteer")
    op.execute("DROP INDEX IF EXISTS uq_walk_list_canvassers_list_user")
    op.execute(
        "ALTER TABLE walk_list_canvassers "
        "DROP CONSTRAINT IF EXISTS ck_walk_list_canvassers_exactly_one_identity"
    )
    op.execute("ALTER TABLE walk_list_canvassers DROP COLUMN IF EXISTS volunteer_id")
    # Restore NOT NULL on user_id (safe -- guard above proved no NULLs
    # via volunteer_id rows; remaining rows must have user_id set thanks
    # to the CHECK we just dropped).
    op.alter_column("walk_list_canvassers", "user_id", nullable=False)
    # Restore the composite PK.
    op.execute(
        "ALTER TABLE walk_list_canvassers "
        "DROP CONSTRAINT IF EXISTS walk_list_canvassers_pkey"
    )
    op.create_primary_key(
        "walk_list_canvassers_pkey",
        "walk_list_canvassers",
        ["walk_list_id", "user_id"],
    )
    op.execute("ALTER TABLE walk_list_canvassers DROP COLUMN IF EXISTS id")

    # ============================================================
    # session_callers downgrade
    # ============================================================
    op.execute("DROP INDEX IF EXISTS uq_session_callers_session_volunteer")
    op.execute("DROP INDEX IF EXISTS uq_session_callers_session_user")
    op.execute(
        "ALTER TABLE session_callers "
        "DROP CONSTRAINT IF EXISTS ck_session_callers_exactly_one_identity"
    )
    op.execute("ALTER TABLE session_callers DROP COLUMN IF EXISTS volunteer_id")
    op.alter_column("session_callers", "user_id", nullable=False)
    op.create_unique_constraint(
        "uq_session_caller",
        "session_callers",
        ["session_id", "user_id"],
    )
