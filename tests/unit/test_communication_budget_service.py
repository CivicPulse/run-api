"""Unit tests for communication budget service helpers."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.communication_budget import CommunicationBudgetService


def _make_org(*, soft_budget_cents: int | None = 5000, warning_percent: int = 80):
    return SimpleNamespace(
        id=uuid.uuid4(),
        twilio_soft_budget_cents=soft_budget_cents,
        twilio_budget_warning_percent=warning_percent,
        twilio_budget_updated_at=None,
    )


@pytest.mark.asyncio
async def test_evaluate_gate_returns_near_limit_when_threshold_crossed():
    service = CommunicationBudgetService()
    db = AsyncMock()
    result = MagicMock()
    result.one.return_value = SimpleNamespace(
        finalized_spend_cents=3900,
        pending_spend_cents=0,
        pending_item_count=0,
        updated_at=None,
    )
    db.execute.return_value = result

    decision = await service.evaluate_gate(
        db, _make_org(), estimated_additional_cents=200
    )

    assert decision.allowed is True
    assert decision.state == "near_limit"
    assert decision.reason_code == "budget_near_limit"


@pytest.mark.asyncio
async def test_evaluate_gate_blocks_when_over_limit():
    service = CommunicationBudgetService()
    db = AsyncMock()
    result = MagicMock()
    result.one.return_value = SimpleNamespace(
        finalized_spend_cents=5100,
        pending_spend_cents=0,
        pending_item_count=0,
        updated_at=None,
    )
    db.execute.return_value = result

    decision = await service.evaluate_gate(db, _make_org())

    assert decision.allowed is False
    assert decision.state == "over_limit"
    assert decision.reason_code == "budget_over_limit"


@pytest.mark.asyncio
async def test_record_event_adds_ledger_row():
    service = CommunicationBudgetService()
    db = AsyncMock()

    row = await service.record_event(
        db,
        org_id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        channel="sms",
        event_type="sms.message",
        provider_sid="SM123",
        provider_status="queued",
        pending_cost=True,
        metadata_json={"message": "hello"},
    )

    assert row.provider_sid == "SM123"
    assert row.channel == "sms"
    db.flush.assert_awaited_once()
