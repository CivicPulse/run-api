"""Unit tests for campaign SMS API routes."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.rate_limit import limiter
from app.schemas.sms import (
    SMSBulkSendRequest,
    SMSComposeRequest,
    SMSConversationDetail,
    SMSConversationRead,
    SMSEligibilityResponse,
    SMSMessageRead,
    SMSSendResponse,
)

limiter.enabled = False

CAMPAIGN_ID = uuid.uuid4()
CONVERSATION_ID = uuid.uuid4()
USER_ID = "user-abc-123"


def _mock_request():
    req = MagicMock()
    req.client.host = "127.0.0.1"
    req.headers = {}
    req.state = MagicMock()
    return req


def _mock_user():
    return SimpleNamespace(
        id=USER_ID,
        org_id="org-zitadel-123",
        sub=USER_ID,
        role="volunteer",
        display_name="Test User",
        email="test@example.com",
    )


def _mock_campaign():
    return SimpleNamespace(id=CAMPAIGN_ID, organization_id=uuid.uuid4())


def _mock_org():
    return SimpleNamespace(id=uuid.uuid4(), default_sms_number_id=uuid.uuid4())


def _eligibility(*, allowed: bool = True):
    return SMSEligibilityResponse(
        allowed=allowed,
        reason_code=None if allowed else "opted_out",
        reason_detail=None if allowed else "This number has opted out of SMS outreach.",
        voter_phone_id=uuid.uuid4(),
        normalized_phone_number="+15555550123",
    )


def _conversation():
    return SMSConversationRead(
        id=CONVERSATION_ID,
        voter_id=uuid.uuid4(),
        voter_phone_id=uuid.uuid4(),
        org_phone_number_id=uuid.uuid4(),
        normalized_to_number="+15555550123",
        last_message_preview="hello",
        last_message_direction="outbound",
        last_message_status="sent",
        unread_count=0,
        opt_out_status="active",
    )


def _message():
    return SMSMessageRead(
        id=uuid.uuid4(),
        conversation_id=CONVERSATION_ID,
        direction="outbound",
        body="hello",
        message_type="text",
        provider_status="sent",
        twilio_message_sid="SM123",
        from_number="+15550000001",
        to_number="+15555550123",
        created_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_send_sms_returns_send_response():
    from app.api.v1.sms import send_sms

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _mock_org()
    convo = _conversation()
    msg = _message()
    eligibility = _eligibility(allowed=True)

    with (
        patch(
            "app.api.v1.sms._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.sms._sms_service.check_eligibility",
            new_callable=AsyncMock,
            return_value=eligibility,
        ),
        patch(
            "app.api.v1.sms._sms_service.send_single_sms",
            new_callable=AsyncMock,
            return_value=(convo, msg, eligibility),
        ),
    ):
        result = await send_sms(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            body=SMSComposeRequest(
                voter_id=uuid.uuid4(),
                voter_phone_id=uuid.uuid4(),
                body="hello",
            ),
            user=_mock_user(),
            db=mock_db,
        )

    assert isinstance(result, SMSSendResponse)
    assert result.message.twilio_message_sid == "SM123"
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_sms_raises_when_blocked():
    from app.api.v1.sms import send_sms

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _mock_org()
    blocked = _eligibility(allowed=False)

    with (
        patch(
            "app.api.v1.sms._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.sms._sms_service.check_eligibility",
            new_callable=AsyncMock,
            return_value=blocked,
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await send_sms(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            body=SMSComposeRequest(
                voter_id=uuid.uuid4(),
                voter_phone_id=uuid.uuid4(),
                body="hello",
            ),
            user=_mock_user(),
            db=mock_db,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["reason_code"] == "opted_out"


@pytest.mark.asyncio
async def test_bulk_send_returns_queued_payload():
    from app.api.v1.sms import bulk_send_sms

    mock_db = AsyncMock()
    mock_campaign = _mock_campaign()
    mock_org = _mock_org()
    phone_id = uuid.uuid4()
    phone = SimpleNamespace(voter_id=uuid.uuid4(), id=phone_id)

    with (
        patch(
            "app.api.v1.sms._resolve_campaign_org",
            new_callable=AsyncMock,
            return_value=(mock_campaign, mock_org),
        ),
        patch(
            "app.api.v1.sms._sms_service.check_eligibility",
            new_callable=AsyncMock,
            return_value=_eligibility(allowed=True),
        ),
        patch(
            "app.api.v1.sms._sms_service.get_voter_phone",
            new_callable=AsyncMock,
            return_value=phone,
        ),
        patch(
            "app.api.v1.sms.send_bulk_sms_batch.defer_async",
            new_callable=AsyncMock,
        ) as defer_mock,
    ):
        result = await bulk_send_sms(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            body=SMSBulkSendRequest(voter_phone_ids=[phone_id], body="bulk hello"),
            user=_mock_user(),
            db=mock_db,
        )

    assert result.queued_count == 1
    assert result.blocked_count == 0
    defer_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_conversations_returns_rows():
    from app.api.v1.sms import list_sms_conversations

    mock_db = AsyncMock()
    convo = _conversation()

    with patch(
        "app.api.v1.sms._sms_service.list_conversations",
        new_callable=AsyncMock,
        return_value=[convo],
    ):
        result = await list_sms_conversations(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            user=_mock_user(),
            db=mock_db,
        )

    assert len(result) == 1
    assert result[0].id == CONVERSATION_ID


@pytest.mark.asyncio
async def test_get_conversation_returns_detail():
    from app.api.v1.sms import get_sms_conversation

    mock_db = AsyncMock()
    convo = _conversation()
    msg = _message()
    eligibility = _eligibility(allowed=True)

    with patch(
        "app.api.v1.sms._sms_service.get_conversation_detail",
        new_callable=AsyncMock,
        return_value=(convo, [msg], eligibility),
    ):
        result = await get_sms_conversation(
            request=_mock_request(),
            campaign_id=CAMPAIGN_ID,
            conversation_id=CONVERSATION_ID,
            user=_mock_user(),
            db=mock_db,
        )

    assert isinstance(result, SMSConversationDetail)
    assert len(result.messages) == 1
    assert result.conversation.id == CONVERSATION_ID
