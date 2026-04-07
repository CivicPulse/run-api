"""Service layer for org phone number inventory and Twilio API calls."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org_phone_number import OrgPhoneNumber
from app.models.organization import Organization
from app.schemas.org_phone_number import OrgPhoneNumberResponse
from app.services.twilio_config import TwilioConfigError, TwilioConfigService


class OrgPhoneNumberService:
    """Manages org-scoped phone number inventory with Twilio integration."""

    def __init__(self) -> None:
        self._twilio = TwilioConfigService()

    async def register_number(
        self,
        db: AsyncSession,
        org: Organization,
        phone_number: str,
    ) -> OrgPhoneNumber:
        """Register a BYO Twilio phone number for the org.

        Validates the number exists in the org's Twilio account and
        fetches its capabilities.
        """
        # Check for existing registration (fast path before Twilio call)
        existing = await db.scalar(
            select(OrgPhoneNumber).where(
                OrgPhoneNumber.org_id == org.id,
                OrgPhoneNumber.phone_number == phone_number,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number already registered for this organization",
            )

        # Get authenticated Twilio client
        try:
            client = self._twilio.get_twilio_client(org)
        except TwilioConfigError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        # Look up the number in the org's Twilio account
        from twilio.base.exceptions import TwilioRestException

        try:
            numbers = await asyncio.to_thread(
                client.incoming_phone_numbers.list,
                phone_number=phone_number,
                limit=1,
            )
        except TwilioRestException as exc:
            if exc.status in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "Twilio credential error -- "
                        "verify your Account SID and Auth Token"
                    ),
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Twilio API error",
            ) from exc

        if not numbers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found in your Twilio account",
            )

        twilio_num = numbers[0]
        caps = twilio_num.capabilities or {}

        # Determine phone type from Twilio metadata
        phone_type = "unknown"
        if hasattr(twilio_num, "address_requirements"):
            addr_req = getattr(twilio_num, "address_requirements", None)
            if addr_req == "none":
                phone_type = "local"

        row = OrgPhoneNumber(
            org_id=org.id,
            phone_number=twilio_num.phone_number,
            friendly_name=twilio_num.friendly_name,
            phone_type=phone_type,
            voice_capable=bool(caps.get("voice")),
            sms_capable=bool(caps.get("sms")),
            mms_capable=bool(caps.get("mms")),
            twilio_sid=twilio_num.sid,
            capabilities_synced_at=datetime.now(UTC),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def list_numbers(
        self,
        db: AsyncSession,
        org_id: uuid.UUID,
    ) -> list[OrgPhoneNumber]:
        """List all phone numbers registered for the given org."""
        result = await db.execute(
            select(OrgPhoneNumber)
            .where(OrgPhoneNumber.org_id == org_id)
            .order_by(OrgPhoneNumber.created_at)
        )
        return list(result.scalars().all())

    async def delete_number(
        self,
        db: AsyncSession,
        org: Organization,
        number_id: uuid.UUID,
    ) -> None:
        """Delete a phone number, clearing default FKs if applicable."""
        row = await db.scalar(
            select(OrgPhoneNumber).where(
                OrgPhoneNumber.id == number_id,
                OrgPhoneNumber.org_id == org.id,
            )
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found",
            )

        # Clear default FKs if this number was a default
        if org.default_voice_number_id == number_id:
            org.default_voice_number_id = None
        if org.default_sms_number_id == number_id:
            org.default_sms_number_id = None

        await db.delete(row)
        await db.commit()

    async def sync_number(
        self,
        db: AsyncSession,
        org: Organization,
        number_id: uuid.UUID,
    ) -> OrgPhoneNumber:
        """Re-fetch capabilities from Twilio for a registered number."""
        row = await db.scalar(
            select(OrgPhoneNumber).where(
                OrgPhoneNumber.id == number_id,
                OrgPhoneNumber.org_id == org.id,
            )
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found",
            )

        try:
            client = self._twilio.get_twilio_client(org)
        except TwilioConfigError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        from twilio.base.exceptions import TwilioRestException

        try:
            twilio_num = await asyncio.to_thread(
                client.incoming_phone_numbers(row.twilio_sid).fetch,
            )
        except TwilioRestException as exc:
            if exc.status == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Phone number no longer exists in Twilio account",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Twilio API error",
            ) from exc

        caps = twilio_num.capabilities or {}
        row.voice_capable = bool(caps.get("voice"))
        row.sms_capable = bool(caps.get("sms"))
        row.mms_capable = bool(caps.get("mms"))
        row.friendly_name = twilio_num.friendly_name
        row.capabilities_synced_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(row)
        return row

    async def set_default(
        self,
        db: AsyncSession,
        org: Organization,
        number_id: uuid.UUID,
        capability: str,
    ) -> None:
        """Set a phone number as the org default for voice or sms."""
        row = await db.scalar(
            select(OrgPhoneNumber).where(
                OrgPhoneNumber.id == number_id,
                OrgPhoneNumber.org_id == org.id,
            )
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Phone number not found",
            )

        # Validate the number has the requested capability
        if capability == "voice" and not row.voice_capable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number does not support voice",
            )
        if capability == "sms" and not row.sms_capable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number does not support SMS",
            )

        if capability == "voice":
            org.default_voice_number_id = number_id
        elif capability == "sms":
            org.default_sms_number_id = number_id

        await db.commit()

    def enrich_response(
        self,
        number: OrgPhoneNumber,
        org: Organization,
    ) -> OrgPhoneNumberResponse:
        """Build response with computed is_default_voice/sms fields."""
        return OrgPhoneNumberResponse(
            id=number.id,
            phone_number=number.phone_number,
            friendly_name=number.friendly_name,
            phone_type=number.phone_type,
            voice_capable=number.voice_capable,
            sms_capable=number.sms_capable,
            mms_capable=number.mms_capable,
            twilio_sid=number.twilio_sid,
            capabilities_synced_at=number.capabilities_synced_at,
            created_at=number.created_at,
            is_default_voice=org.default_voice_number_id == number.id,
            is_default_sms=org.default_sms_number_id == number.id,
        )
