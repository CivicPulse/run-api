"""Data integrity: indexes + unique constraints + partial unique invite index.

Revision ID: 027_data_integrity
Revises: 026_rls_hardening
Create Date: 2026-04-04

Closes DATA-04 (voter_interactions composite indexes),
DATA-05 (pending-invite partial unique index),
DATA-06 (VoterEmail uniqueness),
DATA-07 (VolunteerTag uniqueness), and
DATA-08 (single atomic migration) from phase 74.

Backfills: deletes duplicate rows (keeping lowest id) in voter_emails and
volunteer_tags before creating new unique constraints. Dev DB only -- no
production data at risk.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "027_data_integrity"
down_revision: str = "026_rls_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- DATA-04: voter_interactions composite indexes (C12) ---
    op.create_index(
        "ix_voter_interactions_campaign_voter",
        "voter_interactions",
        ["campaign_id", "voter_id"],
    )
    op.create_index(
        "ix_voter_interactions_campaign_created",
        "voter_interactions",
        ["campaign_id", "created_at"],
    )

    # --- DATA-06: VoterEmail uniqueness (H18) ---
    # Backfill: remove duplicates keeping lowest-id row per (campaign, voter, value)
    op.execute(
        """
        DELETE FROM voter_emails a USING voter_emails b
        WHERE a.id > b.id
          AND a.campaign_id = b.campaign_id
          AND a.voter_id = b.voter_id
          AND a.value = b.value
        """
    )
    op.create_unique_constraint(
        "uq_voter_email_campaign_voter_value",
        "voter_emails",
        ["campaign_id", "voter_id", "value"],
    )

    # --- DATA-07: VolunteerTag uniqueness (H19) ---
    op.execute(
        """
        DELETE FROM volunteer_tags a USING volunteer_tags b
        WHERE a.id > b.id
          AND a.campaign_id = b.campaign_id
          AND a.name = b.name
        """
    )
    op.create_unique_constraint(
        "uq_volunteer_tag_campaign_name",
        "volunteer_tags",
        ["campaign_id", "name"],
    )

    # --- DATA-05: Invite partial unique index (C13) ---
    # Drop the unconditional UQ and replace with a partial unique index
    # that only constrains *pending* invites (not accepted/revoked).
    op.drop_constraint(
        "uq_pending_invite_email_campaign", "invites", type_="unique"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_pending_invite_email_campaign "
        "ON invites (email, campaign_id) "
        "WHERE accepted_at IS NULL AND revoked_at IS NULL"
    )


def downgrade() -> None:
    # --- DATA-05 reverse ---
    op.execute("DROP INDEX IF EXISTS uq_pending_invite_email_campaign")
    op.create_unique_constraint(
        "uq_pending_invite_email_campaign",
        "invites",
        ["email", "campaign_id"],
    )

    # --- DATA-07 reverse ---
    op.drop_constraint(
        "uq_volunteer_tag_campaign_name", "volunteer_tags", type_="unique"
    )

    # --- DATA-06 reverse ---
    op.drop_constraint(
        "uq_voter_email_campaign_voter_value", "voter_emails", type_="unique"
    )

    # --- DATA-04 reverse ---
    op.drop_index(
        "ix_voter_interactions_campaign_created",
        table_name="voter_interactions",
    )
    op.drop_index(
        "ix_voter_interactions_campaign_voter",
        table_name="voter_interactions",
    )
