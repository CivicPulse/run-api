"""Reconcile dual-row volunteers to their users.

Revision ID: 041_volunteer_user_reconciliation
Revises: 040_door_knock_client_uuid
Create Date: 2026-04-14

Phase 111 / MIGRATE-01: One-time, idempotent data migration that links
existing ``volunteers`` rows to ``users`` rows for the Julia Callahan
pattern -- same human present as both a ``volunteers`` row (with email,
no ``user_id``) and a ``campaign_members`` row in the same campaign,
matched on case-insensitive email.

This migration:
- Updates ONLY ``volunteers`` rows where ``user_id IS NULL`` (idempotent)
- Matches by ``LOWER(TRIM(volunteers.email)) = LOWER(TRIM(users.email))``
- Requires the matched user to be a ``campaign_members`` row in the same
  campaign as the volunteer (multi-tenant isolation, D-02)
- Leaves ambiguous rows (multiple matching users) UNTOUCHED and
  surfaces them in a JSONL artifact at ``/tmp/reconciliation-041.jsonl``
  inside the API container (retrieve via
  ``docker compose cp api:/tmp/reconciliation-041.jsonl ./``)
- Prints aggregate ``linked / ambiguous / unchanged`` counts to stdout
  so they appear in the alembic upgrade output stream

Idempotency: re-running produces ``linked = 0``; previously-linked rows
are counted as ``unchanged``.

Downgrade: this is a pure data migration. Downgrade is a no-op (the
``volunteers.user_id`` column existed before this revision and exists
after; we only populate it). To "undo" the link manually, an operator
can run ``UPDATE volunteers SET user_id = NULL WHERE id IN (...)`` using
the JSONL artifact as a worklist -- but this is an explicit operator
action, not an automatic downgrade behavior.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.services.volunteer_reconciliation import reconcile_volunteers

revision: str = "041_volunteer_user_reconciliation"
down_revision: str = "040_door_knock_client_uuid"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    report = reconcile_volunteers(bind)
    print(report.summary_line())
    if report.ambiguous_details:
        print(
            f"[reconcile_volunteers] {report.ambiguous} ambiguous rows "
            f"written to /tmp/reconciliation-041.jsonl -- review with "
            f"`docker compose cp api:/tmp/reconciliation-041.jsonl ./`"
        )


def downgrade() -> None:
    # Pure data migration -- no schema to revert. The volunteers.user_id
    # column existed before and after this revision. To roll back the
    # link assignments, use the JSONL artifact as an operator worklist.
    print(
        "[041_volunteer_user_reconciliation] downgrade is a no-op "
        "(pure data migration). To revert link assignments, use the "
        "/tmp/reconciliation-041.jsonl worklist manually."
    )


_ = sa  # ruff -- sa import is conventional even when unused
