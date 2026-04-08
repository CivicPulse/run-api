"""Tests for SMS models, schemas, and registration."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime


def test_sms_conversation_model_has_required_columns():
    from app.models.sms_conversation import SMSConversation

    cols = [c.name for c in SMSConversation.__table__.columns]
    for name in [
        "id",
        "campaign_id",
        "org_id",
        "voter_id",
        "org_phone_number_id",
        "voter_phone_id",
        "normalized_to_number",
        "last_message_preview",
        "last_message_direction",
        "last_message_status",
        "last_message_at",
        "unread_count",
        "opt_out_status",
        "opted_out_at",
        "opt_out_source",
        "created_at",
        "updated_at",
    ]:
        assert name in cols


def test_sms_message_model_has_required_columns():
    from app.models.sms_message import SMSMessage

    cols = [c.name for c in SMSMessage.__table__.columns]
    for name in [
        "id",
        "campaign_id",
        "conversation_id",
        "direction",
        "body",
        "message_type",
        "provider_status",
        "twilio_message_sid",
        "from_number",
        "to_number",
        "error_code",
        "error_message",
        "sent_by_user_id",
        "queued_job_id",
        "delivered_at",
        "read_at",
        "created_at",
    ]:
        assert name in cols


def test_sms_opt_out_model_has_required_columns():
    from app.models.sms_opt_out import SMSOptOut

    cols = [c.name for c in SMSOptOut.__table__.columns]
    for name in [
        "id",
        "org_id",
        "normalized_phone_number",
        "status",
        "source",
        "keyword",
        "updated_by_message_sid",
        "updated_at",
    ]:
        assert name in cols


def test_voter_phone_has_sms_eligibility_columns():
    from app.models.voter_contact import VoterPhone

    cols = VoterPhone.__table__.columns
    assert "sms_allowed" in cols
    assert "sms_consent_source" in cols


def test_sms_schemas_round_trip():
    from app.schemas.sms import (
        SMSBulkSendResponse,
        SMSComposeRequest,
        SMSConversationDetail,
        SMSConversationRead,
        SMSEligibilityResponse,
        SMSMessageRead,
    )

    now = datetime.now(UTC)
    conversation = SMSConversationRead(
        id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        voter_phone_id=uuid.uuid4(),
        org_phone_number_id=uuid.uuid4(),
        normalized_to_number="+15555550123",
        last_message_preview="hello",
        last_message_direction="outbound",
        last_message_status="sent",
        last_message_at=now,
        unread_count=0,
        opt_out_status="active",
    )
    message = SMSMessageRead(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        direction="outbound",
        body="hello",
        message_type="text",
        provider_status="sent",
        twilio_message_sid="SM123",
        from_number="+15550000001",
        to_number="+15555550123",
        created_at=now,
    )
    eligibility = SMSEligibilityResponse(
        allowed=True,
        voter_phone_id=conversation.voter_phone_id,
        normalized_phone_number=conversation.normalized_to_number,
    )
    detail = SMSConversationDetail(
        conversation=conversation,
        messages=[message],
        eligibility=eligibility,
    )
    bulk = SMSBulkSendResponse(job_id="job-1", queued_count=3, blocked_count=1)
    compose = SMSComposeRequest(
        voter_id=uuid.uuid4(),
        voter_phone_id=uuid.uuid4(),
        body="test",
    )

    assert detail.messages[0].twilio_message_sid == "SM123"
    assert bulk.queued_count == 3
    assert compose.body == "test"


def test_sms_models_importable_from_app_models():
    from app.models import SMSConversation, SMSMessage, SMSOptOut

    assert SMSConversation.__tablename__ == "sms_conversations"
    assert SMSMessage.__tablename__ == "sms_messages"
    assert SMSOptOut.__tablename__ == "sms_opt_outs"
