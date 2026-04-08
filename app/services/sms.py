"""SMS domain service foundation."""

from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select

from app.core.time import utcnow
from app.models.campaign import Campaign
from app.models.org_phone_number import OrgPhoneNumber
from app.models.sms_conversation import SMSConversation
from app.models.sms_message import SMSMessage
from app.models.sms_opt_out import SMSOptOut
from app.models.voter_contact import VoterPhone
from app.schemas.sms import SMSEligibilityResponse
from app.services.communication_budget import CommunicationBudgetService
from app.services.phone_validation import PhoneValidationService
from app.services.twilio_config import TwilioConfigService

PHONE_DIGITS_RE = re.compile(r"\D+")
STOP_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}
START_KEYWORDS = {"START", "UNSTOP"}


class SMSServiceError(RuntimeError):
    """Raised when SMS configuration or state prevents an operation."""


@dataclass(slots=True)
class SMSOptOutDecision:
    """Normalized keyword interpretation."""

    status: str
    source: str = "twilio_keyword"


class SMSService:
    """Shared SMS helpers for later API and webhook plans."""

    def __init__(self) -> None:
        self._twilio_config = TwilioConfigService()
        self._budget_service = CommunicationBudgetService()
        self._phone_validation = PhoneValidationService()

    def normalize_phone_number(self, phone: str) -> str:
        """Normalize user/provider input into a Twilio-friendly E.164-ish value."""
        digits = PHONE_DIGITS_RE.sub("", phone or "")
        if not digits:
            return ""
        if len(digits) == 10:
            digits = f"1{digits}"
        return f"+{digits}"

    async def resolve_default_sender(
        self,
        db,
        org,
    ) -> OrgPhoneNumber:
        """Return the org's configured default SMS sender number."""
        sender_id = getattr(org, "default_sms_number_id", None)
        if sender_id is None:
            raise SMSServiceError("Organization does not have a default SMS number")

        sender = await db.get(OrgPhoneNumber, sender_id)
        if sender is None or not sender.sms_capable:
            raise SMSServiceError("Default SMS number is missing or not SMS-capable")
        return sender

    async def check_eligibility(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
        voter_phone_id: uuid.UUID,
        org_id: uuid.UUID | None = None,
    ) -> SMSEligibilityResponse:
        """Determine if a voter phone can receive SMS for the current phase."""
        phone = await db.scalar(
            select(VoterPhone).where(
                VoterPhone.id == voter_phone_id,
                VoterPhone.campaign_id == campaign_id,
            )
        )
        if phone is None:
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="phone_not_found",
                reason_detail=(
                    "The selected voter phone does not exist in this campaign."
                ),
            )

        normalized = self.normalize_phone_number(phone.value)
        phone_type = (phone.type or "").lower()
        if phone_type not in {"cell", "mobile"}:
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="missing_mobile_signal",
                reason_detail=(
                    "Only mobile or cell phone numbers can be used "
                    "for SMS outreach."
                ),
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
            )

        if not getattr(phone, "sms_allowed", False):
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="missing_sms_consent",
                reason_detail=(
                    "This phone does not have an explicit SMS eligibility "
                    "signal yet."
                ),
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
            )

        validation = await self._phone_validation.get_validation_summary(
            db,
            campaign_id=campaign_id,
            phone_number=phone.value,
            refresh_if_stale=True,
        )
        validation_block = self._validation_gate_response(
            phone=phone,
            validation=validation,
            normalized=normalized,
        )
        if validation_block is not None:
            return validation_block

        opt_out_query = select(SMSOptOut).where(
            SMSOptOut.normalized_phone_number == normalized,
        )
        if org_id is not None:
            opt_out_query = opt_out_query.where(SMSOptOut.org_id == org_id)

        opt_out = await db.scalar(opt_out_query)
        if opt_out is not None and opt_out.status == "opted_out":
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="opted_out",
                reason_detail="This number has opted out of SMS outreach.",
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
                opt_out_status=opt_out.status,
                validation=validation,
            )

        return SMSEligibilityResponse(
            allowed=True,
            voter_phone_id=phone.id,
            normalized_phone_number=normalized,
            opt_out_status=opt_out.status if opt_out is not None else "active",
            validation=validation,
        )

    def _validation_gate_response(
        self,
        *,
        phone: VoterPhone,
        validation,
        normalized: str,
    ) -> SMSEligibilityResponse | None:
        if validation.sms_capable and not validation.is_stale:
            return None

        if validation.status == "landline":
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="phone_not_sms_safe",
                reason_detail=validation.reason_detail,
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
                validation=validation,
            )
        if validation.status == "review_needed":
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="phone_validation_review_needed",
                reason_detail=validation.reason_detail,
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
                validation=validation,
            )
        if validation.is_stale:
            return SMSEligibilityResponse(
                allowed=False,
                reason_code="phone_validation_stale",
                reason_detail=validation.reason_detail,
                voter_phone_id=phone.id,
                normalized_phone_number=normalized,
                validation=validation,
            )
        return SMSEligibilityResponse(
            allowed=False,
            reason_code="phone_validation_pending",
            reason_detail=validation.reason_detail,
            voter_phone_id=phone.id,
            normalized_phone_number=normalized,
            validation=validation,
        )

    async def get_voter_phone(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
        voter_phone_id: uuid.UUID,
    ) -> VoterPhone | None:
        """Load a campaign-scoped voter phone."""
        return await db.scalar(
            select(VoterPhone).where(
                VoterPhone.id == voter_phone_id,
                VoterPhone.campaign_id == campaign_id,
            )
        )

    async def get_org_phone_number(
        self,
        db,
        *,
        org_id: uuid.UUID,
        phone_number: str,
    ) -> OrgPhoneNumber | None:
        """Load an org-owned Twilio phone number row."""
        normalized = self.normalize_phone_number(phone_number)
        return await db.scalar(
            select(OrgPhoneNumber).where(
                OrgPhoneNumber.org_id == org_id,
                OrgPhoneNumber.phone_number == normalized,
            )
        )

    async def find_voter_phone_for_org(
        self,
        db,
        *,
        org_id: uuid.UUID,
        normalized_phone_number: str,
    ) -> VoterPhone | None:
        """Find the best org-owned voter phone match for an inbound sender."""
        result = await db.execute(
            select(VoterPhone)
            .join(Campaign, Campaign.id == VoterPhone.campaign_id)
            .where(Campaign.organization_id == org_id)
        )
        candidates = [
            phone
            for phone in result.scalars().all()
            if self.normalize_phone_number(phone.value) == normalized_phone_number
        ]
        candidates.sort(
            key=lambda phone: (
                not getattr(phone, "sms_allowed", False),
                not getattr(phone, "is_primary", False),
                str(phone.campaign_id),
                str(phone.id),
            )
        )
        return candidates[0] if candidates else None

    async def get_or_create_conversation(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
        org_id: uuid.UUID,
        voter_id: uuid.UUID,
        voter_phone_id: uuid.UUID | None,
        org_phone_number_id: uuid.UUID,
        normalized_to_number: str,
    ) -> SMSConversation:
        """Reuse or create the unique conversation aggregate row."""
        existing = await db.scalar(
            select(SMSConversation).where(
                SMSConversation.campaign_id == campaign_id,
                SMSConversation.voter_id == voter_id,
                SMSConversation.org_phone_number_id == org_phone_number_id,
            )
        )
        if existing is not None:
            existing.voter_phone_id = voter_phone_id
            existing.normalized_to_number = normalized_to_number
            existing.updated_at = utcnow()
            await db.flush()
            return existing

        conversation = SMSConversation(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            org_id=org_id,
            voter_id=voter_id,
            voter_phone_id=voter_phone_id,
            org_phone_number_id=org_phone_number_id,
            normalized_to_number=normalized_to_number,
            last_message_direction="outbound",
            last_message_status="queued",
            unread_count=0,
            opt_out_status="active",
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(conversation)
        await db.flush()
        return conversation

    async def record_message(
        self,
        db,
        *,
        conversation: SMSConversation,
        direction: str,
        body: str,
        from_number: str,
        to_number: str,
        provider_status: str,
        twilio_message_sid: str | None = None,
        sent_by_user_id: str | None = None,
        queued_job_id: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> SMSMessage:
        """Append an immutable message row and update inbox-friendly summary fields."""
        now = utcnow()
        message = SMSMessage(
            id=uuid.uuid4(),
            campaign_id=conversation.campaign_id,
            conversation_id=conversation.id,
            direction=direction,
            body=body,
            message_type="text",
            provider_status=provider_status,
            twilio_message_sid=twilio_message_sid,
            from_number=from_number,
            to_number=to_number,
            error_code=error_code,
            error_message=error_message,
            sent_by_user_id=sent_by_user_id,
            queued_job_id=queued_job_id,
            created_at=now,
        )
        db.add(message)

        conversation.last_message_preview = body[:160]
        conversation.last_message_direction = direction
        conversation.last_message_status = provider_status
        conversation.last_message_at = now
        if direction == "inbound":
            conversation.unread_count += 1
        conversation.updated_at = now
        await db.flush()
        return message

    async def send_single_sms(
        self,
        db,
        org,
        *,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        voter_phone_id: uuid.UUID,
        body: str,
        sent_by_user_id: str | None = None,
    ) -> tuple[SMSConversation, SMSMessage, SMSEligibilityResponse]:
        """Send one SMS and persist the canonical message row."""
        eligibility = await self.check_eligibility(
            db,
            campaign_id=campaign_id,
            voter_phone_id=voter_phone_id,
            org_id=org.id,
        )
        if not eligibility.allowed:
            raise SMSServiceError(eligibility.reason_detail or "SMS blocked")

        phone = await self.get_voter_phone(
            db,
            campaign_id=campaign_id,
            voter_phone_id=voter_phone_id,
        )
        if phone is None:
            raise SMSServiceError("Voter phone not found")

        sender = await self.resolve_default_sender(db, org)
        conversation = await self.get_or_create_conversation(
            db,
            campaign_id=campaign_id,
            org_id=org.id,
            voter_id=voter_id,
            voter_phone_id=voter_phone_id,
            org_phone_number_id=sender.id,
            normalized_to_number=eligibility.normalized_phone_number or "",
        )

        client = self._twilio_config.get_twilio_client(org)
        provider_message = await asyncio.to_thread(
            client.messages.create,
            body=body,
            from_=sender.phone_number,
            to=eligibility.normalized_phone_number,
        )
        message = await self.record_message(
            db,
            conversation=conversation,
            direction="outbound",
            body=body,
            from_number=sender.phone_number,
            to_number=eligibility.normalized_phone_number or phone.value,
            provider_status=getattr(provider_message, "status", "queued"),
            twilio_message_sid=getattr(provider_message, "sid", None),
            sent_by_user_id=sent_by_user_id,
        )
        await self._budget_service.record_event(
            db,
            org_id=org.id,
            campaign_id=campaign_id,
            voter_id=voter_id,
            channel="sms",
            event_type="sms.message",
            provider_sid=getattr(provider_message, "sid", None),
            provider_status=getattr(provider_message, "status", "queued"),
            pending_cost=True,
            metadata_json={
                "conversation_id": str(conversation.id),
                "message_id": str(message.id),
                "to_number": eligibility.normalized_phone_number,
            },
        )
        return conversation, message, eligibility

    async def list_conversations(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
    ) -> list[SMSConversation]:
        """Return inbox conversation rows ordered by recency."""
        result = await db.execute(
            select(SMSConversation)
            .where(SMSConversation.campaign_id == campaign_id)
            .order_by(
                SMSConversation.last_message_at.desc(),
                SMSConversation.id.desc(),
            )
        )
        return list(result.scalars().all())

    async def get_conversation_detail(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> tuple[SMSConversation, list[SMSMessage], SMSEligibilityResponse]:
        """Load a conversation, its messages, and current eligibility state."""
        conversation = await db.scalar(
            select(SMSConversation).where(
                SMSConversation.id == conversation_id,
                SMSConversation.campaign_id == campaign_id,
            )
        )
        if conversation is None:
            raise SMSServiceError("Conversation not found")

        result = await db.execute(
            select(SMSMessage)
            .where(SMSMessage.conversation_id == conversation.id)
            .order_by(SMSMessage.created_at.asc(), SMSMessage.id.asc())
        )
        messages = list(result.scalars().all())

        if conversation.voter_phone_id is None:
            eligibility = SMSEligibilityResponse(
                allowed=False,
                reason_code="phone_not_found",
                reason_detail="Conversation no longer has a linked voter phone.",
                opt_out_status=conversation.opt_out_status,
            )
        else:
            eligibility = await self.check_eligibility(
                db,
                campaign_id=campaign_id,
                voter_phone_id=conversation.voter_phone_id,
                org_id=conversation.org_id,
            )

        return conversation, messages, eligibility

    async def mark_conversation_read(
        self,
        db,
        *,
        campaign_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> SMSConversation:
        """Clear unread count after the operator opens the thread."""
        conversation = await db.scalar(
            select(SMSConversation).where(
                SMSConversation.id == conversation_id,
                SMSConversation.campaign_id == campaign_id,
            )
        )
        if conversation is None:
            raise SMSServiceError("Conversation not found")
        conversation.unread_count = 0
        conversation.updated_at = utcnow()
        await db.flush()
        return conversation

    async def find_inbound_conversation(
        self,
        db,
        *,
        org_id: uuid.UUID,
        to_number: str,
        from_number: str,
    ) -> tuple[SMSConversation, OrgPhoneNumber]:
        """Resolve the conversation that should receive an inbound reply."""
        org_phone = await self.get_org_phone_number(
            db,
            org_id=org_id,
            phone_number=to_number,
        )
        if org_phone is None:
            raise SMSServiceError(
                "Inbound SMS target number is not registered to this org"
            )

        normalized_from = self.normalize_phone_number(from_number)
        conversation = await db.scalar(
            select(SMSConversation)
            .where(
                SMSConversation.org_id == org_id,
                SMSConversation.org_phone_number_id == org_phone.id,
                SMSConversation.normalized_to_number == normalized_from,
            )
            .order_by(SMSConversation.last_message_at.desc(), SMSConversation.id.desc())
        )
        if conversation is None:
            raise SMSServiceError(
                "No matching SMS conversation found for inbound reply"
            )

        return conversation, org_phone

    async def process_inbound_message(
        self,
        db,
        org,
        *,
        from_number: str,
        to_number: str,
        body: str,
        message_sid: str,
    ) -> tuple[SMSConversation, SMSMessage] | None:
        """Thread an inbound webhook payload into the matching SMS conversation."""
        normalized_from = self.normalize_phone_number(from_number)
        try:
            conversation, org_phone = await self.find_inbound_conversation(
                db,
                org_id=org.id,
                to_number=to_number,
                from_number=normalized_from,
            )
        except SMSServiceError:
            org_phone = await self.get_org_phone_number(
                db,
                org_id=org.id,
                phone_number=to_number,
            )
            if org_phone is None:
                raise

            voter_phone = await self.find_voter_phone_for_org(
                db,
                org_id=org.id,
                normalized_phone_number=normalized_from,
            )
            if voter_phone is None:
                return None

            conversation = await self.get_or_create_conversation(
                db,
                campaign_id=voter_phone.campaign_id,
                org_id=org.id,
                voter_id=voter_phone.voter_id,
                voter_phone_id=voter_phone.id,
                org_phone_number_id=org_phone.id,
                normalized_to_number=normalized_from,
            )

        keyword = (body or "").strip().upper()
        if keyword and self.keyword_decision(keyword) is not None:
            await self.apply_opt_out_keyword(
                db,
                org_id=org.id,
                normalized_phone_number=normalized_from,
                keyword=keyword,
                message_sid=message_sid,
            )
            conversation = await self.sync_conversation_opt_out(
                db,
                conversation_id=conversation.id,
                org_id=org.id,
                normalized_phone_number=normalized_from,
            )

        message = await self.record_message(
            db,
            conversation=conversation,
            direction="inbound",
            body=body,
            from_number=normalized_from or from_number,
            to_number=org_phone.phone_number,
            provider_status="received",
            twilio_message_sid=message_sid,
        )
        return conversation, message

    def keyword_decision(self, keyword: str) -> SMSOptOutDecision | None:
        """Return the desired opt-out state for a keyword, if any."""
        normalized = (keyword or "").strip().upper()
        if normalized in STOP_KEYWORDS:
            return SMSOptOutDecision(status="opted_out")
        if normalized in START_KEYWORDS:
            return SMSOptOutDecision(status="active")
        return None

    async def apply_opt_out_keyword(
        self,
        db,
        *,
        org_id: uuid.UUID,
        normalized_phone_number: str,
        keyword: str,
        message_sid: str,
    ) -> SMSOptOut:
        """Persist SMS opt-out or opt-in state from a Twilio keyword."""
        decision = self.keyword_decision(keyword)
        if decision is None:
            raise SMSServiceError(f"Unsupported keyword: {keyword}")

        opt_out = await db.scalar(
            select(SMSOptOut).where(
                SMSOptOut.org_id == org_id,
                SMSOptOut.normalized_phone_number == normalized_phone_number,
            )
        )
        now = utcnow()
        if opt_out is None:
            opt_out = SMSOptOut(
                id=uuid.uuid4(),
                org_id=org_id,
                normalized_phone_number=normalized_phone_number,
                status=decision.status,
                source=decision.source,
                keyword=keyword.strip().upper(),
                updated_by_message_sid=message_sid,
                updated_at=now,
            )
            db.add(opt_out)
        else:
            opt_out.status = decision.status
            opt_out.source = decision.source
            opt_out.keyword = keyword.strip().upper()
            opt_out.updated_by_message_sid = message_sid
            opt_out.updated_at = now

        await db.flush()
        return opt_out

    async def sync_conversation_opt_out(
        self,
        db,
        *,
        conversation_id: uuid.UUID,
        org_id: uuid.UUID,
        normalized_phone_number: str,
    ) -> SMSConversation:
        """Mirror the org-scoped SMS preference state onto a conversation row."""
        conversation = await db.get(SMSConversation, conversation_id)
        if conversation is None:
            raise SMSServiceError("Conversation not found")

        opt_out = await db.scalar(
            select(SMSOptOut).where(
                SMSOptOut.org_id == org_id,
                SMSOptOut.normalized_phone_number == normalized_phone_number,
            )
        )
        conversation.opt_out_status = (
            opt_out.status if opt_out is not None else "active"
        )
        conversation.opted_out_at = (
            opt_out.updated_at
            if opt_out is not None and opt_out.status == "opted_out"
            else None
        )
        conversation.opt_out_source = opt_out.source if opt_out is not None else None
        conversation.updated_at = utcnow()
        await db.flush()
        return conversation

    async def update_delivery_status(
        self,
        db,
        *,
        twilio_message_sid: str,
        provider_status: str,
        error_code: str | None = None,
        error_message: str | None = None,
        delivered_at: datetime | None = None,
    ) -> SMSMessage | None:
        """Update a message row from a provider callback."""
        message = await db.scalar(
            select(SMSMessage).where(
                SMSMessage.twilio_message_sid == twilio_message_sid,
            )
        )
        if message is None:
            return None

        message.provider_status = provider_status
        message.error_code = error_code
        message.error_message = error_message
        if delivered_at is not None:
            message.delivered_at = delivered_at
        elif provider_status in {"delivered", "read"}:
            message.delivered_at = utcnow()

        conversation = await db.get(SMSConversation, message.conversation_id)
        if conversation is not None:
            conversation.last_message_status = provider_status
            conversation.updated_at = utcnow()

        await self._budget_service.reconcile_event(
            db,
            provider_sid=twilio_message_sid,
            event_type="sms.message",
            provider_status=provider_status,
        )
        await db.flush()
        return message
