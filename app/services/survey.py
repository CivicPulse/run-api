"""Survey service -- script lifecycle, question CRUD, response recording."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import and_, func, select

from app.core.time import utcnow
from app.models.survey import (
    QuestionType,
    ScriptStatus,
    SurveyQuestion,
    SurveyResponse,
    SurveyScript,
)
from app.models.voter_interaction import InteractionType
from app.services.voter_interaction import VoterInteractionService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.survey import (
        QuestionCreate,
        QuestionUpdate,
        ResponseCreate,
        ScriptCreate,
        ScriptUpdate,
    )

# Valid status transitions: (from_status, to_status)
_VALID_TRANSITIONS = {
    (ScriptStatus.DRAFT, ScriptStatus.ACTIVE),
    (ScriptStatus.ACTIVE, ScriptStatus.ARCHIVED),
}


class SurveyService:
    """Survey script lifecycle, question CRUD, and response recording.

    Composition pattern: delegates interaction event creation to
    VoterInteractionService for the SURVEY_RESPONSE audit trail.
    """

    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()

    # -------------------------------------------------------------------
    # Script CRUD
    # -------------------------------------------------------------------

    async def create_script(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: ScriptCreate,
        user_id: str,
    ) -> SurveyScript:
        """Create a new survey script in DRAFT status.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID (for RLS).
            data: Script creation data.
            user_id: ID of the creating user.

        Returns:
            The created SurveyScript record.
        """
        now = utcnow()
        script = SurveyScript(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            title=data.title,
            description=data.description,
            status=ScriptStatus.DRAFT,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(script)
        await session.flush()
        return script

    async def get_script(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> SurveyScript | None:
        """Get a single script by ID, scoped to the given campaign.

        Args:
            session: Async database session.
            script_id: Script UUID.
            campaign_id: Campaign UUID scope — script must belong here.

        Returns:
            The SurveyScript or None if not found in the given campaign.
        """
        result = await session.execute(
            select(SurveyScript).where(
                and_(
                    SurveyScript.id == script_id,
                    SurveyScript.campaign_id == campaign_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_scripts(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        status_filter: ScriptStatus | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> tuple[list[SurveyScript], str | None, bool]:
        """List scripts for a campaign with cursor-based pagination.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            status_filter: Optional status filter.
            cursor: Opaque cursor (created_at|id format).
            limit: Maximum items to return.

        Returns:
            Tuple of (items, next_cursor, has_more).
        """
        query = (
            select(SurveyScript)
            .where(SurveyScript.campaign_id == campaign_id)
            .order_by(SurveyScript.created_at.desc(), SurveyScript.id.desc())
        )

        if status_filter is not None:
            query = query.where(SurveyScript.status == status_filter)

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (SurveyScript.created_at < cursor_ts)
                    | (
                        (SurveyScript.created_at == cursor_ts)
                        & (SurveyScript.id < cursor_id)
                    )
                )

        query = query.limit(limit + 1)
        result = await session.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        return items, next_cursor, has_more

    async def update_script(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        data: ScriptUpdate,
        campaign_id: uuid.UUID,
    ) -> SurveyScript:
        """Update a script -- enforce lifecycle transitions and edit restrictions.

        Args:
            session: Async database session.
            script_id: Script UUID.
            data: Update data.
            campaign_id: Campaign UUID scope.

        Returns:
            The updated SurveyScript.

        Raises:
            ValueError: If script not found, invalid transition, or edit on non-draft.
        """
        script = await self.get_script(session, script_id, campaign_id)
        if script is None:
            msg = f"Script {script_id} not found"
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)

        # Handle status transition
        if "status" in update_fields:
            new_status = update_fields["status"]
            if (script.status, new_status) not in _VALID_TRANSITIONS:
                msg = f"Invalid status transition: {script.status} -> {new_status}"
                raise ValueError(msg)
            script.status = new_status

        # Handle metadata updates (title/description) -- draft only
        metadata_fields = {k: v for k, v in update_fields.items() if k != "status"}
        if metadata_fields and script.status != ScriptStatus.DRAFT:
            msg = "Script metadata can only be edited in draft status"
            raise ValueError(msg)

        for key, value in metadata_fields.items():
            setattr(script, key, value)

        script.updated_at = utcnow()
        await session.flush()
        return script

    async def delete_script(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> None:
        """Delete a draft script.

        Args:
            session: Async database session.
            script_id: Script UUID.
            campaign_id: Campaign UUID scope.

        Raises:
            ValueError: If script not found or not in draft status.
        """
        script = await self.get_script(session, script_id, campaign_id)
        if script is None:
            msg = f"Script {script_id} not found"
            raise ValueError(msg)
        if script.status != ScriptStatus.DRAFT:
            msg = "Only draft scripts can be deleted"
            raise ValueError(msg)

        await session.delete(script)
        await session.flush()

    # -------------------------------------------------------------------
    # Question CRUD (lifecycle-gated)
    # -------------------------------------------------------------------

    async def add_question(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        data: QuestionCreate,
        campaign_id: uuid.UUID,
    ) -> SurveyQuestion:
        """Add a question to a draft script.

        Args:
            session: Async database session.
            script_id: Script UUID.
            data: Question creation data.
            campaign_id: Campaign UUID scope.

        Returns:
            The created SurveyQuestion.

        Raises:
            ValueError: If script not found, not draft, or invalid options.
        """
        script = await self.get_script(session, script_id, campaign_id)
        if script is None:
            msg = f"Script {script_id} not found"
            raise ValueError(msg)
        if script.status != ScriptStatus.DRAFT:
            msg = "Questions can only be added to draft scripts"
            raise ValueError(msg)

        self._validate_question_options(data.question_type, data.options)

        # Determine position
        position = data.position
        if position is None:
            result = await session.execute(
                select(func.coalesce(func.max(SurveyQuestion.position), 0)).where(
                    SurveyQuestion.script_id == script_id
                )
            )
            position = result.scalar() + 1

        question = SurveyQuestion(
            id=uuid.uuid4(),
            script_id=script_id,
            position=position,
            question_text=data.question_text,
            question_type=data.question_type,
            options=data.options,
        )
        session.add(question)
        await session.flush()
        return question

    async def update_question(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        question_id: uuid.UUID,
        data: QuestionUpdate,
        campaign_id: uuid.UUID,
    ) -> SurveyQuestion:
        """Update a question -- only if parent script is draft.

        Args:
            session: Async database session.
            script_id: Script UUID (parent).
            question_id: Question UUID.
            data: Update data.
            campaign_id: Campaign UUID scope.

        Returns:
            The updated SurveyQuestion.

        Raises:
            ValueError: If question not found, parent not draft, or invalid options.
        """
        question = await self._get_question(
            session, script_id, question_id, campaign_id
        )
        script = await self.get_script(session, question.script_id, campaign_id)
        if script is None or script.status != ScriptStatus.DRAFT:
            msg = "Questions can only be edited on draft scripts"
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)

        # If question_type changed, validate options
        new_type = update_fields.get("question_type", question.question_type)
        new_options = update_fields.get("options", question.options)
        if "question_type" in update_fields or "options" in update_fields:
            self._validate_question_options(new_type, new_options)

        for key, value in update_fields.items():
            setattr(question, key, value)

        await session.flush()
        return question

    async def delete_question(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        question_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> None:
        """Delete a question -- only if parent script is draft.

        Args:
            session: Async database session.
            script_id: Script UUID (parent).
            question_id: Question UUID.
            campaign_id: Campaign UUID scope.

        Raises:
            ValueError: If question not found or parent not draft.
        """
        question = await self._get_question(
            session, script_id, question_id, campaign_id
        )
        script = await self.get_script(session, question.script_id, campaign_id)
        if script is None or script.status != ScriptStatus.DRAFT:
            msg = "Questions can only be deleted from draft scripts"
            raise ValueError(msg)

        await session.delete(question)
        await session.flush()

    async def reorder_questions(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        question_ids: list[uuid.UUID],
        campaign_id: uuid.UUID,
    ) -> list[SurveyQuestion]:
        """Reorder questions by setting position based on list order.

        Args:
            session: Async database session.
            script_id: Script UUID.
            question_ids: Ordered list of question UUIDs.
            campaign_id: Campaign UUID scope.

        Returns:
            Reordered list of SurveyQuestion.

        Raises:
            ValueError: If script not found or not draft.
        """
        script = await self.get_script(session, script_id, campaign_id)
        if script is None:
            msg = f"Script {script_id} not found"
            raise ValueError(msg)
        if script.status != ScriptStatus.DRAFT:
            msg = "Questions can only be reordered on draft scripts"
            raise ValueError(msg)

        questions = []
        for idx, qid in enumerate(question_ids, start=1):
            result = await session.execute(
                select(SurveyQuestion).where(
                    SurveyQuestion.id == qid,
                    SurveyQuestion.script_id == script_id,
                )
            )
            question = result.scalar_one_or_none()
            if question is None:
                msg = f"Question {qid} not found in script {script_id}"
                raise ValueError(msg)
            question.position = idx
            questions.append(question)

        await session.flush()
        return questions

    async def list_questions(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> list[SurveyQuestion]:
        """List questions for a script ordered by position.

        Scoped by campaign_id: only returns questions whose parent script
        belongs to the given campaign.

        Args:
            session: Async database session.
            script_id: Script UUID.
            campaign_id: Campaign UUID scope.

        Returns:
            Ordered list of SurveyQuestion.
        """
        result = await session.execute(
            select(SurveyQuestion)
            .join(SurveyScript, SurveyScript.id == SurveyQuestion.script_id)
            .where(
                and_(
                    SurveyQuestion.script_id == script_id,
                    SurveyScript.campaign_id == campaign_id,
                )
            )
            .order_by(SurveyQuestion.position)
        )
        return list(result.scalars().all())

    # -------------------------------------------------------------------
    # Response recording
    # -------------------------------------------------------------------

    async def record_response(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        script_id: uuid.UUID,
        data: ResponseCreate,
        user_id: str,
    ) -> SurveyResponse:
        """Record a single survey response with type validation.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            script_id: Script UUID.
            data: Response data.
            user_id: ID of the answering user.

        Returns:
            The created SurveyResponse.

        Raises:
            ValueError: If script not active, question not in script, or invalid answer.
        """
        script = await self.get_script(session, script_id, campaign_id)
        if script is None:
            msg = f"Script {script_id} not found"
            raise ValueError(msg)
        if script.status != ScriptStatus.ACTIVE:
            msg = "Responses can only be recorded against active scripts"
            raise ValueError(msg)

        question = await self._get_question_for_script(
            session, data.question_id, script_id
        )
        self._validate_answer(question, data.answer_value)

        now = utcnow()
        response = SurveyResponse(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            script_id=script_id,
            question_id=data.question_id,
            voter_id=data.voter_id,
            answer_value=data.answer_value,
            answered_by=user_id,
            answered_at=now,
        )
        session.add(response)
        await session.flush()
        return response

    async def record_responses_batch(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        script_id: uuid.UUID,
        voter_id: uuid.UUID,
        responses: list[ResponseCreate],
        user_id: str,
    ) -> list[SurveyResponse]:
        """Record multiple responses and emit a SURVEY_RESPONSE interaction event.

        This is the dual storage pattern: queryable responses in survey_responses
        plus an audit trail entry in voter_interactions.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            script_id: Script UUID.
            voter_id: Voter UUID.
            responses: List of response data.
            user_id: ID of the answering user.

        Returns:
            List of created SurveyResponse records.

        Raises:
            ValueError: If script not active or any answer is invalid.
        """
        results = []
        for resp in responses:
            result = await self.record_response(
                session=session,
                campaign_id=campaign_id,
                script_id=script_id,
                data=resp,
                user_id=user_id,
            )
            results.append(result)

        # Emit a single SURVEY_RESPONSE interaction event for the batch
        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.SURVEY_RESPONSE,
            payload={
                "script_id": str(script_id),
                "question_count": len(responses),
            },
            user_id=user_id,
        )

        return results

    async def get_voter_responses(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        script_id: uuid.UUID,
    ) -> list[SurveyResponse]:
        """Get all responses for a voter on a script, ordered by question position.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            script_id: Script UUID.

        Returns:
            List of SurveyResponse records ordered by question position.
        """
        result = await session.execute(
            select(SurveyResponse)
            .join(
                SurveyQuestion,
                SurveyResponse.question_id == SurveyQuestion.id,
            )
            .where(
                SurveyResponse.campaign_id == campaign_id,
                SurveyResponse.voter_id == voter_id,
                SurveyResponse.script_id == script_id,
            )
            .order_by(SurveyQuestion.position)
        )
        return list(result.scalars().all())

    # -------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------

    async def _get_question(
        self,
        session: AsyncSession,
        script_id: uuid.UUID,
        question_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> SurveyQuestion:
        """Get a question by ID scoped to the given script and campaign.

        JOINs SurveyScript to enforce that the parent script belongs to the
        given campaign — prevents cross-campaign question access via a
        crafted script path parameter.

        Args:
            session: Async database session.
            script_id: Parent script UUID.
            question_id: Question UUID.
            campaign_id: Campaign UUID scope.

        Returns:
            The SurveyQuestion.

        Raises:
            ValueError: If not found in this script+campaign.
        """
        result = await session.execute(
            select(SurveyQuestion)
            .join(SurveyScript, SurveyScript.id == SurveyQuestion.script_id)
            .where(
                and_(
                    SurveyQuestion.id == question_id,
                    SurveyQuestion.script_id == script_id,
                    SurveyScript.campaign_id == campaign_id,
                )
            )
        )
        question = result.scalar_one_or_none()
        if question is None:
            msg = f"Question {question_id} not found"
            raise ValueError(msg)
        return question

    async def _get_question_for_script(
        self,
        session: AsyncSession,
        question_id: uuid.UUID,
        script_id: uuid.UUID,
    ) -> SurveyQuestion:
        """Get a question verifying it belongs to the given script.

        Args:
            session: Async database session.
            question_id: Question UUID.
            script_id: Expected parent script UUID.

        Returns:
            The SurveyQuestion.

        Raises:
            ValueError: If not found or not in the expected script.
        """
        result = await session.execute(
            select(SurveyQuestion).where(
                SurveyQuestion.id == question_id,
                SurveyQuestion.script_id == script_id,
            )
        )
        question = result.scalar_one_or_none()
        if question is None:
            msg = f"Question {question_id} not found in script {script_id}"
            raise ValueError(msg)
        return question

    @staticmethod
    def _validate_question_options(
        question_type: QuestionType,
        options: dict | None,
    ) -> None:
        """Validate options based on question type.

        Args:
            question_type: The question type.
            options: Options dict to validate.

        Raises:
            ValueError: If options are invalid for the given type.
        """
        if question_type == QuestionType.MULTIPLE_CHOICE:
            if not options or "choices" not in options:
                msg = "Multiple choice questions require options.choices"
                raise ValueError(msg)
            choices = options["choices"]
            if not isinstance(choices, list) or not (2 <= len(choices) <= 10):
                msg = "choices must be a list of 2-10 items"
                raise ValueError(msg)
            if not all(isinstance(c, str) and c.strip() for c in choices):
                msg = "All choices must be non-empty strings"
                raise ValueError(msg)

        elif question_type == QuestionType.SCALE:
            if not options or "min" not in options or "max" not in options:
                msg = "Scale questions require options.min and options.max"
                raise ValueError(msg)
            min_val, max_val = options["min"], options["max"]
            if not isinstance(min_val, int) or not isinstance(max_val, int):
                msg = "min and max must be integers"
                raise ValueError(msg)
            if min_val >= max_val:
                msg = "min must be less than max"
                raise ValueError(msg)
            if min_val < 1 or max_val > 100:
                msg = "Scale range must be between 1 and 100"
                raise ValueError(msg)

        # free_text: options ignored (no validation needed)

    @staticmethod
    def _validate_answer(question: SurveyQuestion, answer_value: str) -> None:
        """Validate an answer value against the question type and options.

        Args:
            question: The SurveyQuestion being answered.
            answer_value: The answer string.

        Raises:
            ValueError: If the answer is invalid for the question type.
        """
        if question.question_type == QuestionType.MULTIPLE_CHOICE:
            choices = question.options.get("choices", []) if question.options else []
            if answer_value not in choices:
                msg = f"Answer must be one of: {choices}"
                raise ValueError(msg)

        elif question.question_type == QuestionType.SCALE:
            try:
                val = int(answer_value)
            except (TypeError, ValueError):
                msg = "Scale answer must be an integer"
                raise ValueError(msg) from None
            min_val = question.options.get("min", 1) if question.options else 1
            max_val = question.options.get("max", 10) if question.options else 10
            if not (min_val <= val <= max_val):
                msg = f"Scale answer must be between {min_val} and {max_val}"
                raise ValueError(msg)

        elif question.question_type == QuestionType.FREE_TEXT:
            if not answer_value or not answer_value.strip():
                msg = "Free text answer cannot be empty"
                raise ValueError(msg)
