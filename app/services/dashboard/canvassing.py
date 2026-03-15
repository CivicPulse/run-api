"""Canvassing dashboard aggregation service."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.turf import Turf
from app.models.user import User
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import DoorKnockResult, WalkList
from app.schemas.dashboard import (
    CanvasserBreakdown,
    CanvassingSummary,
    OutcomeBreakdown,
    TurfBreakdown,
    apply_date_filter,
)

# Result codes that count as a "contact" (person was actually reached)
CONTACT_RESULTS = frozenset(
    {
        DoorKnockResult.SUPPORTER.value,
        DoorKnockResult.UNDECIDED.value,
        DoorKnockResult.OPPOSED.value,
        DoorKnockResult.REFUSED.value,
    }
)


def _result_code_col():  # noqa: ANN202
    """Shorthand for the JSONB result_code text accessor."""
    return VoterInteraction.payload["result_code"].astext


def _outcome_columns():
    """Return SQLAlchemy aggregation columns for each DoorKnockResult value."""
    rc = _result_code_col()
    return {r.value: func.count(case((rc == r.value, 1))) for r in DoorKnockResult}


def _build_outcome(row_mapping: dict) -> OutcomeBreakdown:
    """Construct an OutcomeBreakdown from a row mapping keyed by result value."""
    return OutcomeBreakdown(
        not_home=row_mapping.get(DoorKnockResult.NOT_HOME.value, 0),
        refused=row_mapping.get(DoorKnockResult.REFUSED.value, 0),
        supporter=row_mapping.get(DoorKnockResult.SUPPORTER.value, 0),
        undecided=row_mapping.get(DoorKnockResult.UNDECIDED.value, 0),
        opposed=row_mapping.get(DoorKnockResult.OPPOSED.value, 0),
        moved=row_mapping.get(DoorKnockResult.MOVED.value, 0),
        deceased=row_mapping.get(DoorKnockResult.DECEASED.value, 0),
        come_back_later=row_mapping.get(DoorKnockResult.COME_BACK_LATER.value, 0),
        inaccessible=row_mapping.get(DoorKnockResult.INACCESSIBLE.value, 0),
    )


class CanvassingDashboardService:
    """Aggregation queries for canvassing dashboard metrics."""

    @staticmethod
    async def get_summary(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> CanvassingSummary:
        rc = _result_code_col()
        outcome_cols = _outcome_columns()

        q = (
            select(
                func.count().label("doors_knocked"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_made"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        result = (await session.execute(q)).mappings().one()
        doors = result["doors_knocked"]
        contacts = result["contacts_made"]
        return CanvassingSummary(
            doors_knocked=doors,
            contacts_made=contacts,
            contact_rate=round(contacts / doors, 4) if doors else 0.0,
            outcomes=_build_outcome(result),
        )

    @staticmethod
    async def get_by_turf(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        turf_id: uuid.UUID | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[TurfBreakdown]:
        rc = _result_code_col()
        outcome_cols = _outcome_columns()
        walk_list_id_col = VoterInteraction.payload["walk_list_id"].astext.cast(
            PG_UUID(as_uuid=True)
        )

        q = (
            select(
                Turf.id.label("turf_id"),
                Turf.name.label("turf_name"),
                func.count().label("doors_knocked"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_made"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .select_from(VoterInteraction)
            .join(WalkList, WalkList.id == walk_list_id_col)
            .join(Turf, Turf.id == WalkList.turf_id)
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
            .group_by(Turf.id, Turf.name)
            .order_by(Turf.id)
            .limit(limit)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        if turf_id is not None:
            q = q.where(Turf.id == turf_id)
        if cursor:
            q = q.where(Turf.id > uuid.UUID(cursor))

        rows = (await session.execute(q)).mappings().all()
        return [
            TurfBreakdown(
                turf_id=r["turf_id"],
                turf_name=r["turf_name"],
                doors_knocked=r["doors_knocked"],
                contacts_made=r["contacts_made"],
                outcomes=_build_outcome(r),
            )
            for r in rows
        ]

    @staticmethod
    async def get_by_canvasser(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[CanvasserBreakdown]:
        rc = _result_code_col()
        outcome_cols = _outcome_columns()

        q = (
            select(
                VoterInteraction.created_by.label("user_id"),
                func.coalesce(User.display_name, VoterInteraction.created_by).label(
                    "display_name"
                ),
                func.count().label("doors_knocked"),
                func.count(case((rc.in_(list(CONTACT_RESULTS)), 1))).label(
                    "contacts_made"
                ),
                *[col.label(name) for name, col in outcome_cols.items()],
            )
            .select_from(VoterInteraction)
            .outerjoin(User, User.id == VoterInteraction.created_by)
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
            .group_by(VoterInteraction.created_by, User.display_name)
            .order_by(VoterInteraction.created_by)
            .limit(limit)
        )
        q = apply_date_filter(q, VoterInteraction.created_at, start_date, end_date)

        if cursor:
            q = q.where(VoterInteraction.created_by > cursor)

        rows = (await session.execute(q)).mappings().all()
        return [
            CanvasserBreakdown(
                user_id=r["user_id"],
                display_name=r["display_name"],
                doors_knocked=r["doors_knocked"],
                contacts_made=r["contacts_made"],
                outcomes=_build_outcome(r),
            )
            for r in rows
        ]
