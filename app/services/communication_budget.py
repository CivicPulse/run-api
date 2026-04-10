"""Shared spend control and communication telemetry helpers."""

from __future__ import annotations

import inspect
import uuid
from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.communication_ledger import CommunicationLedger
from app.models.organization import Organization
from app.schemas.org import TwilioBudgetActivity, TwilioBudgetSummary


@dataclass(slots=True)
class BudgetGateDecision:
    """Machine-readable spend gate decision."""

    allowed: bool
    state: str
    reason_code: str | None
    reason_detail: str | None
    summary: TwilioBudgetSummary


class CommunicationBudgetService:
    """Calculates spend state and records billable communication events."""

    async def get_budget_summary(
        self,
        db: AsyncSession,
        org: Organization,
    ) -> TwilioBudgetSummary:
        stmt = select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            CommunicationLedger.pending_cost.is_(False),
                            CommunicationLedger.cost_cents,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("finalized_spend_cents"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            CommunicationLedger.pending_cost.is_(True),
                            CommunicationLedger.cost_cents,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("pending_spend_cents"),
            func.coalesce(
                func.sum(
                    case((CommunicationLedger.pending_cost.is_(True), 1), else_=0)
                ),
                0,
            ).label("pending_item_count"),
            func.max(CommunicationLedger.updated_at).label("updated_at"),
        ).where(CommunicationLedger.org_id == org.id)
        result = await db.execute(stmt)
        row = result.one()
        if inspect.isawaitable(row):
            row = await row
        return self._build_summary(
            org=org,
            finalized_spend_cents=int(getattr(row, "finalized_spend_cents", 0) or 0),
            pending_spend_cents=int(getattr(row, "pending_spend_cents", 0) or 0),
            pending_item_count=int(getattr(row, "pending_item_count", 0) or 0),
            updated_at=getattr(row, "updated_at", None)
            or getattr(org, "twilio_budget_updated_at", None),
        )

    async def list_recent_activity(
        self,
        db: AsyncSession,
        *,
        org_id: uuid.UUID,
        limit: int = 10,
    ) -> list[TwilioBudgetActivity]:
        result = await db.execute(
            select(CommunicationLedger)
            .where(CommunicationLedger.org_id == org_id)
            .order_by(
                CommunicationLedger.created_at.desc(), CommunicationLedger.id.desc()
            )
            .limit(limit)
        )
        scalars = result.scalars()
        if inspect.isawaitable(scalars):
            scalars = await scalars
        rows = scalars.all()
        if inspect.isawaitable(rows):
            rows = await rows
        return [TwilioBudgetActivity.model_validate(row) for row in rows]

    async def evaluate_gate(
        self,
        db: AsyncSession,
        org: Organization,
        *,
        estimated_additional_cents: int = 0,
    ) -> BudgetGateDecision:
        summary = await self.get_budget_summary(db, org)
        if not summary.configured or summary.soft_budget_cents is None:
            state = "cost_pending" if summary.pending_item_count > 0 else "healthy"
            summary.state = state
            return BudgetGateDecision(
                allowed=True,
                state=state,
                reason_code="cost_pending" if state == "cost_pending" else None,
                reason_detail=(
                    "Some communication costs are still pending final Twilio pricing."
                    if state == "cost_pending"
                    else None
                ),
                summary=summary,
            )

        projected_total = summary.estimated_total_spend_cents + max(
            estimated_additional_cents,
            0,
        )
        if projected_total >= summary.soft_budget_cents:
            summary.state = "over_limit"
            return BudgetGateDecision(
                allowed=False,
                state="over_limit",
                reason_code="budget_over_limit",
                reason_detail=(
                    "This organization has exceeded its Twilio soft budget. "
                    "An org owner must raise the limit before new voice or SMS "
                    "activity can start."
                ),
                summary=summary,
            )

        if (
            summary.warning_threshold_cents is not None
            and projected_total >= summary.warning_threshold_cents
        ):
            summary.state = "near_limit"
            return BudgetGateDecision(
                allowed=True,
                state="near_limit",
                reason_code="budget_near_limit",
                reason_detail=(
                    "This organization is approaching its Twilio soft budget."
                ),
                summary=summary,
            )

        if summary.pending_item_count > 0:
            summary.state = "cost_pending"
            return BudgetGateDecision(
                allowed=True,
                state="cost_pending",
                reason_code="cost_pending",
                reason_detail=(
                    "Some communication costs are still pending final Twilio pricing."
                ),
                summary=summary,
            )

        summary.state = "healthy"
        return BudgetGateDecision(
            allowed=True,
            state="healthy",
            reason_code=None,
            reason_detail=None,
            summary=summary,
        )

    async def record_event(
        self,
        db: AsyncSession,
        *,
        org_id: uuid.UUID,
        campaign_id: uuid.UUID | None,
        voter_id: uuid.UUID | None,
        channel: str,
        event_type: str,
        provider_sid: str | None,
        provider_status: str | None,
        cost_cents: int | None = None,
        pending_cost: bool = True,
        metadata_json: dict | None = None,
        notes: str | None = None,
    ) -> CommunicationLedger:
        row = CommunicationLedger(
            id=uuid.uuid4(),
            org_id=org_id,
            campaign_id=campaign_id,
            voter_id=voter_id,
            channel=channel,
            event_type=event_type,
            provider_sid=provider_sid,
            provider_status=provider_status,
            cost_cents=cost_cents,
            pending_cost=pending_cost,
            metadata_json=metadata_json,
            notes=notes,
        )
        added = db.add(row)
        if inspect.isawaitable(added):
            await added
        await db.flush()
        return row

    async def reconcile_event(
        self,
        db: AsyncSession,
        *,
        provider_sid: str,
        event_type: str,
        provider_status: str | None = None,
        cost_cents: int | None = None,
        metadata_json: dict | None = None,
    ) -> CommunicationLedger | None:
        result = await db.execute(
            select(CommunicationLedger)
            .where(
                CommunicationLedger.provider_sid == provider_sid,
                CommunicationLedger.event_type == event_type,
            )
            .order_by(
                CommunicationLedger.created_at.desc(), CommunicationLedger.id.desc()
            )
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if inspect.isawaitable(row):
            row = await row
        if row is None:
            return None
        if provider_status is not None:
            row.provider_status = provider_status
        if cost_cents is not None:
            row.cost_cents = cost_cents
        current_pending = getattr(row, "pending_cost", True)
        if not isinstance(current_pending, bool):
            current_pending = True
        row.pending_cost = (
            cost_cents is None and current_pending
            if provider_status
            not in {
                "delivered",
                "read",
                "completed",
                "busy",
                "no-answer",
                "failed",
                "canceled",
                "undelivered",
            }
            else False
        )
        if metadata_json:
            current_metadata = getattr(row, "metadata_json", None)
            if not isinstance(current_metadata, dict):
                current_metadata = {}
            row.metadata_json = {**current_metadata, **metadata_json}
        row.updated_at = utcnow()
        await db.flush()
        return row

    def _build_summary(
        self,
        *,
        org: Organization,
        finalized_spend_cents: int,
        pending_spend_cents: int,
        pending_item_count: int,
        updated_at,
    ) -> TwilioBudgetSummary:
        raw_soft_budget_cents = getattr(org, "twilio_soft_budget_cents", None)
        soft_budget_cents = (
            int(raw_soft_budget_cents)
            if isinstance(raw_soft_budget_cents, int)
            else None
        )
        raw_warning_percent = getattr(org, "twilio_budget_warning_percent", 80)
        warning_percent = (
            int(raw_warning_percent) if isinstance(raw_warning_percent, int) else 80
        )
        estimated_total = finalized_spend_cents + pending_spend_cents
        warning_threshold = None
        remaining_budget = None
        state = "healthy"
        if soft_budget_cents is not None:
            warning_threshold = int(soft_budget_cents * (warning_percent / 100))
            remaining_budget = soft_budget_cents - estimated_total
            if estimated_total >= soft_budget_cents:
                state = "over_limit"
            elif estimated_total >= warning_threshold:
                state = "near_limit"
            elif pending_item_count > 0:
                state = "cost_pending"
        elif pending_item_count > 0:
            state = "cost_pending"
        return TwilioBudgetSummary(
            configured=soft_budget_cents is not None,
            soft_budget_cents=soft_budget_cents,
            warning_percent=warning_percent,
            state=state,
            finalized_spend_cents=finalized_spend_cents,
            pending_spend_cents=pending_spend_cents,
            pending_item_count=pending_item_count,
            estimated_total_spend_cents=estimated_total,
            remaining_budget_cents=remaining_budget,
            warning_threshold_cents=warning_threshold,
            updated_at=updated_at,
        )
