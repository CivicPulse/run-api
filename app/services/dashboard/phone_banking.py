"""Phone banking dashboard aggregation service."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_list import CallList, CallResultCode
from app.models.phone_bank import PhoneBankSession
from app.models.user import User
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.schemas.dashboard import (
    CallerBreakdown,
    CallListBreakdown,
    CallOutcomeBreakdown,
    PhoneBankingSummary,
    SessionBreakdown,
    apply_date_filter,
)

# Result codes that count as a "contact" (person was actually reached)
CONTACT_RESULTS = frozenset(
    {
        CallResultCode.ANSWERED.value,
        CallResultCode.REFUSED.value,
    }
)


def _result_code_col():  # noqa: ANN202
    """Shorthand for the JSONB result_code text accessor."""
    return VoterInteraction.payload["result_code"].astext


def _call_outcome_columns():
    """Return SQLAlchemy aggregation columns for each CallResultCode value."""
    rc = _result_code_col()
    return {r.value: func.count(case((rc == r.value, 1))) for r in CallResultCode}


def _build_call_outcome(row_mapping: dict) -> CallOutcomeBreakdown:
    """Construct a CallOutcomeBreakdown from a row mapping."""
    return CallOutcomeBreakdown(
        answered=row_mapping.get(CallResultCode.ANSWERED.value, 0),
        no_answer=row_mapping.get(CallResultCode.NO_ANSWER.value, 0),
        busy=row_mapping.get(CallResultCode.BUSY.value, 0),
        wrong_number=row_mapping.get(CallResultCode.WRONG_NUMBER.value, 0),
        voicemail=row_mapping.get(CallResultCode.VOICEMAIL.value, 0),
        refused=row_mapping.get(CallResultCode.REFUSED.value, 0),
        deceased=row_mapping.get(CallResultCode.DECEASED.value, 0),
        disconnected=row_mapping.get(CallResultCode.DISCONNECTED.value, 0),
    )


class PhoneBankingDashboardService:
    """Aggregation queries for phone banking dashboard metrics."""

    @staticmethod
    async def get_summary(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> PhoneBankingSummary:
        rc = _result_code_col()
        outcome_cols = _call_outcome_columns()

        q = (
            select(
                func.count().label("calls_made"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_reached"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.PHONE_CALL)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        result = (await session.execute(q)).mappings().one()
        calls = result["calls_made"]
        contacts = result["contacts_reached"]
        return PhoneBankingSummary(
            calls_made=calls,
            contacts_reached=contacts,
            contact_rate=round(contacts / calls, 4) if calls else 0.0,
            outcomes=_build_call_outcome(result),
        )

    @staticmethod
    async def get_by_session(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        session_id: uuid.UUID | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[SessionBreakdown]:
        rc = _result_code_col()
        outcome_cols = _call_outcome_columns()
        pbs_id_col = VoterInteraction.payload["session_id"].astext.cast(
            PG_UUID(as_uuid=True)
        )

        q = (
            select(
                PhoneBankSession.id.label("session_id"),
                PhoneBankSession.name.label("session_name"),
                PhoneBankSession.status.label("status"),
                func.count().label("calls_made"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_reached"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .select_from(VoterInteraction)
            .join(PhoneBankSession, PhoneBankSession.id == pbs_id_col)
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.PHONE_CALL)
            .group_by(
                PhoneBankSession.id, PhoneBankSession.name, PhoneBankSession.status
            )
            .order_by(PhoneBankSession.id)
            .limit(limit)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        if session_id is not None:
            q = q.where(PhoneBankSession.id == session_id)
        if cursor:
            q = q.where(PhoneBankSession.id > uuid.UUID(cursor))

        rows = (await session.execute(q)).mappings().all()
        return [
            SessionBreakdown(
                session_id=r["session_id"],
                session_name=r["session_name"],
                status=r["status"],
                calls_made=r["calls_made"],
                contacts_reached=r["contacts_reached"],
                outcomes=_build_call_outcome(r),
            )
            for r in rows
        ]

    @staticmethod
    async def get_by_caller(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[CallerBreakdown]:
        rc = _result_code_col()
        outcome_cols = _call_outcome_columns()

        q = (
            select(
                VoterInteraction.created_by.label("user_id"),
                func.coalesce(User.display_name, VoterInteraction.created_by).label(
                    "display_name"
                ),
                func.count().label("calls_made"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_reached"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .select_from(VoterInteraction)
            .outerjoin(User, User.id == VoterInteraction.created_by)
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.PHONE_CALL)
            .group_by(VoterInteraction.created_by, User.display_name)
            .order_by(VoterInteraction.created_by)
            .limit(limit)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        if cursor:
            q = q.where(VoterInteraction.created_by > cursor)

        rows = (await session.execute(q)).mappings().all()
        return [
            CallerBreakdown(
                user_id=r["user_id"],
                display_name=r["display_name"],
                calls_made=r["calls_made"],
                contacts_reached=r["contacts_reached"],
                outcomes=_build_call_outcome(r),
            )
            for r in rows
        ]

    @staticmethod
    async def get_by_call_list(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[CallListBreakdown]:
        rc = _result_code_col()
        cl_id_col = VoterInteraction.payload["call_list_id"].astext.cast(
            PG_UUID(as_uuid=True)
        )

        q = (
            select(
                CallList.id.label("call_list_id"),
                CallList.name.label("call_list_name"),
                CallList.total_entries.label("total_entries"),
                CallList.completed_entries.label("completed_entries"),
                func.count().label("calls_made"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_reached"
                ),
            )
            .select_from(VoterInteraction)
            .join(CallList, CallList.id == cl_id_col)
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.PHONE_CALL)
            .group_by(
                CallList.id,
                CallList.name,
                CallList.total_entries,
                CallList.completed_entries,
            )
            .order_by(CallList.id)
            .limit(limit)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        if cursor:
            q = q.where(CallList.id > uuid.UUID(cursor))

        rows = (await session.execute(q)).mappings().all()
        return [
            CallListBreakdown(
                call_list_id=r["call_list_id"],
                call_list_name=r["call_list_name"],
                total_entries=r["total_entries"],
                completed_entries=r["completed_entries"],
                completion_rate=(
                    round(r["completed_entries"] / r["total_entries"], 4)
                    if r["total_entries"]
                    else 0.0
                ),
                calls_made=r["calls_made"],
                contacts_reached=r["contacts_reached"],
            )
            for r in rows
        ]
