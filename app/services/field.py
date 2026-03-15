"""Field service -- volunteer assignment aggregation for the landing hub."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.models.call_list import CallList
from app.models.campaign import Campaign
from app.models.phone_bank import PhoneBankSession, SessionCaller
from app.models.walk_list import WalkList, WalkListCanvasser

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class FieldService:
    """Aggregates volunteer assignment data for the field/me endpoint."""

    async def get_field_me(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        user_id: str,
        display_name: str | None,
        email: str | None,
    ) -> dict:
        """Return volunteer name, campaign name, and active assignments.

        Queries the most recent canvassing assignment (by assigned_at)
        and the most recent active phone banking session (by created_at).
        Uses denormalized counters for progress: WalkList.total_entries /
        visited_entries, and CallList.total_entries / completed_entries.

        Args:
            db: Async database session with RLS context already set.
            campaign_id: The campaign to query assignments for.
            user_id: The authenticated user's ID.
            display_name: User display name from JWT (may be None).
            email: User email from JWT (may be None).

        Returns:
            Dict matching FieldMeResponse shape.
        """
        # Campaign name
        campaign = await db.scalar(
            select(Campaign).where(Campaign.id == campaign_id)
        )

        # Most recent canvassing assignment
        canvassing_result = await db.execute(
            select(WalkList)
            .join(WalkListCanvasser, WalkListCanvasser.walk_list_id == WalkList.id)
            .where(
                WalkListCanvasser.user_id == user_id,
                WalkList.campaign_id == campaign_id,
            )
            .order_by(WalkListCanvasser.assigned_at.desc())
            .limit(1)
        )
        walk_list = canvassing_result.scalar_one_or_none()

        # Most recent active phone banking session
        phone_result = await db.execute(
            select(PhoneBankSession)
            .join(SessionCaller, SessionCaller.session_id == PhoneBankSession.id)
            .where(
                SessionCaller.user_id == user_id,
                PhoneBankSession.campaign_id == campaign_id,
                PhoneBankSession.status == "active",
            )
            .order_by(SessionCaller.created_at.desc())
            .limit(1)
        )
        phone_session = phone_result.scalar_one_or_none()

        # Get call list progress if phone session exists
        phone_banking_data = None
        if phone_session is not None:
            cl_result = await db.execute(
                select(CallList).where(CallList.id == phone_session.call_list_id)
            )
            call_list = cl_result.scalar_one_or_none()
            phone_banking_data = {
                "session_id": phone_session.id,
                "name": phone_session.name,
                "total": call_list.total_entries if call_list else 0,
                "completed": call_list.completed_entries if call_list else 0,
            }

        # Build canvassing data
        canvassing_data = None
        if walk_list is not None:
            canvassing_data = {
                "walk_list_id": walk_list.id,
                "name": walk_list.name,
                "total": walk_list.total_entries,
                "completed": walk_list.visited_entries,
            }

        # Volunteer name fallback: display_name -> email -> "Volunteer"
        volunteer_name = display_name or email or "Volunteer"

        return {
            "volunteer_name": volunteer_name,
            "campaign_name": campaign.name if campaign else "Campaign",
            "canvassing": canvassing_data,
            "phone_banking": phone_banking_data,
        }
