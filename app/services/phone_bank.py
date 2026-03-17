"""Phone bank service -- session management, call recording, supervisor operations."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select, update

from app.core.time import utcnow
from app.models.call_list import (
    CallList,
    CallListEntry,
    CallResultCode,
    EntryStatus,
)
from app.models.dnc import DNCReason
from app.models.phone_bank import PhoneBankSession, SessionCaller, SessionStatus
from app.models.voter_interaction import InteractionType
from app.schemas.phone_bank import (
    CallerProgressItem,
    CallRecordResponse,
    SessionProgressResponse,
)
from app.services.dnc import DNCService
from app.services.survey import SurveyService
from app.services.voter_interaction import VoterInteractionService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.phone_bank import (
        CallRecordCreate,
        PhoneBankSessionCreate,
        PhoneBankSessionUpdate,
    )

# Valid status transitions (forward + pause/resume)
_VALID_TRANSITIONS: dict[str, set[str]] = {
    SessionStatus.DRAFT: {SessionStatus.ACTIVE},
    SessionStatus.ACTIVE: {SessionStatus.PAUSED, SessionStatus.COMPLETED},
    SessionStatus.PAUSED: {SessionStatus.ACTIVE, SessionStatus.COMPLETED},
    SessionStatus.COMPLETED: set(),
}

# Person-level terminal outcomes: mark entire entry TERMINAL
_PERSON_TERMINAL = {CallResultCode.REFUSED, CallResultCode.DECEASED}

# Number-level terminal outcomes: mark phone only
_NUMBER_TERMINAL = {CallResultCode.WRONG_NUMBER, CallResultCode.DISCONNECTED}

# Recyclable outcomes: increment attempts, set AVAILABLE (or MAX_ATTEMPTS)
_RECYCLABLE = {CallResultCode.NO_ANSWER, CallResultCode.BUSY, CallResultCode.VOICEMAIL}


class PhoneBankService:
    """Phone bank session lifecycle, call recording, and supervisor operations.

    Composes VoterInteractionService for PHONE_CALL events,
    SurveyService for survey response recording,
    and DNCService for auto-flagging refused outcomes.
    """

    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()
        self._survey_service = SurveyService()
        self._dnc_service = DNCService()

    # -------------------------------------------------------------------
    # Session CRUD
    # -------------------------------------------------------------------

    async def create_session(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: PhoneBankSessionCreate,
        user_id: str,
    ) -> PhoneBankSession:
        """Create a phone bank session in DRAFT status.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: Session creation data.
            user_id: ID of the creating user.

        Returns:
            The created PhoneBankSession.
        """
        now = utcnow()
        pb_session = PhoneBankSession(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            call_list_id=data.call_list_id,
            name=data.name,
            status=SessionStatus.DRAFT,
            scheduled_start=data.scheduled_start,
            scheduled_end=data.scheduled_end,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(pb_session)
        return pb_session

    async def get_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
    ) -> PhoneBankSession | None:
        """Get a phone bank session by ID.

        Args:
            session: Async database session.
            session_id: Session UUID.

        Returns:
            PhoneBankSession or None.
        """
        result = await session.execute(
            select(PhoneBankSession).where(PhoneBankSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        assigned_to_me_user_id: str | None = None,
    ) -> list[PhoneBankSession]:
        """List all phone bank sessions for a campaign.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            assigned_to_me_user_id: When provided, filters to sessions where
                this user is an assigned caller.

        Returns:
            List of PhoneBankSession objects.
        """
        query = (
            select(PhoneBankSession)
            .where(PhoneBankSession.campaign_id == campaign_id)
            .order_by(PhoneBankSession.created_at.desc())
        )
        if assigned_to_me_user_id is not None:
            query = (
                query.join(
                    SessionCaller,
                    SessionCaller.session_id == PhoneBankSession.id,
                )
                .where(SessionCaller.user_id == assigned_to_me_user_id)
                .distinct()
            )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def update_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        data: PhoneBankSessionUpdate,
    ) -> PhoneBankSession:
        """Update session with lifecycle enforcement.

        On completion, force-releases all IN_PROGRESS entries for the
        session's call list.

        Args:
            session: Async database session.
            session_id: Session UUID.
            data: Update fields.

        Returns:
            The updated PhoneBankSession.

        Raises:
            ValueError: If session not found or invalid transition.
        """
        pb_session = await self.get_session(session, session_id)
        if pb_session is None:
            msg = f"Session {session_id} not found"
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)

        # Handle status transition
        if "status" in update_fields:
            new_status = update_fields.pop("status")
            valid_targets = _VALID_TRANSITIONS.get(pb_session.status, set())
            if new_status not in valid_targets:
                msg = (
                    f"Invalid status transition from"
                    f" {pb_session.status} to {new_status}"
                )
                raise ValueError(msg)
            pb_session.status = new_status

            # On completion: force-release all IN_PROGRESS entries
            if new_status == SessionStatus.COMPLETED:
                await self._release_session_entries(session, pb_session.call_list_id)

        # Apply remaining field updates
        for key, value in update_fields.items():
            if value is not None:
                setattr(pb_session, key, value)

        pb_session.updated_at = utcnow()
        return pb_session

    # -------------------------------------------------------------------
    # Caller management
    # -------------------------------------------------------------------

    async def assign_caller(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> SessionCaller:
        """Assign a caller to a session.

        Args:
            session: Async database session.
            session_id: Session UUID.
            user_id: Caller user ID.

        Returns:
            The created SessionCaller.

        Raises:
            ValueError: If session not found.
        """
        pb_session = await self.get_session(session, session_id)
        if pb_session is None:
            msg = f"Session {session_id} not found"
            raise ValueError(msg)

        caller = SessionCaller(
            id=uuid.uuid4(),
            session_id=session_id,
            user_id=user_id,
            created_at=utcnow(),
        )
        session.add(caller)
        return caller

    async def remove_caller(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Remove a caller from a session, releasing their claimed entries.

        Args:
            session: Async database session.
            session_id: Session UUID.
            user_id: Caller user ID.

        Raises:
            ValueError: If caller not found in session.
        """
        caller = await self._get_caller(session, session_id, user_id)

        # Release caller's claimed entries
        pb_session = await self.get_session(session, session_id)
        if pb_session is not None:
            await self._release_caller_entries(
                session, pb_session.call_list_id, user_id
            )

        await session.delete(caller)

    async def check_in(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> SessionCaller:
        """Check in a caller to a session. Session must be ACTIVE.

        Args:
            session: Async database session.
            session_id: Session UUID.
            user_id: Caller user ID.

        Returns:
            The updated SessionCaller.

        Raises:
            ValueError: If session not active or caller not found.
        """
        pb_session = await self.get_session(session, session_id)
        if pb_session is None or pb_session.status != SessionStatus.ACTIVE:
            msg = f"Session {session_id} is not active"
            raise ValueError(msg)

        caller = await self._get_caller(session, session_id, user_id)
        caller.check_in_at = utcnow()
        return caller

    async def check_out(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> SessionCaller:
        """Check out a caller, releasing their claimed entries.

        Args:
            session: Async database session.
            session_id: Session UUID.
            user_id: Caller user ID.

        Returns:
            The updated SessionCaller.
        """
        caller = await self._get_caller(session, session_id, user_id)
        caller.check_out_at = utcnow()

        # Release caller's claimed entries
        pb_session = await self.get_session(session, session_id)
        if pb_session is not None:
            await self._release_caller_entries(
                session, pb_session.call_list_id, user_id
            )

        return caller

    # -------------------------------------------------------------------
    # Claim entries (session-aware wrapper)
    # -------------------------------------------------------------------

    async def claim_entries_for_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        caller_id: str,
        batch_size: int = 5,
    ) -> list[CallListEntry]:
        """Claim entries for a caller in a session. Session must be ACTIVE.

        Args:
            session: Async database session.
            session_id: Session UUID.
            caller_id: Caller user ID.
            batch_size: Number of entries to claim.

        Returns:
            List of claimed entries.

        Raises:
            ValueError: If session not active.
        """
        from app.services.call_list import CallListService

        pb_session = await self.get_session(session, session_id)
        if pb_session is None or pb_session.status != SessionStatus.ACTIVE:
            msg = f"Session {session_id} is not active"
            raise ValueError(msg)

        call_list_service = CallListService()
        return await call_list_service.claim_entries(
            session, pb_session.call_list_id, caller_id, batch_size
        )

    # -------------------------------------------------------------------
    # Call recording
    # -------------------------------------------------------------------

    async def record_call(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        session_id: uuid.UUID,
        data: CallRecordCreate,
        user_id: str,
    ) -> CallRecordResponse:
        """Record a call outcome with interaction events, survey, and DNC.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            session_id: Phone bank session UUID.
            data: Call record data.
            user_id: Caller user ID.

        Returns:
            CallRecordResponse with interaction_id.

        Raises:
            ValueError: If entry not found or not claimed by this user.
        """
        # Load entry
        entry_result = await session.execute(
            select(CallListEntry).where(CallListEntry.id == data.call_list_entry_id)
        )
        entry = entry_result.scalar_one_or_none()
        if entry is None:
            msg = f"Entry {data.call_list_entry_id} not found"
            raise ValueError(msg)
        if entry.claimed_by != user_id:
            msg = f"Entry {data.call_list_entry_id} not claimed by {user_id}"
            raise ValueError(msg)

        # Load call list (for script_id and max_attempts)
        cl_result = await session.execute(
            select(CallList).where(CallList.id == entry.call_list_id)
        )
        call_list = cl_result.scalar_one_or_none()

        result_code = data.result_code
        now = utcnow()

        # Build interaction payload
        payload = {
            "result_code": result_code,
            "call_list_id": str(entry.call_list_id),
            "session_id": str(session_id),
            "phone_number_used": data.phone_number_used,
            "call_started_at": data.call_started_at.isoformat(),
            "call_ended_at": data.call_ended_at.isoformat(),
            "notes": data.notes,
            "survey_complete": data.survey_complete if data.survey_responses else None,
        }

        # Record PHONE_CALL interaction
        interaction = await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=entry.voter_id,
            interaction_type=InteractionType.PHONE_CALL,
            payload=payload,
            user_id=user_id,
        )

        # Update entry based on result code
        entry.last_attempt_at = now

        if result_code == CallResultCode.ANSWERED:
            entry.status = EntryStatus.COMPLETED
            entry.attempt_count = (entry.attempt_count or 0) + 1

        elif result_code in _PERSON_TERMINAL:
            entry.status = EntryStatus.TERMINAL

        elif result_code in _NUMBER_TERMINAL:
            # Mark only this phone number
            phone_attempts = entry.phone_attempts or {}
            phone_attempts[data.phone_number_used] = {
                "result": result_code,
                "at": now.isoformat(),
            }
            entry.phone_attempts = phone_attempts

            # Check if any phones remain untried
            all_phones = {p["value"] for p in (entry.phone_numbers or [])}
            tried_phones = set(phone_attempts.keys())
            remaining = all_phones - tried_phones

            if remaining:
                entry.status = EntryStatus.AVAILABLE
            else:
                entry.status = EntryStatus.TERMINAL

        elif result_code in _RECYCLABLE:
            entry.attempt_count = (entry.attempt_count or 0) + 1
            # Update phone_attempts for tracking
            phone_attempts = entry.phone_attempts or {}
            phone_attempts[data.phone_number_used] = {
                "result": result_code,
                "at": now.isoformat(),
            }
            entry.phone_attempts = phone_attempts

            max_attempts = call_list.max_attempts if call_list else 3
            if entry.attempt_count >= max_attempts:
                entry.status = EntryStatus.MAX_ATTEMPTS
            else:
                entry.status = EntryStatus.AVAILABLE

        # Auto-DNC on refused
        if result_code == CallResultCode.REFUSED:
            await self._dnc_service.add_entry(
                session, campaign_id, data.phone_number_used, DNCReason.REFUSED, user_id
            )

        # Survey recording
        if result_code == CallResultCode.ANSWERED and data.survey_responses:
            script_id = call_list.script_id if call_list else None
            if script_id:
                # Convert survey responses to ResponseCreate objects
                from app.schemas.survey import ResponseCreate

                response_creates = [
                    ResponseCreate(
                        question_id=uuid.UUID(r["question_id"]),
                        voter_id=entry.voter_id,
                        answer_value=r["answer_value"],
                    )
                    for r in data.survey_responses
                ]
                await self._survey_service.record_responses_batch(
                    session=session,
                    campaign_id=campaign_id,
                    script_id=script_id,
                    voter_id=entry.voter_id,
                    responses=response_creates,
                    user_id=user_id,
                )

        # Update call list completed count
        if result_code == CallResultCode.ANSWERED and call_list:
            call_list.completed_entries = (call_list.completed_entries or 0) + 1

        return CallRecordResponse(
            id=uuid.uuid4(),
            result_code=result_code,
            phone_number_used=data.phone_number_used,
            call_started_at=data.call_started_at,
            call_ended_at=data.call_ended_at,
            notes=data.notes,
            interaction_id=interaction.id,
        )

    # -------------------------------------------------------------------
    # Supervisor operations
    # -------------------------------------------------------------------

    async def get_progress(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
    ) -> SessionProgressResponse:
        """Get session progress with per-caller stats.

        Args:
            session: Async database session.
            session_id: Session UUID.

        Returns:
            SessionProgressResponse with entry and caller stats.

        Raises:
            ValueError: If session not found.
        """
        pb_session = await self.get_session(session, session_id)
        if pb_session is None:
            msg = f"Session {session_id} not found"
            raise ValueError(msg)

        # Entry stats by status
        entry_stats_result = await session.execute(
            select(CallListEntry.status, func.count(CallListEntry.id))
            .where(CallListEntry.call_list_id == pb_session.call_list_id)
            .group_by(CallListEntry.status)
        )
        entry_stats = dict(entry_stats_result.all())

        total = sum(entry_stats.values())
        completed = entry_stats.get(EntryStatus.COMPLETED, 0)
        in_progress = entry_stats.get(EntryStatus.IN_PROGRESS, 0)
        available = entry_stats.get(EntryStatus.AVAILABLE, 0)

        # Callers for the session
        callers_result = await session.execute(
            select(SessionCaller).where(SessionCaller.session_id == session_id)
        )
        callers = list(callers_result.scalars().all())

        # Call counts per caller (count of PHONE_CALL interactions by user)
        from app.models.voter_interaction import VoterInteraction

        call_counts_result = await session.execute(
            select(VoterInteraction.created_by, func.count(VoterInteraction.id))
            .where(
                VoterInteraction.campaign_id == pb_session.campaign_id,
                VoterInteraction.type == InteractionType.PHONE_CALL,
            )
            .group_by(VoterInteraction.created_by)
        )
        call_counts = dict(call_counts_result.all())

        caller_items = [
            CallerProgressItem(
                user_id=c.user_id,
                calls_made=call_counts.get(c.user_id, 0),
                check_in_at=c.check_in_at,
                check_out_at=c.check_out_at,
            )
            for c in callers
        ]

        return SessionProgressResponse(
            session_id=session_id,
            total_entries=total,
            completed=completed,
            in_progress=in_progress,
            available=available,
            callers=caller_items,
        )

    async def reassign_entry(
        self,
        session: AsyncSession,
        entry_id: uuid.UUID,
        new_caller_id: str,
    ) -> CallListEntry:
        """Reassign an entry to a different caller.

        Args:
            session: Async database session.
            entry_id: Entry UUID.
            new_caller_id: New caller user ID.

        Returns:
            The updated CallListEntry.

        Raises:
            ValueError: If entry not found.
        """
        result = await session.execute(
            select(CallListEntry).where(CallListEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            msg = f"Entry {entry_id} not found"
            raise ValueError(msg)

        entry.claimed_by = new_caller_id
        entry.claimed_at = utcnow()
        return entry

    async def force_release_entry(
        self,
        session: AsyncSession,
        entry_id: uuid.UUID,
    ) -> CallListEntry:
        """Force-release an entry back to AVAILABLE.

        Args:
            session: Async database session.
            entry_id: Entry UUID.

        Returns:
            The updated CallListEntry.

        Raises:
            ValueError: If entry not found.
        """
        result = await session.execute(
            select(CallListEntry).where(CallListEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            msg = f"Entry {entry_id} not found"
            raise ValueError(msg)

        entry.status = EntryStatus.AVAILABLE
        entry.claimed_by = None
        entry.claimed_at = None
        return entry

    async def self_release_entry(
        self,
        session: AsyncSession,
        entry_id: uuid.UUID,
        user_id: str,
    ) -> CallListEntry:
        """Release an entry back to AVAILABLE; caller must own the entry.

        Args:
            session: Async database session.
            entry_id: Entry UUID.
            user_id: ID of the caller requesting the release.

        Returns:
            The updated CallListEntry.

        Raises:
            ValueError: If entry not found or not claimed by user_id.
        """
        result = await session.execute(
            select(CallListEntry).where(CallListEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            msg = f"Entry {entry_id} not found"
            raise ValueError(msg)
        if entry.claimed_by != user_id:
            msg = f"Entry {entry_id} not claimed by {user_id}"
            raise ValueError(msg)

        entry.status = EntryStatus.AVAILABLE
        entry.claimed_by = None
        entry.claimed_at = None
        return entry

    async def list_callers(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
    ) -> list[SessionCaller]:
        """List all callers assigned to a phone bank session.

        Args:
            session: Async database session.
            session_id: Session UUID.

        Returns:
            List of SessionCaller objects.
        """
        result = await session.execute(
            select(SessionCaller).where(SessionCaller.session_id == session_id)
        )
        return list(result.scalars().all())

    async def end_caller_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """End a caller's session: check out + release entries.

        Args:
            session: Async database session.
            session_id: Session UUID.
            user_id: Caller user ID.
        """
        await self.check_out(session, session_id, user_id)

    # -------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------

    async def _get_caller(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: str,
    ) -> SessionCaller:
        """Get a caller by session + user or raise ValueError."""
        result = await session.execute(
            select(SessionCaller).where(
                SessionCaller.session_id == session_id,
                SessionCaller.user_id == user_id,
            )
        )
        caller = result.scalar_one_or_none()
        if caller is None:
            msg = f"Caller {user_id} not found in session {session_id}"
            raise ValueError(msg)
        return caller

    async def _release_session_entries(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
    ) -> None:
        """Release all IN_PROGRESS entries for a call list."""
        await session.execute(
            update(CallListEntry)
            .where(
                CallListEntry.call_list_id == call_list_id,
                CallListEntry.status == EntryStatus.IN_PROGRESS,
            )
            .values(
                status=EntryStatus.AVAILABLE,
                claimed_by=None,
                claimed_at=None,
            )
        )

    async def _release_caller_entries(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Release entries claimed by a specific caller."""
        await session.execute(
            update(CallListEntry)
            .where(
                CallListEntry.call_list_id == call_list_id,
                CallListEntry.claimed_by == user_id,
                CallListEntry.status == EntryStatus.IN_PROGRESS,
            )
            .values(
                status=EntryStatus.AVAILABLE,
                claimed_by=None,
                claimed_at=None,
            )
        )
