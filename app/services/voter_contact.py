"""Voter contact service -- phone, email, address CRUD with interaction events."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.time import utcnow
from app.models.voter_contact import VoterAddress, VoterEmail, VoterPhone
from app.models.voter_interaction import InteractionType
from app.services.phone_validation import PhoneValidationService
from app.services.voter_interaction import VoterInteractionService
from app.services.voter_search import VoterSearchIndexService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class VoterContactService:
    """Contact CRUD with primary flag management and interaction event emission.

    All add/update/delete operations emit a contact_updated interaction event
    to maintain an auditable history of contact changes.
    """

    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()
        self._search_index = VoterSearchIndexService()
        self._phone_validation = PhoneValidationService()

    # -----------------------------------------------------------------------
    # Phone
    # -----------------------------------------------------------------------

    async def add_phone(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        value: str,
        type: str,
        is_primary: bool,
        source: str,
        user_id: str,
    ) -> VoterPhone:
        """Add a phone contact for a voter.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID (for RLS).
            voter_id: Voter UUID.
            value: Phone number.
            type: Phone type (home/work/cell).
            is_primary: Whether this is the primary phone.
            source: Contact source (import/manual).
            user_id: ID of user performing the action.

        Returns:
            The created VoterPhone record.
        """
        if is_primary:
            await self._unset_primary(session, VoterPhone, campaign_id, voter_id)

        now = utcnow()
        phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value=value,
            type=type,
            is_primary=is_primary,
            source=source,
            created_at=now,
            updated_at=now,
        )
        session.add(phone)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={"action": "added", "contact_type": "phone", "value": value},
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])
        phone.validation = await self._phone_validation.refresh_phone_validation(
            session,
            campaign_id=campaign_id,
            phone_number=phone.value,
        )

        return phone

    async def update_phone(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        phone_id: uuid.UUID,
        user_id: str,
        **kwargs,
    ) -> VoterPhone:
        """Update an existing phone contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            phone_id: Phone record UUID.
            user_id: ID of user performing the action.
            **kwargs: Fields to update.

        Returns:
            The updated VoterPhone record.

        Raises:
            ValueError: If the phone record is not found.
        """
        phone = await self._get_contact(
            session, VoterPhone, phone_id, campaign_id, voter_id
        )

        if kwargs.get("is_primary"):
            await self._unset_primary(session, VoterPhone, campaign_id, voter_id)

        for key, val in kwargs.items():
            if hasattr(phone, key):
                setattr(phone, key, val)
        phone.updated_at = utcnow()
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "updated",
                "contact_type": "phone",
                "phone_id": str(phone_id),
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])
        phone.validation = await self._phone_validation.refresh_phone_validation(
            session,
            campaign_id=campaign_id,
            phone_number=phone.value,
        )

        return phone

    async def delete_phone(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        phone_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Delete a phone contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            phone_id: Phone record UUID.
            user_id: ID of user performing the action.

        Raises:
            ValueError: If the phone record is not found.
        """
        phone = await self._get_contact(
            session, VoterPhone, phone_id, campaign_id, voter_id
        )

        await session.delete(phone)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "removed",
                "contact_type": "phone",
                "value": phone.value,
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

    # -----------------------------------------------------------------------
    # Email
    # -----------------------------------------------------------------------

    async def add_email(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        value: str,
        type: str,
        is_primary: bool,
        source: str,
        user_id: str,
    ) -> VoterEmail:
        """Add an email contact for a voter.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID (for RLS).
            voter_id: Voter UUID.
            value: Email address.
            type: Email type (home/work).
            is_primary: Whether this is the primary email.
            source: Contact source (import/manual).
            user_id: ID of user performing the action.

        Returns:
            The created VoterEmail record.
        """
        if is_primary:
            await self._unset_primary(session, VoterEmail, campaign_id, voter_id)

        now = utcnow()
        email = VoterEmail(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value=value,
            type=type,
            is_primary=is_primary,
            source=source,
            created_at=now,
            updated_at=now,
        )
        session.add(email)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={"action": "added", "contact_type": "email", "value": value},
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

        return email

    async def update_email(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        email_id: uuid.UUID,
        user_id: str,
        **kwargs,
    ) -> VoterEmail:
        """Update an existing email contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            email_id: Email record UUID.
            user_id: ID of user performing the action.
            **kwargs: Fields to update.

        Returns:
            The updated VoterEmail record.

        Raises:
            ValueError: If the email record is not found.
        """
        email = await self._get_contact(
            session, VoterEmail, email_id, campaign_id, voter_id
        )

        if kwargs.get("is_primary"):
            await self._unset_primary(session, VoterEmail, campaign_id, voter_id)

        for key, val in kwargs.items():
            if hasattr(email, key):
                setattr(email, key, val)
        email.updated_at = utcnow()
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "updated",
                "contact_type": "email",
                "email_id": str(email_id),
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

        return email

    async def delete_email(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        email_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Delete an email contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            email_id: Email record UUID.
            user_id: ID of user performing the action.

        Raises:
            ValueError: If the email record is not found.
        """
        email = await self._get_contact(
            session, VoterEmail, email_id, campaign_id, voter_id
        )

        await session.delete(email)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "removed",
                "contact_type": "email",
                "value": email.value,
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

    # -----------------------------------------------------------------------
    # Address
    # -----------------------------------------------------------------------

    async def add_address(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        type: str,
        is_primary: bool,
        source: str,
        user_id: str,
        address_line2: str | None = None,
    ) -> VoterAddress:
        """Add an address contact for a voter.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID (for RLS).
            voter_id: Voter UUID.
            address_line1: Primary address line.
            city: City name.
            state: State abbreviation (2 chars).
            zip_code: ZIP code.
            type: Address type (home/work/mailing).
            is_primary: Whether this is the primary address.
            source: Contact source (import/manual).
            user_id: ID of user performing the action.
            address_line2: Optional secondary address line.

        Returns:
            The created VoterAddress record.
        """
        if is_primary:
            await self._unset_primary(session, VoterAddress, campaign_id, voter_id)

        now = utcnow()
        address = VoterAddress(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            address_line1=address_line1,
            address_line2=address_line2,
            city=city,
            state=state,
            zip_code=zip_code,
            type=type,
            is_primary=is_primary,
            source=source,
            created_at=now,
            updated_at=now,
        )
        session.add(address)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "added",
                "contact_type": "address",
                "value": address_line1,
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

        return address

    async def update_address(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        address_id: uuid.UUID,
        user_id: str,
        **kwargs,
    ) -> VoterAddress:
        """Update an existing address contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            address_id: Address record UUID.
            user_id: ID of user performing the action.
            **kwargs: Fields to update.

        Returns:
            The updated VoterAddress record.

        Raises:
            ValueError: If the address record is not found.
        """
        address = await self._get_contact(
            session, VoterAddress, address_id, campaign_id, voter_id
        )

        if kwargs.get("is_primary"):
            await self._unset_primary(session, VoterAddress, campaign_id, voter_id)

        for key, val in kwargs.items():
            if hasattr(address, key):
                setattr(address, key, val)
        address.updated_at = utcnow()
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "updated",
                "contact_type": "address",
                "address_id": str(address_id),
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

        return address

    async def delete_address(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        address_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Delete an address contact.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            address_id: Address record UUID.
            user_id: ID of user performing the action.

        Raises:
            ValueError: If the address record is not found.
        """
        address = await self._get_contact(
            session, VoterAddress, address_id, campaign_id, voter_id
        )

        await session.delete(address)
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "removed",
                "contact_type": "address",
                "value": address.address_line1,
            },
            user_id=user_id,
        )
        await self._search_index.refresh_records(session, [voter_id])

    # -----------------------------------------------------------------------
    # Shared
    # -----------------------------------------------------------------------

    async def get_voter_contacts(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
    ) -> dict:
        """Get all contacts for a voter grouped by type.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.

        Returns:
            Dict with keys: phones, emails, addresses.
        """
        phones_result = await session.execute(
            select(VoterPhone).where(
                VoterPhone.campaign_id == campaign_id,
                VoterPhone.voter_id == voter_id,
            )
        )
        emails_result = await session.execute(
            select(VoterEmail).where(
                VoterEmail.campaign_id == campaign_id,
                VoterEmail.voter_id == voter_id,
            )
        )
        addresses_result = await session.execute(
            select(VoterAddress).where(
                VoterAddress.campaign_id == campaign_id,
                VoterAddress.voter_id == voter_id,
            )
        )

        return {
            "phones": await self._attach_phone_validations(
                session,
                campaign_id=campaign_id,
                phones=list(phones_result.scalars().all()),
            ),
            "emails": list(emails_result.scalars().all()),
            "addresses": list(addresses_result.scalars().all()),
        }

    async def refresh_phone(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        phone_id: uuid.UUID,
    ) -> VoterPhone:
        """Refresh cached validation for one campaign-scoped voter phone."""
        phone = await self._get_contact(
            session,
            VoterPhone,
            phone_id,
            campaign_id,
            voter_id,
        )
        phone.validation = await self._phone_validation.refresh_phone_validation(
            session,
            campaign_id=campaign_id,
            phone_number=phone.value,
        )
        return phone

    async def set_primary(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        contact_type: str,
        contact_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Set one contact as primary, unset others of same type.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            contact_type: Contact type ("phones", "emails", or "addresses").
            contact_id: ID of the contact to set as primary.
            user_id: ID of user performing the action.

        Raises:
            ValueError: If contact_type is invalid or contact not found.
        """
        model_map = {
            "phones": VoterPhone,
            "emails": VoterEmail,
            "addresses": VoterAddress,
        }
        model = model_map.get(contact_type)
        if model is None:
            msg = f"Invalid contact type: {contact_type}"
            raise ValueError(msg)

        await self._unset_primary(session, model, campaign_id, voter_id)

        target = await self._get_contact(
            session, model, contact_id, campaign_id, voter_id
        )
        target.is_primary = True
        target.updated_at = utcnow()
        await session.flush()

        await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.CONTACT_UPDATED,
            payload={
                "action": "set_primary",
                "contact_type": contact_type,
                "contact_id": str(contact_id),
            },
            user_id=user_id,
        )

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _unset_primary(
        self,
        session: AsyncSession,
        model: type,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
    ) -> None:
        """Unset is_primary for all contacts of a type for a voter.

        Args:
            session: Async database session.
            model: SQLAlchemy model class (VoterPhone, VoterEmail, VoterAddress).
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
        """
        result = await session.execute(
            select(model).where(
                model.campaign_id == campaign_id,
                model.voter_id == voter_id,
                model.is_primary == True,  # noqa: E712
            )
        )
        for contact in result.scalars().all():
            contact.is_primary = False

    async def _attach_phone_validations(
        self,
        session: AsyncSession,
        *,
        campaign_id: uuid.UUID,
        phones: list[VoterPhone],
    ) -> list[VoterPhone]:
        for phone in phones:
            phone.validation = await self._phone_validation.get_validation_summary(
                session,
                campaign_id=campaign_id,
                phone_number=phone.value,
            )
        return phones

    async def _get_contact(
        self,
        session: AsyncSession,
        model: type,
        contact_id: uuid.UUID,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
    ):
        """Get a single contact by ID.

        Args:
            session: Async database session.
            model: SQLAlchemy model class.
            contact_id: Contact UUID.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.

        Returns:
            The contact record.

        Raises:
            ValueError: If contact is not found.
        """
        result = await session.execute(
            select(model).where(
                model.id == contact_id,
                model.campaign_id == campaign_id,
                model.voter_id == voter_id,
            )
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            msg = f"{model.__name__} {contact_id} not found"
            raise ValueError(msg)
        return contact
