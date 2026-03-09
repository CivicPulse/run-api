"""Unit tests for survey scripts, questions, and responses -- CANV-07, CANV-08."""

from __future__ import annotations

import pytest


class TestSurveyService:
    """Tests for survey script lifecycle, question CRUD, type validation, and response recording."""

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_create_survey_script(self) -> None:
        """CANV-07: Create script in draft status."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_script_lifecycle_transitions(self) -> None:
        """CANV-07: draft->active->archived only."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_question_crud_draft_only(self) -> None:
        """CANV-07: Questions editable only in draft."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_question_type_validation(self) -> None:
        """CANV-07: MC options, scale range validated."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_survey_responses(self) -> None:
        """CANV-08: Record response with type validation."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_batch_responses_emit_interaction(self) -> None:
        """CANV-08: Batch creates SURVEY_RESPONSE event."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub -- implemented in plan 03-03")
    def test_active_script_required_for_responses(self) -> None:
        """CANV-08: Cannot record against draft/archived."""
        raise NotImplementedError
