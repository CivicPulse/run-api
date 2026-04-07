"""Voice calling service — token generation, compliance, call records."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core.time import utcnow
from app.models.call_record import CallRecord
from app.models.org_phone_number import OrgPhoneNumber
from app.schemas.voice import (
    CallingHoursCheck,
    DNCCheckResult,
    VoiceCapabilityResponse,
)
from app.services.dnc import DNCService
from app.services.twilio_config import TwilioConfigError, TwilioConfigService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class VoiceService:
    """Encapsulates browser voice calling logic.

    Responsibilities:
    - Twilio Access Token generation (API Key based)
    - Calling hours compliance check
    - DNC pre-call check
    - Call record CRUD
    - Voice capability readiness check
    """

    def __init__(self) -> None:
        self._twilio_config = TwilioConfigService()
        self._dnc_service = DNCService()

    # ------------------------------------------------------------------
    # Token generation
    # ------------------------------------------------------------------

    def generate_voice_token(
        self,
        org: object,
        user_id: str,
        ttl: int = 600,
    ) -> str:
        """Generate a Twilio Access Token for the browser dialer.

        Args:
            org: Organization model instance.
            user_id: The calling user's ID.
            ttl: Token lifetime in seconds (default 10 min).

        Returns:
            JWT string for Twilio Client SDK.

        Raises:
            TwilioConfigError: If org lacks voice credentials.
        """
        from twilio.jwt.access_token import AccessToken
        from twilio.jwt.access_token.grants import VoiceGrant

        creds = self._twilio_config.voice_credentials_for_org(org)
        if creds is None:
            raise TwilioConfigError(
                "Voice calling credentials not configured for this organization"
            )

        # Twilio identity must be alphanumeric + underscores
        identity = str(user_id).replace("-", "_")

        token = AccessToken(
            creds.account_sid,
            creds.api_key_sid,
            creds.api_key_secret,
            identity=identity,
            ttl=ttl,
        )
        voice_grant = VoiceGrant(
            outgoing_application_sid=creds.twiml_app_sid,
            incoming_allow=False,
        )
        token.add_grant(voice_grant)
        return token.to_jwt()

    # ------------------------------------------------------------------
    # Compliance checks
    # ------------------------------------------------------------------

    def check_calling_hours(self, campaign: object) -> CallingHoursCheck:
        """Check whether the current time falls within campaign calling hours.

        Args:
            campaign: Campaign model with calling_hours_start/end/timezone.

        Returns:
            CallingHoursCheck with allowed flag and window details.
        """
        tz_name = getattr(campaign, "calling_hours_timezone", "America/New_York")
        tz = ZoneInfo(tz_name)
        now = datetime.now(tz)
        current_time = now.time()

        start = getattr(campaign, "calling_hours_start", None)
        end = getattr(campaign, "calling_hours_end", None)

        if start is None or end is None:
            return CallingHoursCheck(allowed=True)

        allowed = start <= current_time <= end
        message = None
        if not allowed:
            message = (
                f"Outside calling hours. "
                f"Calls allowed {start.strftime('%H:%M')} - "
                f"{end.strftime('%H:%M')}. "
                f"Current time is {current_time.strftime('%H:%M')}."
            )

        return CallingHoursCheck(
            allowed=allowed,
            message=message,
            window_start=start.strftime("%H:%M"),
            window_end=end.strftime("%H:%M"),
            current_time=current_time.strftime("%H:%M"),
        )

    async def check_dnc(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        phone_number: str,
    ) -> DNCCheckResult:
        """Check whether a phone number is on the DNC list.

        Args:
            db: Async database session.
            campaign_id: Campaign UUID.
            phone_number: Number to check.

        Returns:
            DNCCheckResult with blocked flag and message.
        """
        resp = await self._dnc_service.check_number(db, campaign_id, phone_number)
        if resp.is_dnc:
            return DNCCheckResult(
                blocked=True,
                message="This number is on the DNC list and cannot be called.",
            )
        return DNCCheckResult(blocked=False, message=None)

    # ------------------------------------------------------------------
    # Call record CRUD
    # ------------------------------------------------------------------

    async def create_call_record(
        self,
        db: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        twilio_sid: str | None = None,
        voter_id: uuid.UUID | None = None,
        caller_user_id: str,
        phone_bank_session_id: uuid.UUID | None = None,
        from_number: str,
        to_number: str,
        status: str = "initiated",
    ) -> CallRecord:
        """Insert a new call record.

        Args:
            db: Async database session.
            campaign_id: Campaign UUID.
            twilio_sid: Twilio Call SID (may be set later via webhook).
            voter_id: Optional voter being called.
            caller_user_id: The user placing the call.
            phone_bank_session_id: Optional phone bank session.
            from_number: Caller ID number.
            to_number: Destination number.
            status: Initial call status.

        Returns:
            The created CallRecord.
        """
        record = CallRecord(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            twilio_sid=twilio_sid,
            voter_id=voter_id,
            caller_user_id=caller_user_id,
            phone_bank_session_id=phone_bank_session_id,
            from_number=from_number,
            to_number=to_number,
            status=status,
            started_at=utcnow(),
        )
        db.add(record)
        await db.flush()
        return record

    async def update_call_record_from_webhook(
        self,
        db: AsyncSession,
        *,
        twilio_sid: str,
        status: str,
        duration_seconds: int | None = None,
        ended_at: datetime | None = None,
        price_cents: int | None = None,
    ) -> CallRecord | None:
        """Update a call record by Twilio SID (idempotent).

        Args:
            db: Async database session.
            twilio_sid: The Twilio Call SID.
            status: New call status.
            duration_seconds: Call duration.
            ended_at: When the call ended.
            price_cents: Call cost in cents.

        Returns:
            Updated CallRecord, or None if not found.
        """
        result = await db.execute(
            select(CallRecord).where(CallRecord.twilio_sid == twilio_sid)
        )
        record = result.scalar_one_or_none()
        if record is None:
            return None

        record.status = status
        if duration_seconds is not None:
            record.duration_seconds = duration_seconds
        if ended_at is not None:
            record.ended_at = ended_at
        if price_cents is not None:
            record.price_cents = price_cents

        await db.flush()
        return record

    # ------------------------------------------------------------------
    # Capability check
    # ------------------------------------------------------------------

    async def check_voice_capability(
        self,
        db: AsyncSession,
        org: object,
    ) -> VoiceCapabilityResponse:
        """Check whether browser voice calling is available for this org.

        Requires: voice credentials configured AND at least one
        voice-capable OrgPhoneNumber.

        Args:
            db: Async database session.
            org: Organization model instance.

        Returns:
            VoiceCapabilityResponse with availability and reason.
        """
        creds = self._twilio_config.voice_credentials_for_org(org)
        if creds is None:
            return VoiceCapabilityResponse(
                browser_call_available=False,
                reason="Voice calling credentials not configured",
            )

        org_id = getattr(org, "id", None)
        result = await db.execute(
            select(func.count())
            .select_from(OrgPhoneNumber)
            .where(
                OrgPhoneNumber.org_id == org_id,
                OrgPhoneNumber.voice_capable.is_(True),
            )
        )
        count = result.scalar_one_or_none() or 0
        if count == 0:
            return VoiceCapabilityResponse(
                browser_call_available=False,
                reason="No voice-capable phone numbers configured",
            )

        return VoiceCapabilityResponse(
            browser_call_available=True,
            reason=None,
        )
