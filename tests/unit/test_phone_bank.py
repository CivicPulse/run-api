"""Unit tests for phone bank sessions, calling, and supervisor ops -- PHONE-02 to PHONE-05."""

from __future__ import annotations

import pytest


class TestPhoneBankSession:
    """Tests for session creation and lifecycle."""

    @pytest.mark.skip(reason="stub")
    def test_create_session(self) -> None:
        """Session creation with call list reference."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_session_status_lifecycle(self) -> None:
        """Session lifecycle: draft -> active -> paused -> completed."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_session_with_script(self) -> None:
        """PHONE-02: session's call list has script attached, questions retrievable."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_session_pause_blocks_claims(self) -> None:
        """Paused session prevents new claims."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_session_complete_releases_entries(self) -> None:
        """Completing session releases all in_progress entries."""
        raise NotImplementedError


class TestCallerManagement:
    """Tests for caller assignment and check-in/out."""

    @pytest.mark.skip(reason="stub")
    def test_assign_caller(self) -> None:
        """Assign caller to session."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_caller_check_in_check_out(self) -> None:
        """check_in_at/check_out_at timestamps."""
        raise NotImplementedError


class TestCallRecording:
    """Tests for recording call outcomes."""

    @pytest.mark.skip(reason="stub")
    def test_record_call_answered(self) -> None:
        """PHONE-03: record answered outcome with timestamps."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_record_call_no_answer(self) -> None:
        """PHONE-03: no_answer outcome, entry recycled."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_record_call_with_survey(self) -> None:
        """PHONE-04: answered call + survey responses recorded."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_partial_survey_saved(self) -> None:
        """PHONE-04: partial survey marked incomplete."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_wrong_number_marks_phone_only(self) -> None:
        """PHONE-03: wrong_number marks phone, not person."""
        raise NotImplementedError


class TestInteractionEvents:
    """Tests for interaction event emission."""

    @pytest.mark.skip(reason="stub")
    def test_interaction_events_created(self) -> None:
        """PHONE-05: PHONE_CALL interaction event emitted."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_survey_response_interaction(self) -> None:
        """PHONE-05: SURVEY_RESPONSE interaction event emitted."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_refused_auto_dnc(self) -> None:
        """PHONE-05: refused outcome auto-adds to DNC."""
        raise NotImplementedError


class TestSupervisorOps:
    """Tests for supervisor session management."""

    @pytest.mark.skip(reason="stub")
    def test_session_progress(self) -> None:
        """Supervisor progress view with per-caller stats."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_reassign_entry(self) -> None:
        """Supervisor reassign entry between callers."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_force_release_entry(self) -> None:
        """Supervisor force-release claimed entry."""
        raise NotImplementedError
