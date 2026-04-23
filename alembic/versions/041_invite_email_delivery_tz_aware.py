"""Make invites.email_delivery_{queued,sent}_at timezone-aware.

Revision ID: 041_invite_email_delivery_tz_aware
Revises: 040_door_knock_client_uuid
Create Date: 2026-04-23

Migration 036 added ``email_delivery_queued_at`` and ``email_delivery_sent_at``
as ``timestamp without time zone``; migration 037 then added
``email_delivery_last_event_at`` as ``timestamp with time zone``. The two older
columns are the only naive timestamps left in the email-delivery audit chain,
which forced ad-hoc tz-stripping in the webhook reconciliation path.

This migration converts both columns to ``timestamp with time zone``, treating
existing values as UTC (which they are by codebase convention -- all timestamps
are produced via ``app.core.time.utcnow()``). The conversion is reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "041_invite_email_delivery_tz_aware"
down_revision: str = "040_door_knock_client_uuid"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "invites",
        "email_delivery_queued_at",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.DateTime(timezone=False),
        existing_nullable=True,
        postgresql_using="email_delivery_queued_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "invites",
        "email_delivery_sent_at",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.DateTime(timezone=False),
        existing_nullable=True,
        postgresql_using="email_delivery_sent_at AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        "invites",
        "email_delivery_sent_at",
        type_=sa.DateTime(timezone=False),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="email_delivery_sent_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "invites",
        "email_delivery_queued_at",
        type_=sa.DateTime(timezone=False),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="email_delivery_queued_at AT TIME ZONE 'UTC'",
    )
