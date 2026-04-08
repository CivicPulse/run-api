"""Unit tests for VoterContactService -- contact CRUD with interaction events."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.time import utcnow
from app.models.voter_contact import VoterAddress, VoterEmail, VoterPhone
from app.models.voter_interaction import InteractionType


class TestVoterContactService:
    """Tests for contact management with primary flag
    cascading and interaction events."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        db.delete = AsyncMock()
        return db

    @pytest.fixture
    def service(self):
        from app.services.voter_contact import VoterContactService

        return VoterContactService()

    @pytest.fixture
    def voter_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def campaign_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def user_id(self):
        return "user-abc-123"

    async def test_add_phone_creates_record_and_emits_interaction(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """add_phone creates a VoterPhone and emits a contact_updated interaction."""
        # Mock the interaction service record_interaction
        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()
            service._phone_validation.refresh_phone_validation = AsyncMock(
                return_value=SimpleNamespace(status="validated")
            )

            # No existing primary phones
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_db.execute = AsyncMock(return_value=mock_result)

            await service.add_phone(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                value="+15551234",
                type="cell",
                is_primary=True,
                source="manual",
                user_id=user_id,
            )

            # Verify phone was added
            added_objs = [c[0][0] for c in mock_db.add.call_args_list]
            phones = [o for o in added_objs if isinstance(o, VoterPhone)]
            assert len(phones) == 1
            phone = phones[0]
            assert phone.value == "+15551234"
            assert phone.type == "cell"
            assert phone.is_primary is True
            assert phone.source == "manual"
            assert phone.campaign_id == campaign_id
            assert phone.voter_id == voter_id

            # Verify interaction event emitted
            mock_interaction.record_interaction.assert_awaited_once()
            call_kwargs = mock_interaction.record_interaction.call_args
            assert (
                call_kwargs.kwargs["interaction_type"]
                == InteractionType.CONTACT_UPDATED
            )
            assert call_kwargs.kwargs["payload"]["action"] == "added"
            assert call_kwargs.kwargs["payload"]["contact_type"] == "phone"

    async def test_add_phone_primary_cascading_unsets_old_primary(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """When is_primary=True, existing primary phone is set to is_primary=False."""
        existing_phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15559999",
            type="home",
            is_primary=True,
            source="import",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()
            service._phone_validation.refresh_phone_validation = AsyncMock(
                return_value=SimpleNamespace(status="validated")
            )

            # Return existing primary phone
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [existing_phone]
            mock_db.execute = AsyncMock(return_value=mock_result)

            await service.add_phone(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                value="+15551234",
                type="cell",
                is_primary=True,
                source="manual",
                user_id=user_id,
            )

            # Existing primary should be unset
            assert existing_phone.is_primary is False

    async def test_add_email_creates_record_and_emits_interaction(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """add_email creates a VoterEmail and emits a contact_updated interaction."""
        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_db.execute = AsyncMock(return_value=mock_result)

            await service.add_email(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                value="test@example.com",
                type="home",
                is_primary=False,
                source="manual",
                user_id=user_id,
            )

            added_objs = [c[0][0] for c in mock_db.add.call_args_list]
            emails = [o for o in added_objs if isinstance(o, VoterEmail)]
            assert len(emails) == 1
            assert emails[0].value == "test@example.com"

            mock_interaction.record_interaction.assert_awaited_once()

    async def test_add_address_creates_record_and_emits_interaction(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """add_address creates a VoterAddress and emits
        a contact_updated interaction."""
        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_db.execute = AsyncMock(return_value=mock_result)

            await service.add_address(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                address_line1="123 Main St",
                city="Springfield",
                state="IL",
                zip_code="62701",
                type="home",
                is_primary=True,
                source="manual",
                user_id=user_id,
            )

            added_objs = [c[0][0] for c in mock_db.add.call_args_list]
            addresses = [o for o in added_objs if isinstance(o, VoterAddress)]
            assert len(addresses) == 1
            addr = addresses[0]
            assert addr.address_line1 == "123 Main St"
            assert addr.city == "Springfield"

            mock_interaction.record_interaction.assert_awaited_once()

    async def test_delete_phone_removes_record_and_emits_interaction(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """delete_phone removes the contact record and emits contact_updated event."""
        phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15551234",
            type="cell",
            is_primary=False,
            source="manual",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = phone
            mock_db.execute = AsyncMock(return_value=mock_result)

            await service.delete_phone(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                phone_id=phone.id,
                user_id=user_id,
            )

            mock_db.delete.assert_awaited_once_with(phone)
            mock_interaction.record_interaction.assert_awaited_once()
            call_kwargs = mock_interaction.record_interaction.call_args
            assert call_kwargs.kwargs["payload"]["action"] == "removed"

    async def test_get_voter_contacts_groups_by_type(
        self, service, mock_db, voter_id, campaign_id
    ):
        """get_voter_contacts returns all contacts grouped by type."""
        phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15551234",
            type="cell",
            is_primary=True,
            source="manual",
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        email = VoterEmail(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="test@example.com",
            type="home",
            is_primary=True,
            source="manual",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        # Mock three separate execute calls (phones, emails, addresses)
        mock_phone_result = MagicMock()
        mock_phone_result.scalars.return_value.all.return_value = [phone]
        mock_email_result = MagicMock()
        mock_email_result.scalars.return_value.all.return_value = [email]
        mock_addr_result = MagicMock()
        mock_addr_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(
            side_effect=[mock_phone_result, mock_email_result, mock_addr_result]
        )
        service._phone_validation.get_validation_summary = AsyncMock(
            return_value=SimpleNamespace(status="validated")
        )

        result = await service.get_voter_contacts(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
        )

        assert "phones" in result
        assert "emails" in result
        assert "addresses" in result
        assert len(result["phones"]) == 1
        assert len(result["emails"]) == 1
        assert len(result["addresses"]) == 0
        assert result["phones"][0].validation.status == "validated"

    async def test_refresh_phone_returns_phone_with_validation(
        self, service, mock_db, voter_id, campaign_id
    ):
        phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15551234",
            type="cell",
            is_primary=True,
            source="manual",
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        service._phone_validation.refresh_phone_validation = AsyncMock(
            return_value=SimpleNamespace(status="pending")
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = phone
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.refresh_phone(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            phone_id=phone.id,
        )

        assert result.validation.status == "pending"

    async def test_set_primary_unsets_others_and_sets_target(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """set_primary sets one contact as primary and unsets others of same type."""
        target_phone_id = uuid.uuid4()
        other_phone = VoterPhone(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15559999",
            type="home",
            is_primary=True,
            source="import",
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        target_phone = VoterPhone(
            id=target_phone_id,
            campaign_id=campaign_id,
            voter_id=voter_id,
            value="+15551234",
            type="cell",
            is_primary=False,
            source="manual",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        with patch.object(service, "_interaction_service") as mock_interaction:
            mock_interaction.record_interaction = AsyncMock()

            # First call: get all phones for the voter (to unset primary)
            mock_all_result = MagicMock()
            mock_all_result.scalars.return_value.all.return_value = [
                other_phone,
                target_phone,
            ]
            # Second call: get target phone
            mock_target_result = MagicMock()
            mock_target_result.scalar_one_or_none.return_value = target_phone
            mock_db.execute = AsyncMock(
                side_effect=[mock_all_result, mock_target_result]
            )

            await service.set_primary(
                session=mock_db,
                campaign_id=campaign_id,
                voter_id=voter_id,
                contact_type="phones",
                contact_id=target_phone_id,
                user_id=user_id,
            )

            assert other_phone.is_primary is False
            assert target_phone.is_primary is True
