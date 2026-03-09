"""Unit tests for call list generation, claiming, and lifecycle -- PHONE-01, PHONE-03."""

from __future__ import annotations

import pytest


class TestCallListGeneration:
    """Tests for call list generation from voter universes."""

    @pytest.mark.skip(reason="stub")
    def test_generate_call_list_from_voter_list(self) -> None:
        """PHONE-01: generates frozen snapshot from voter universe, filters by phone + DNC."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_generate_call_list_phone_validation(self) -> None:
        """PHONE-01: filters out invalid phone numbers."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_generate_call_list_dnc_filtering(self) -> None:
        """PHONE-01: excludes DNC numbers."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_multi_phone_entry(self) -> None:
        """PHONE-01: entry includes all voter phone numbers ordered by priority."""
        raise NotImplementedError


class TestCallListClaiming:
    """Tests for claim-on-fetch entry distribution."""

    @pytest.mark.skip(reason="stub")
    def test_claim_entries_returns_batch(self) -> None:
        """PHONE-01: claim-on-fetch returns correct batch size ordered by priority."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_claim_entries_skip_locked(self) -> None:
        """PHONE-01: concurrent claims don't get same entries."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_release_stale_claims(self) -> None:
        """PHONE-01: stale entries released on next claim."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_priority_score_ordering(self) -> None:
        """PHONE-01: entries returned in descending priority order."""
        raise NotImplementedError


class TestCallListEntryStatus:
    """Tests for entry status transitions and recycling."""

    @pytest.mark.skip(reason="stub")
    def test_entry_status_transitions(self) -> None:
        """PHONE-03: available -> in_progress -> completed/terminal/max_attempts."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_auto_recycle_no_answer(self) -> None:
        """PHONE-01: no_answer entries return to pool after cooldown."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_terminal_outcome_never_retried(self) -> None:
        """PHONE-03: refused/deceased entries never return to pool."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_call_list_status_lifecycle(self) -> None:
        """Call list lifecycle: draft -> active -> completed, no backward."""
        raise NotImplementedError
