"""Add SMS conversation, message, and opt-out foundation.

Revision ID: 033_sms_domain_foundation
Revises: 032_call_records_and_voice_config
Create Date: 2026-04-07 23:45:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "033_sms_domain_foundation"
down_revision = "032_call_records_and_voice_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voter_phones",
        sa.Column(
            "sms_allowed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "voter_phones",
        sa.Column("sms_consent_source", sa.String(50), nullable=True),
    )

    op.create_table(
        "sms_conversations",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "voter_id",
            sa.Uuid(),
            sa.ForeignKey("voters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_phone_number_id",
            sa.Uuid(),
            sa.ForeignKey("org_phone_numbers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "voter_phone_id",
            sa.Uuid(),
            sa.ForeignKey("voter_phones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("normalized_to_number", sa.String(20), nullable=False),
        sa.Column("last_message_preview", sa.Text(), nullable=True),
        sa.Column(
            "last_message_direction",
            sa.String(20),
            nullable=False,
            server_default="outbound",
        ),
        sa.Column(
            "last_message_status",
            sa.String(20),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "unread_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "opt_out_status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("opted_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opt_out_source", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "campaign_id",
            "voter_id",
            "org_phone_number_id",
            name="uq_sms_conversation_campaign_voter_sender",
        ),
    )
    op.create_index(
        "ix_sms_conversations_campaign_last_message",
        "sms_conversations",
        ["campaign_id", "last_message_at"],
    )
    op.create_index(
        "ix_sms_conversations_campaign_unread",
        "sms_conversations",
        ["campaign_id", "unread_count"],
    )

    op.create_table(
        "sms_messages",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            sa.Uuid(),
            sa.ForeignKey("sms_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "message_type",
            sa.String(20),
            nullable=False,
            server_default="text",
        ),
        sa.Column(
            "provider_status",
            sa.String(20),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("twilio_message_sid", sa.String(64), nullable=True),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("error_code", sa.String(20), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "sent_by_user_id",
            sa.String(255),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("queued_job_id", sa.String(64), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_sms_messages_twilio_sid "
        "ON sms_messages (twilio_message_sid) "
        "WHERE twilio_message_sid IS NOT NULL"
    )
    op.create_index(
        "ix_sms_messages_conversation_created",
        "sms_messages",
        ["conversation_id", "created_at"],
    )

    op.create_table(
        "sms_opt_outs",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("normalized_phone_number", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("keyword", sa.String(20), nullable=True),
        sa.Column("updated_by_message_sid", sa.String(64), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "org_id",
            "normalized_phone_number",
            name="uq_sms_opt_out_org_phone",
        ),
    )

    op.execute("ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sms_conversations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY sms_conversations_isolation ON sms_conversations "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON sms_conversations TO app_user")

    op.execute("ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sms_messages FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY sms_messages_isolation ON sms_messages "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON sms_messages TO app_user")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS sms_messages_isolation ON sms_messages")
    op.execute("DROP POLICY IF EXISTS sms_conversations_isolation ON sms_conversations")
    op.drop_table("sms_opt_outs")
    op.drop_index(
        "ix_sms_messages_conversation_created",
        table_name="sms_messages",
    )
    op.execute("DROP INDEX IF EXISTS ix_sms_messages_twilio_sid")
    op.drop_table("sms_messages")
    op.drop_index(
        "ix_sms_conversations_campaign_unread",
        table_name="sms_conversations",
    )
    op.drop_index(
        "ix_sms_conversations_campaign_last_message",
        table_name="sms_conversations",
    )
    op.drop_table("sms_conversations")
    op.drop_column("voter_phones", "sms_consent_source")
    op.drop_column("voter_phones", "sms_allowed")
