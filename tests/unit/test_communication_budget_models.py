"""Unit tests for communication budget model shape."""

from __future__ import annotations

import uuid

from app.models.communication_ledger import CommunicationLedger


def test_communication_ledger_tracks_core_fields():
    row = CommunicationLedger(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        voter_id=uuid.uuid4(),
        channel="voice",
        event_type="voice.call",
        provider_sid="CA123",
        provider_status="initiated",
        pending_cost=True,
    )

    assert row.pending_cost is True
    assert row.channel == "voice"
    assert row.provider_sid == "CA123"
