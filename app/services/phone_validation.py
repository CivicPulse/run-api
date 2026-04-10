"""Shared Twilio Lookup cache service for contact and SMS flows."""

from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.campaign import Campaign
from app.models.organization import Organization
from app.models.phone_validation import PhoneValidation
from app.schemas.voter_contact import PhoneValidationSummary
from app.services.twilio_config import TwilioConfigError, TwilioConfigService

PHONE_DIGITS_RE = re.compile(r"\D+")
VALIDATION_TTL_DAYS = 90


@dataclass(slots=True)
class ValidationResult:
    """Internal refresh result with summary and persisted cache row."""

    summary: PhoneValidationSummary
    cache: PhoneValidation | None = None


class PhoneValidationService:
    """Manage the campaign-scoped Twilio Lookup cache."""

    def __init__(self) -> None:
        self._twilio = TwilioConfigService()

    def normalize_phone_number(self, phone_number: str) -> str:
        """Normalize user input into a Twilio-friendly E.164-ish string."""
        digits = PHONE_DIGITS_RE.sub("", phone_number or "")
        if not digits:
            return ""
        if len(digits) == 10:
            digits = f"1{digits}"
        return f"+{digits}"

    async def get_validation_summary(
        self,
        session: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        phone_number: str,
        refresh_if_stale: bool = False,
    ) -> PhoneValidationSummary:
        """Return cached validation state, optionally refreshing stale rows."""
        normalized = self.normalize_phone_number(phone_number)
        if not normalized:
            return PhoneValidationSummary(
                normalized_phone_number="",
                status="review_needed",
                is_stale=False,
                reason_code="invalid_phone_number",
                reason_detail=(
                    "The phone number could not be normalized for validation."
                ),
            )

        cache = await self._get_cache_row(
            session,
            campaign_id=campaign_id,
            normalized_phone_number=normalized,
        )
        if cache is not None and (not self._is_stale(cache) or not refresh_if_stale):
            return self._build_summary(cache, normalized_phone_number=normalized)

        refreshed = await self.refresh_validation(
            session,
            campaign_id=campaign_id,
            phone_number=phone_number,
            existing=cache,
        )
        return refreshed.summary

    async def refresh_validation(
        self,
        session: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        phone_number: str,
        existing: PhoneValidation | None = None,
    ) -> ValidationResult:
        """Refresh a cache row from Twilio Lookup, degrading safely on failure."""
        normalized = self.normalize_phone_number(phone_number)
        if not normalized:
            summary = PhoneValidationSummary(
                normalized_phone_number="",
                status="review_needed",
                is_stale=False,
                reason_code="invalid_phone_number",
                reason_detail=(
                    "The phone number could not be normalized for validation."
                ),
            )
            return ValidationResult(summary=summary, cache=existing)

        cache = existing or await self._get_cache_row(
            session,
            campaign_id=campaign_id,
            normalized_phone_number=normalized,
        )
        if cache is None:
            cache = PhoneValidation(
                campaign_id=campaign_id,
                normalized_phone_number=normalized,
                status="pending",
            )
            session.add(cache)

        lookup_started_at = utcnow()
        cache.last_lookup_attempt_at = lookup_started_at

        try:
            _campaign, org = await self._resolve_org(session, campaign_id)
            client = self._twilio.get_twilio_client(org)
            provider_payload = await asyncio.to_thread(
                self._fetch_lookup_payload,
                client,
                normalized,
            )
            self._apply_lookup_payload(cache, provider_payload)
        except TwilioConfigError:
            self._mark_lookup_issue(
                cache,
                status="pending",
                reason_code="lookup_unavailable",
                reason_detail=(
                    "Twilio Lookup is not configured for this organization yet."
                ),
                preserve_validated_at=True,
            )
        except Exception as exc:  # pragma: no cover - Twilio SDK errors are varied
            self._mark_lookup_issue(
                cache,
                status="pending" if cache.validated_at is None else cache.status,
                reason_code="lookup_unavailable",
                reason_detail=(
                    "Twilio Lookup is temporarily unavailable. Save can continue."
                ),
                preserve_validated_at=cache.validated_at is not None,
                error_message=str(exc),
            )

        await session.flush()
        return ValidationResult(
            summary=self._build_summary(cache, normalized_phone_number=normalized),
            cache=cache,
        )

    async def refresh_phone_validation(
        self,
        session: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        phone_number: str,
    ) -> PhoneValidationSummary:
        """Force-refresh a phone's cached lookup state."""
        result = await self.refresh_validation(
            session,
            campaign_id=campaign_id,
            phone_number=phone_number,
        )
        return result.summary

    async def _get_cache_row(
        self,
        session: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        normalized_phone_number: str,
    ) -> PhoneValidation | None:
        return await session.scalar(
            select(PhoneValidation).where(
                PhoneValidation.campaign_id == campaign_id,
                PhoneValidation.normalized_phone_number == normalized_phone_number,
            )
        )

    async def _resolve_org(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> tuple[Campaign, Organization]:
        row = await session.execute(
            select(Campaign, Organization)
            .join(Organization, Organization.id == Campaign.organization_id)
            .where(Campaign.id == campaign_id)
        )
        campaign, org = row.one()
        return campaign, org

    def _fetch_lookup_payload(
        self, client: Any, normalized_phone_number: str
    ) -> dict[str, Any]:
        """Fetch Lookup data and coerce it into a JSON-safe dict."""
        lookup = client.lookups.v2.phone_numbers(normalized_phone_number).fetch(
            fields="line_type_intelligence"
        )
        return self._as_dict(lookup)

    def _apply_lookup_payload(
        self,
        cache: PhoneValidation,
        provider_payload: dict[str, Any],
    ) -> None:
        line_type = self._extract_line_type(provider_payload)
        is_valid = provider_payload.get("valid")
        if line_type == "mobile":
            status = "validated"
            sms_capable = True
        elif line_type == "landline":
            status = "landline"
            sms_capable = False
        else:
            status = "review_needed"
            sms_capable = False

        cache.status = status
        cache.is_valid = is_valid if isinstance(is_valid, bool) else None
        cache.carrier_name = self._extract_carrier_name(provider_payload)
        cache.line_type = line_type
        cache.sms_capable = sms_capable
        cache.lookup_data = provider_payload
        cache.last_error_code = None
        cache.last_error_message = None
        cache.validated_at = utcnow()

    def _mark_lookup_issue(
        self,
        cache: PhoneValidation,
        *,
        status: str,
        reason_code: str,
        reason_detail: str,
        preserve_validated_at: bool,
        error_message: str | None = None,
    ) -> None:
        cache.status = status
        cache.last_error_code = reason_code
        cache.last_error_message = error_message or reason_detail
        if not preserve_validated_at:
            cache.validated_at = None

    def _build_summary(
        self,
        cache: PhoneValidation,
        *,
        normalized_phone_number: str,
    ) -> PhoneValidationSummary:
        stale = self._is_stale(cache)
        reason_code = cache.last_error_code
        reason_detail = None
        if cache.status == "landline":
            reason_code = "phone_not_sms_safe"
            reason_detail = "Twilio Lookup classifies this number as a landline."
        elif cache.status == "review_needed":
            reason_code = reason_code or "phone_validation_review_needed"
            reason_detail = (
                "Twilio Lookup could not confirm this number is safe for SMS."
            )
        elif cache.status == "pending":
            reason_code = reason_code or "phone_validation_pending"
            reason_detail = (
                "Twilio Lookup has not produced a reusable validation result yet."
            )
        if stale and cache.validated_at is not None:
            reason_code = "phone_validation_stale"
            reason_detail = (
                "Cached validation is getting old. "
                "Refresh to confirm the current line type."
            )
        return PhoneValidationSummary(
            normalized_phone_number=normalized_phone_number,
            status=cache.status,
            is_valid=cache.is_valid,
            carrier_name=cache.carrier_name,
            line_type=cache.line_type,
            sms_capable=cache.sms_capable,
            validated_at=cache.validated_at,
            is_stale=stale,
            reason_code=reason_code,
            reason_detail=reason_detail,
        )

    def _is_stale(self, cache: PhoneValidation) -> bool:
        if cache.validated_at is None:
            return True
        return cache.validated_at <= utcnow() - timedelta(days=VALIDATION_TTL_DAYS)

    def _extract_line_type(self, payload: dict[str, Any]) -> str | None:
        intelligence = payload.get("line_type_intelligence") or {}
        value = intelligence.get("type") or payload.get("line_type")
        if value is None:
            return None
        return str(value).lower()

    def _extract_carrier_name(self, payload: dict[str, Any]) -> str | None:
        intelligence = payload.get("line_type_intelligence") or {}
        value = intelligence.get("carrier_name") or payload.get("carrier_name")
        if value is None:
            return None
        return str(value)

    def _as_dict(self, payload: Any) -> dict[str, Any]:
        if isinstance(payload, dict):
            return payload
        if hasattr(payload, "_properties"):
            return dict(payload._properties)
        result: dict[str, Any] = {}
        for key in dir(payload):
            if key.startswith("_"):
                continue
            value = getattr(payload, key, None)
            if callable(value):
                continue
            if isinstance(value, (str, int, float, bool, dict, list, type(None))):
                result[key] = value
        return result
