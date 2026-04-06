"""Unit tests for survey scripts, questions, and responses -- CANV-07, CANV-08."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.survey import (
    QuestionType,
    ScriptStatus,
    SurveyQuestion,
    SurveyScript,
)
from app.models.voter_interaction import InteractionType
from app.schemas.survey import (
    QuestionCreate,
    ResponseCreate,
    ScriptCreate,
    ScriptUpdate,
)
from app.services.survey import SurveyService


def _make_script(
    *,
    status: ScriptStatus = ScriptStatus.DRAFT,
    campaign_id: uuid.UUID | None = None,
    script_id: uuid.UUID | None = None,
) -> SurveyScript:
    """Helper to create a SurveyScript instance for testing."""
    return SurveyScript(
        id=script_id or uuid.uuid4(),
        campaign_id=campaign_id or uuid.uuid4(),
        title="Test Script",
        description="A test survey",
        status=status,
        created_by="user-123",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _make_question(
    *,
    script_id: uuid.UUID,
    question_type: QuestionType = QuestionType.MULTIPLE_CHOICE,
    options: dict | None = None,
    position: int = 1,
    question_id: uuid.UUID | None = None,
) -> SurveyQuestion:
    """Helper to create a SurveyQuestion instance for testing."""
    if options is None and question_type == QuestionType.MULTIPLE_CHOICE:
        options = {"choices": ["Yes", "No"]}
    elif options is None and question_type == QuestionType.SCALE:
        options = {"min": 1, "max": 10}
    return SurveyQuestion(
        id=question_id or uuid.uuid4(),
        script_id=script_id,
        position=position,
        question_text="Test question?",
        question_type=question_type,
        options=options,
    )


class TestSurveyService:
    """Tests for survey script lifecycle, question CRUD,
    type validation, and response recording."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        db.delete = AsyncMock()
        return db

    @pytest.fixture
    def service(self):
        return SurveyService()

    @pytest.fixture
    def campaign_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def user_id(self):
        return "user-abc-123"

    async def test_create_survey_script(self, service, mock_db, campaign_id, user_id):
        """CANV-07: Create script in draft status."""
        data = ScriptCreate(title="Voter Survey", description="Door knocking survey")

        await service.create_script(
            session=mock_db,
            campaign_id=campaign_id,
            data=data,
            user_id=user_id,
        )

        mock_db.add.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, SurveyScript)
        assert added.status == ScriptStatus.DRAFT
        assert added.title == "Voter Survey"
        assert added.campaign_id == campaign_id
        assert added.created_by == user_id
        mock_db.flush.assert_awaited_once()

    async def test_script_lifecycle_transitions(self, service, mock_db, campaign_id):
        """CANV-07: draft->active->archived only."""
        # draft -> active: allowed
        draft_script = _make_script(status=ScriptStatus.DRAFT)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = draft_script
        mock_db.execute = AsyncMock(return_value=mock_result)

        data = ScriptUpdate(status=ScriptStatus.ACTIVE)
        result = await service.update_script(
            session=mock_db,
            script_id=draft_script.id,
            data=data,
            campaign_id=campaign_id,
        )
        assert result.status == ScriptStatus.ACTIVE

        # active -> archived: allowed
        active_script = _make_script(status=ScriptStatus.ACTIVE)
        mock_result.scalar_one_or_none.return_value = active_script

        data = ScriptUpdate(status=ScriptStatus.ARCHIVED)
        result = await service.update_script(
            session=mock_db,
            script_id=active_script.id,
            data=data,
            campaign_id=campaign_id,
        )
        assert result.status == ScriptStatus.ARCHIVED

        # archived -> draft: NOT allowed
        archived_script = _make_script(status=ScriptStatus.ARCHIVED)
        mock_result.scalar_one_or_none.return_value = archived_script

        with pytest.raises(ValueError, match="Invalid status transition"):
            await service.update_script(
                session=mock_db,
                script_id=archived_script.id,
                data=ScriptUpdate(status=ScriptStatus.DRAFT),
                campaign_id=campaign_id,
            )

        # active -> draft: NOT allowed
        active_script2 = _make_script(status=ScriptStatus.ACTIVE)
        mock_result.scalar_one_or_none.return_value = active_script2

        with pytest.raises(ValueError, match="Invalid status transition"):
            await service.update_script(
                session=mock_db,
                script_id=active_script2.id,
                data=ScriptUpdate(status=ScriptStatus.DRAFT),
                campaign_id=campaign_id,
            )

    async def test_question_crud_draft_only(self, service, mock_db, campaign_id):
        """CANV-07: Questions editable only in draft."""
        active_script = _make_script(status=ScriptStatus.ACTIVE)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = active_script
        mock_db.execute = AsyncMock(return_value=mock_result)

        data = QuestionCreate(
            question_text="Favorite color?",
            question_type=QuestionType.MULTIPLE_CHOICE,
            options={"choices": ["Red", "Blue"]},
        )

        with pytest.raises(ValueError, match="draft"):
            await service.add_question(
                session=mock_db,
                script_id=active_script.id,
                data=data,
                campaign_id=campaign_id,
            )

    async def test_question_type_validation(self, service):
        """CANV-07: MC options, scale range validated."""
        # MC requires choices
        with pytest.raises(ValueError, match="choices"):
            service._validate_question_options(QuestionType.MULTIPLE_CHOICE, None)

        with pytest.raises(ValueError, match="choices"):
            service._validate_question_options(
                QuestionType.MULTIPLE_CHOICE, {"choices": ["One"]}
            )

        # MC valid
        service._validate_question_options(
            QuestionType.MULTIPLE_CHOICE, {"choices": ["Yes", "No"]}
        )

        # Scale requires min < max
        with pytest.raises(ValueError, match="min.*max"):
            service._validate_question_options(QuestionType.SCALE, None)

        with pytest.raises(ValueError, match="min must be less than max"):
            service._validate_question_options(
                QuestionType.SCALE, {"min": 10, "max": 5}
            )

        # Scale valid
        service._validate_question_options(QuestionType.SCALE, {"min": 1, "max": 10})

        # Free text: None options OK
        service._validate_question_options(QuestionType.FREE_TEXT, None)

    async def test_survey_responses(self, service, mock_db, campaign_id, user_id):
        """CANV-08: Record response with type validation."""
        script_id = uuid.uuid4()
        question_id = uuid.uuid4()

        # Setup: script is active, question belongs to script
        active_script = _make_script(status=ScriptStatus.ACTIVE, script_id=script_id)
        mc_question = _make_question(
            script_id=script_id,
            question_id=question_id,
            question_type=QuestionType.MULTIPLE_CHOICE,
            options={"choices": ["Yes", "No", "Maybe"]},
        )

        # Mock: first call returns script, second returns question
        call_count = 0

        async def mock_execute(query, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                result.scalar_one_or_none.return_value = active_script
            else:
                result.scalar_one_or_none.return_value = mc_question
            return result

        mock_db.execute = mock_execute

        # Valid MC answer
        data = ResponseCreate(
            question_id=question_id,
            voter_id=uuid.uuid4(),
            answer_value="Yes",
        )
        result = await service.record_response(
            session=mock_db,
            campaign_id=campaign_id,
            script_id=script_id,
            data=data,
            user_id=user_id,
        )
        assert result.answer_value == "Yes"

        # Invalid MC answer
        call_count = 0
        data_bad = ResponseCreate(
            question_id=question_id,
            voter_id=uuid.uuid4(),
            answer_value="Invalid",
        )
        with pytest.raises(ValueError, match="must be one of"):
            await service.record_response(
                session=mock_db,
                campaign_id=campaign_id,
                script_id=script_id,
                data=data_bad,
                user_id=user_id,
            )

    async def test_reorder_questions_rejects_partial_question_set(
        self, service, mock_db, campaign_id
    ):
        """Phase 80: reorder must include the full script question set."""
        script_id = uuid.uuid4()
        q1 = _make_question(script_id=script_id, position=1)
        q2 = _make_question(script_id=script_id, position=2)
        service.get_script = AsyncMock(
            return_value=_make_script(
                status=ScriptStatus.DRAFT,
                campaign_id=campaign_id,
                script_id=script_id,
            )
        )

        ids_result = MagicMock()
        ids_result.scalars.return_value.all.return_value = [q1.id, q2.id]
        mock_db.execute = AsyncMock(return_value=ids_result)

        with pytest.raises(ValueError, match="include every question"):
            await service.reorder_questions(
                session=mock_db,
                script_id=script_id,
                question_ids=[q1.id],
                campaign_id=campaign_id,
            )

    async def test_reorder_questions_updates_positions_for_full_set(
        self, service, mock_db, campaign_id
    ):
        """Phase 80: full reorder still succeeds."""
        script_id = uuid.uuid4()
        q1 = _make_question(script_id=script_id, position=1)
        q2 = _make_question(script_id=script_id, position=2)
        service.get_script = AsyncMock(
            return_value=_make_script(
                status=ScriptStatus.DRAFT,
                campaign_id=campaign_id,
                script_id=script_id,
            )
        )

        ids_result = MagicMock()
        ids_result.scalars.return_value.all.return_value = [q1.id, q2.id]
        question_results = [
            MagicMock(scalar_one_or_none=MagicMock(return_value=q2)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=q1)),
        ]
        mock_db.execute = AsyncMock(side_effect=[ids_result, *question_results])

        questions = await service.reorder_questions(
            session=mock_db,
            script_id=script_id,
            question_ids=[q2.id, q1.id],
            campaign_id=campaign_id,
        )

        assert [question.id for question in questions] == [q2.id, q1.id]
        assert q2.position == 1
        assert q1.position == 2
        mock_db.flush.assert_awaited_once()

    async def test_batch_responses_emit_interaction(
        self, service, mock_db, campaign_id, user_id
    ):
        """CANV-08: Batch creates SURVEY_RESPONSE event."""
        script_id = uuid.uuid4()
        voter_id = uuid.uuid4()
        q1_id = uuid.uuid4()
        q2_id = uuid.uuid4()

        active_script = _make_script(status=ScriptStatus.ACTIVE, script_id=script_id)
        question1 = _make_question(
            script_id=script_id,
            question_id=q1_id,
            question_type=QuestionType.MULTIPLE_CHOICE,
            options={"choices": ["Yes", "No"]},
        )
        question2 = _make_question(
            script_id=script_id,
            question_id=q2_id,
            question_type=QuestionType.FREE_TEXT,
            options=None,
            position=2,
        )

        call_count = 0

        async def mock_execute(query, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            # Calls: script, question1, script, question2
            if call_count in (1, 3):
                result.scalar_one_or_none.return_value = active_script
            elif call_count == 2:
                result.scalar_one_or_none.return_value = question1
            elif call_count == 4:
                result.scalar_one_or_none.return_value = question2
            return result

        mock_db.execute = mock_execute

        # Mock interaction service
        service._interaction_service = MagicMock()
        service._interaction_service.record_interaction = AsyncMock()

        responses = [
            ResponseCreate(question_id=q1_id, voter_id=voter_id, answer_value="Yes"),
            ResponseCreate(
                question_id=q2_id, voter_id=voter_id, answer_value="Great candidate"
            ),
        ]

        results = await service.record_responses_batch(
            session=mock_db,
            campaign_id=campaign_id,
            script_id=script_id,
            voter_id=voter_id,
            responses=responses,
            user_id=user_id,
        )

        assert len(results) == 2

        # Verify interaction event was emitted
        service._interaction_service.record_interaction.assert_awaited_once()
        call_kwargs = service._interaction_service.record_interaction.call_args.kwargs
        assert call_kwargs["interaction_type"] == InteractionType.SURVEY_RESPONSE
        assert call_kwargs["voter_id"] == voter_id
        assert call_kwargs["payload"]["script_id"] == str(script_id)
        assert call_kwargs["payload"]["question_count"] == 2

    async def test_active_script_required_for_responses(
        self, service, mock_db, campaign_id, user_id
    ):
        """CANV-08: Cannot record against draft/archived."""
        for status in (ScriptStatus.DRAFT, ScriptStatus.ARCHIVED):
            script = _make_script(status=status)
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = script
            mock_db.execute = AsyncMock(return_value=mock_result)

            data = ResponseCreate(
                question_id=uuid.uuid4(),
                voter_id=uuid.uuid4(),
                answer_value="Yes",
            )

            with pytest.raises(ValueError, match="active"):
                await service.record_response(
                    session=mock_db,
                    campaign_id=campaign_id,
                    script_id=script.id,
                    data=data,
                    user_id=user_id,
                )
