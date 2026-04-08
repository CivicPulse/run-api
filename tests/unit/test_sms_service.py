"""Unit tests for SMSService foundation helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _phone(*, allowed: bool = True, type_: str = "cell"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        value="+15555550123",
        type=type_,
        sms_allowed=allowed,
    )


def _sender(*, capable: bool = True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        sms_capable=capable,
        phone_number="+15550000001",
    )


def _conversation():
    now = datetime.now(UTC).replace(tzinfo=None)
    return SimpleNamespace(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        voter_phone_id=uuid.uuid4(),
        org_phone_number_id=uuid.uuid4(),
        normalized_to_number="+15555550123",
        unread_count=0,
        opt_out_status="active",
        opted_out_at=None,
        opt_out_source=None,
        last_message_preview=None,
        last_message_direction="outbound",
        last_message_status="queued",
        last_message_at=None,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_check_eligibility_allows_sms_eligible_phone():
    from app.services.sms import SMSService

    svc = SMSService()
    phone = _phone(allowed=True)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[phone, None])
    svc._phone_validation.get_validation_summary = AsyncMock(
        return_value=SimpleNamespace(
            normalized_phone_number="+15555550123",
            status="validated",
            sms_capable=True,
            is_stale=False,
            reason_detail=None,
        )
    )

    result = await svc.check_eligibility(
        db,
        campaign_id=phone.campaign_id,
        voter_phone_id=phone.id,
    )

    assert result.allowed is True
    assert result.reason_code is None


@pytest.mark.asyncio
async def test_check_eligibility_blocks_opted_out_phone():
    from app.services.sms import SMSService

    svc = SMSService()
    phone = _phone(allowed=True)
    opt_out = SimpleNamespace(status="opted_out")
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[phone, opt_out])
    svc._phone_validation.get_validation_summary = AsyncMock(
        return_value=SimpleNamespace(
            normalized_phone_number="+15555550123",
            status="validated",
            sms_capable=True,
            is_stale=False,
            reason_detail=None,
        )
    )

    result = await svc.check_eligibility(
        db,
        campaign_id=phone.campaign_id,
        voter_phone_id=phone.id,
    )

    assert result.allowed is False
    assert result.reason_code == "opted_out"


@pytest.mark.asyncio
async def test_check_eligibility_blocks_missing_consent():
    from app.services.sms import SMSService

    svc = SMSService()
    phone = _phone(allowed=False)
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=phone)

    result = await svc.check_eligibility(
        db,
        campaign_id=phone.campaign_id,
        voter_phone_id=phone.id,
    )

    assert result.allowed is False
    assert result.reason_code == "missing_sms_consent"


@pytest.mark.asyncio
async def test_check_eligibility_blocks_landline_lookup():
    from app.services.sms import SMSService

    svc = SMSService()
    phone = _phone(allowed=True)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[phone, None])
    svc._phone_validation.get_validation_summary = AsyncMock(
        return_value=SimpleNamespace(
            normalized_phone_number="+15555550123",
            status="landline",
            sms_capable=False,
            is_stale=False,
            reason_detail="Twilio Lookup classifies this number as a landline.",
        )
    )

    result = await svc.check_eligibility(
        db,
        campaign_id=phone.campaign_id,
        voter_phone_id=phone.id,
    )

    assert result.allowed is False
    assert result.reason_code == "phone_not_sms_safe"


@pytest.mark.asyncio
async def test_check_eligibility_blocks_stale_validation():
    from app.services.sms import SMSService

    svc = SMSService()
    phone = _phone(allowed=True)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[phone, None])
    svc._phone_validation.get_validation_summary = AsyncMock(
        return_value=SimpleNamespace(
            normalized_phone_number="+15555550123",
            status="validated",
            sms_capable=True,
            is_stale=True,
            reason_detail="Cached validation is getting old.",
        )
    )

    result = await svc.check_eligibility(
        db,
        campaign_id=phone.campaign_id,
        voter_phone_id=phone.id,
    )

    assert result.allowed is False
    assert result.reason_code == "phone_validation_stale"


@pytest.mark.asyncio
async def test_resolve_default_sender_returns_sender():
    from app.services.sms import SMSService

    svc = SMSService()
    sender = _sender(capable=True)
    org = SimpleNamespace(default_sms_number_id=sender.id)
    db = AsyncMock()
    db.get = AsyncMock(return_value=sender)

    resolved = await svc.resolve_default_sender(db, org)

    assert resolved.phone_number == "+15550000001"


@pytest.mark.asyncio
async def test_get_or_create_conversation_creates_new_row():
    from app.services.sms import SMSService

    svc = SMSService()
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    conversation = await svc.get_or_create_conversation(
        db,
        campaign_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        voter_phone_id=uuid.uuid4(),
        org_phone_number_id=uuid.uuid4(),
        normalized_to_number="+15555550123",
    )

    assert conversation.normalized_to_number == "+15555550123"
    db.add.assert_called_once()
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_record_message_updates_conversation_summary():
    from app.services.sms import SMSService

    svc = SMSService()
    db = AsyncMock()
    db.add = MagicMock()
    conversation = _conversation()

    message = await svc.record_message(
        db,
        conversation=conversation,
        direction="inbound",
        body="Reply body",
        from_number="+15555550123",
        to_number="+15550000001",
        provider_status="received",
    )

    assert message.direction == "inbound"
    assert conversation.last_message_preview == "Reply body"
    assert conversation.unread_count == 1
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_apply_opt_out_keyword_sets_opted_out():
    from app.services.sms import SMSService

    svc = SMSService()
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    opt_out = await svc.apply_opt_out_keyword(
        db,
        org_id=uuid.uuid4(),
        normalized_phone_number="+15555550123",
        keyword="STOP",
        message_sid="SM123",
    )

    assert opt_out.status == "opted_out"
    assert opt_out.keyword == "STOP"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_process_inbound_message_creates_conversation_when_no_thread_exists():
    from app.services.sms import SMSService, SMSServiceError

    svc = SMSService()
    conversation = _conversation()
    sender = _sender()
    voter_phone = _phone()
    voter_phone.campaign_id = conversation.campaign_id
    message = SimpleNamespace(id=uuid.uuid4())
    org = SimpleNamespace(id=uuid.uuid4())

    db = AsyncMock()

    with (
        patch.object(
            svc,
            "find_inbound_conversation",
            new_callable=AsyncMock,
            side_effect=SMSServiceError("missing"),
        ),
        patch.object(
            svc,
            "get_org_phone_number",
            new_callable=AsyncMock,
            return_value=sender,
        ),
        patch.object(
            svc,
            "find_voter_phone_for_org",
            new_callable=AsyncMock,
            return_value=voter_phone,
        ),
        patch.object(
            svc,
            "get_or_create_conversation",
            new_callable=AsyncMock,
            return_value=conversation,
        ) as get_or_create,
        patch.object(
            svc,
            "record_message",
            new_callable=AsyncMock,
            return_value=message,
        ),
    ):
        result = await svc.process_inbound_message(
            db,
            org,
            from_number="+1 (555) 555-0123",
            to_number=sender.phone_number,
            body="Hello there",
            message_sid="SM999",
        )

    assert result == (conversation, message)
    get_or_create.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_inbound_message_updates_opt_out_for_stop_keywords():
    from app.services.sms import SMSService

    svc = SMSService()
    conversation = _conversation()
    sender = _sender()
    message = SimpleNamespace(id=uuid.uuid4())
    org = SimpleNamespace(id=uuid.uuid4())
    db = AsyncMock()

    with (
        patch.object(
            svc,
            "find_inbound_conversation",
            new_callable=AsyncMock,
            return_value=(conversation, sender),
        ),
        patch.object(
            svc,
            "apply_opt_out_keyword",
            new_callable=AsyncMock,
        ) as apply_opt_out,
        patch.object(
            svc,
            "sync_conversation_opt_out",
            new_callable=AsyncMock,
            return_value=conversation,
        ) as sync_opt_out,
        patch.object(
            svc,
            "record_message",
            new_callable=AsyncMock,
            return_value=message,
        ),
    ):
        await svc.process_inbound_message(
            db,
            org,
            from_number="+15555550123",
            to_number=sender.phone_number,
            body="STOPALL",
            message_sid="SMSTOP",
        )

    apply_opt_out.assert_awaited_once()
    sync_opt_out.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_delivery_status_updates_message_and_conversation():
    from app.services.sms import SMSService

    svc = SMSService()
    conversation = _conversation()
    message = SimpleNamespace(
        twilio_message_sid="SM123",
        provider_status="queued",
        error_code=None,
        error_message=None,
        delivered_at=None,
        conversation_id=conversation.id,
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=message)
    db.get = AsyncMock(return_value=conversation)

    updated = await svc.update_delivery_status(
        db,
        twilio_message_sid="SM123",
        provider_status="delivered",
    )

    assert updated.provider_status == "delivered"
    assert conversation.last_message_status == "delivered"
    assert updated.delivered_at is not None
