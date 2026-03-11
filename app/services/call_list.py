"""Call list service -- generation, claiming, status management."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import timedelta
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select, update

from app.core.time import utcnow
from app.models.call_list import (
    CallList,
    CallListEntry,
    CallListStatus,
    EntryStatus,
)
from app.models.dnc import DoNotCallEntry
from app.models.voter_contact import VoterPhone
from app.models.voter_interaction import VoterInteraction
from app.models.voter_list import VoterList, VoterListMember

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.call_list import CallListCreate, CallListUpdate

# Phone number validation: 10-15 digits only
PHONE_REGEX = re.compile(r"^\d{10,15}$")

# Valid status transitions (forward only)
_VALID_TRANSITIONS: dict[str, set[str]] = {
    CallListStatus.DRAFT: {CallListStatus.ACTIVE},
    CallListStatus.ACTIVE: {CallListStatus.COMPLETED},
    CallListStatus.COMPLETED: set(),
}


def calculate_priority_score(interaction_count: int) -> int:
    """Calculate priority score based on prior interaction count.

    Higher score = higher priority (less contacted voters first).
    Score = 100 - (interaction_count * 20), minimum 0.

    Args:
        interaction_count: Number of prior interactions with this voter.

    Returns:
        Priority score between 0 and 100.
    """
    return max(0, 100 - (interaction_count * 20))


class CallListService:
    """Call list generation, claiming, and status management."""

    async def generate_call_list(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: CallListCreate,
        user_id: str,
    ) -> CallList:
        """Generate a frozen call list from voter universe with phone/DNC filtering.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: CallListCreate schema.
            user_id: Creating user ID.

        Returns:
            The created CallList with total_entries set.
        """
        # Step 1: Determine voter query based on voter_list_id
        voter_ids: list[uuid.UUID] | None = None

        if data.voter_list_id is not None:
            # Look up the voter list and its members
            vl_result = await session.execute(
                select(VoterList).where(VoterList.id == data.voter_list_id)
            )
            voter_list = vl_result.scalar_one_or_none()

            if voter_list is not None and voter_list.list_type == "static":
                # Static list: get member voter IDs
                members_q = select(VoterListMember.voter_id).where(
                    VoterListMember.voter_list_id == data.voter_list_id
                )
                members_result = await session.execute(members_q)
                voter_ids = [row[0] for row in members_result.all()]

        # Step 2: Get all phones for campaign voters
        phone_query = select(
            VoterPhone.voter_id.label("voter_id"),
            VoterPhone.id.label("phone_id"),
            VoterPhone.value.label("phone_value"),
            VoterPhone.type.label("phone_type"),
            VoterPhone.is_primary.label("is_primary"),
        ).where(VoterPhone.campaign_id == campaign_id)

        if voter_ids is not None:
            phone_query = phone_query.where(VoterPhone.voter_id.in_(voter_ids))

        phone_result = await session.execute(phone_query)
        phone_rows = phone_result.all()

        # Step 3: Get DNC numbers for this campaign
        dnc_query = select(DoNotCallEntry.phone_number).where(
            DoNotCallEntry.campaign_id == campaign_id
        )
        dnc_result = await session.execute(dnc_query)
        dnc_numbers = set(dnc_result.scalars().all())

        # Step 4: Get interaction counts per voter for priority scoring
        interaction_query = (
            select(
                VoterInteraction.voter_id,
                VoterInteraction.id,
            )
            .where(VoterInteraction.campaign_id == campaign_id)
        )
        if voter_ids is not None:
            interaction_query = interaction_query.where(
                VoterInteraction.voter_id.in_(voter_ids)
            )
        interaction_result = await session.execute(interaction_query)
        interaction_counts: dict[uuid.UUID, int] = defaultdict(int)
        for row in interaction_result.all():
            interaction_counts[row[0]] += 1

        # Step 5: Group phones by voter, filter by validity and DNC
        voter_phones: dict[uuid.UUID, list[dict]] = defaultdict(list)
        for row in phone_rows:
            phone_value = row.phone_value
            # Validate phone format
            if not PHONE_REGEX.match(phone_value):
                continue
            # Exclude DNC numbers
            if phone_value in dnc_numbers:
                continue
            voter_phones[row.voter_id].append({
                "phone_id": str(row.phone_id),
                "value": phone_value,
                "type": row.phone_type,
                "is_primary": row.is_primary,
            })

        # Step 6: Create call list
        call_list = CallList(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_list_id=data.voter_list_id,
            script_id=data.script_id,
            name=data.name,
            status=CallListStatus.DRAFT,
            total_entries=0,
            completed_entries=0,
            max_attempts=data.max_attempts,
            claim_timeout_minutes=data.claim_timeout_minutes,
            cooldown_minutes=data.cooldown_minutes,
            created_by=user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(call_list)

        # Step 7: Create entries for voters with valid non-DNC phones
        entry_count = 0
        for vid, phones in voter_phones.items():
            if not phones:
                continue
            # Sort: primary first, then by type
            phones.sort(key=lambda p: (not p["is_primary"], p["type"]))

            priority = calculate_priority_score(interaction_counts.get(vid, 0))

            entry = CallListEntry(
                id=uuid.uuid4(),
                call_list_id=call_list.id,
                voter_id=vid,
                priority_score=priority,
                phone_numbers=phones,
                status=EntryStatus.AVAILABLE,
                attempt_count=0,
                claimed_by=None,
                claimed_at=None,
                last_attempt_at=None,
                phone_attempts=None,
            )
            session.add(entry)
            entry_count += 1

        call_list.total_entries = entry_count
        logger.info(
            "Generated call list '{}' with {} entries for campaign {}",
            data.name,
            entry_count,
            campaign_id,
        )

        return call_list

    async def claim_entries(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
        caller_id: str,
        batch_size: int = 5,
    ) -> list[CallListEntry]:
        """Claim a batch of entries using FOR UPDATE SKIP LOCKED.

        Also releases stale claims before selecting.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.
            caller_id: The caller user ID.
            batch_size: Number of entries to claim.

        Returns:
            List of claimed CallListEntry objects.

        Raises:
            ValueError: If call list not found or not active.
        """
        # Load call list
        cl_result = await session.execute(
            select(CallList).where(CallList.id == call_list_id)
        )
        call_list = cl_result.scalar_one_or_none()
        if call_list is None:
            msg = f"Call list {call_list_id} not found"
            raise ValueError(msg)
        if call_list.status != CallListStatus.ACTIVE:
            msg = f"Call list {call_list_id} is not active"
            raise ValueError(msg)

        # Release stale claims
        stale_cutoff = utcnow() - timedelta(
            minutes=call_list.claim_timeout_minutes
        )
        await session.execute(
            update(CallListEntry)
            .where(
                CallListEntry.call_list_id == call_list_id,
                CallListEntry.status == EntryStatus.IN_PROGRESS,
                CallListEntry.claimed_at < stale_cutoff,
            )
            .values(
                status=EntryStatus.AVAILABLE,
                claimed_by=None,
                claimed_at=None,
            )
        )

        # SELECT FOR UPDATE SKIP LOCKED: available entries by priority desc
        entries_query = (
            select(CallListEntry)
            .where(
                CallListEntry.call_list_id == call_list_id,
                CallListEntry.status == EntryStatus.AVAILABLE,
            )
            .order_by(CallListEntry.priority_score.desc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
        entries_result = await session.execute(entries_query)
        entries = list(entries_result.scalars().all())

        if not entries:
            return []

        # Update claimed entries
        now = utcnow()
        entry_ids = [e.id for e in entries]
        await session.execute(
            update(CallListEntry)
            .where(CallListEntry.id.in_(entry_ids))
            .values(
                status=EntryStatus.IN_PROGRESS,
                claimed_by=caller_id,
                claimed_at=now,
            )
        )

        # Update in-memory objects
        for entry in entries:
            entry.status = EntryStatus.IN_PROGRESS
            entry.claimed_by = caller_id
            entry.claimed_at = now

        return entries

    async def update_status(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
        new_status: str,
    ) -> CallList:
        """Update call list status with forward-only lifecycle enforcement.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.
            new_status: Target status.

        Returns:
            The updated CallList.

        Raises:
            ValueError: If call list not found or invalid transition.
        """
        cl_result = await session.execute(
            select(CallList).where(CallList.id == call_list_id)
        )
        call_list = cl_result.scalar_one_or_none()
        if call_list is None:
            msg = f"Call list {call_list_id} not found"
            raise ValueError(msg)

        valid_targets = _VALID_TRANSITIONS.get(call_list.status, set())
        if new_status not in valid_targets:
            msg = f"Invalid status transition from {call_list.status} to {new_status}"
            raise ValueError(msg)

        call_list.status = new_status
        call_list.updated_at = utcnow()
        return call_list

    async def list_entries(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
        status: str | None = None,
    ) -> list[CallListEntry]:
        """List entries for a call list with optional status filter.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.
            status: Optional status filter.

        Returns:
            List of CallListEntry objects ordered by priority desc.
        """
        q = (
            select(CallListEntry)
            .where(CallListEntry.call_list_id == call_list_id)
            .order_by(CallListEntry.priority_score.desc())
        )
        if status is not None:
            q = q.where(CallListEntry.status == status)
        result = await session.execute(q)
        return list(result.scalars().all())

    async def update_call_list(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
        update: "CallListUpdate",
        new_status: str | None = None,
    ) -> CallList:
        """Update call list name, voter_list_id, and/or status.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.
            update: CallListUpdate schema with optional name/voter_list_id.
            new_status: Optional new status for transition.

        Returns:
            The updated CallList.

        Raises:
            ValueError: If call list not found or invalid status transition.
        """
        cl_result = await session.execute(
            select(CallList).where(CallList.id == call_list_id)
        )
        call_list = cl_result.scalar_one_or_none()
        if call_list is None:
            raise ValueError(f"Call list {call_list_id} not found")
        if update.name is not None:
            call_list.name = update.name
        if update.voter_list_id is not None:
            call_list.voter_list_id = update.voter_list_id
        if new_status is not None:
            valid_targets = _VALID_TRANSITIONS.get(call_list.status, set())
            if new_status not in valid_targets:
                raise ValueError(
                    f"Invalid status transition from {call_list.status} to {new_status}"
                )
            call_list.status = new_status
        call_list.updated_at = utcnow()
        return call_list

    async def get_call_list(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
    ) -> CallList | None:
        """Get a call list by ID.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.

        Returns:
            CallList or None if not found.
        """
        result = await session.execute(
            select(CallList).where(CallList.id == call_list_id)
        )
        return result.scalar_one_or_none()

    async def list_call_lists(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[CallList]:
        """List all call lists for a campaign.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.

        Returns:
            List of CallList objects.
        """
        result = await session.execute(
            select(CallList)
            .where(CallList.campaign_id == campaign_id)
            .order_by(CallList.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_call_list(
        self,
        session: AsyncSession,
        call_list_id: uuid.UUID,
    ) -> None:
        """Delete a call list and its entries.

        Args:
            session: Async database session.
            call_list_id: The call list UUID.

        Raises:
            ValueError: If call list not found.
        """
        cl_result = await session.execute(
            select(CallList).where(CallList.id == call_list_id)
        )
        call_list = cl_result.scalar_one_or_none()
        if call_list is None:
            msg = f"Call list {call_list_id} not found"
            raise ValueError(msg)

        # Delete entries first
        from sqlalchemy import delete

        await session.execute(
            delete(CallListEntry).where(
                CallListEntry.call_list_id == call_list_id
            )
        )
        await session.delete(call_list)
