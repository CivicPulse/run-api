"""Unit tests for InviteService."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors import InsufficientPermissionsError
from app.core.security import AuthenticatedUser, CampaignRole
from app.core.time import utcnow
from app.models.invite import Invite
from app.services.invite import InviteService


def _make_user(
    user_id: str = "user-1",
    org_id: str = "org-1",
    role: CampaignRole = CampaignRole.ADMIN,
    email: str = "admin@test.com",
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=email,
        display_name=f"User {user_id}",
    )


def _make_invite(
    campaign_id: uuid.UUID | None = None,
    email: str = "invitee@test.com",
    role: str = "manager",
    expires_at: datetime | None = None,
    accepted_at: datetime | None = None,
    revoked_at: datetime | None = None,
) -> Invite:
    return Invite(
        id=uuid.uuid4(),
        campaign_id=campaign_id or uuid.uuid4(),
        email=email,
        role=role,
        token=uuid.uuid4(),
        expires_at=expires_at or (utcnow() + timedelta(days=7)),
        accepted_at=accepted_at,
        revoked_at=revoked_at,
        created_by="user-1",
        created_at=utcnow(),
    )


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def mock_zitadel():
    z = AsyncMock()
    z.assign_project_role = AsyncMock()
    z.remove_project_role = AsyncMock()
    return z


@pytest.fixture
def service():
    return InviteService()


class TestCreateInvite:
    """Tests for create_invite."""

    async def test_creates_invite_with_uuid_token_and_7_day_expiry(
        self, service, mock_db
    ):
        """create_invite generates UUID v4 token with 7-day expiry."""
        # No existing pending invite
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        creator = _make_user(role=CampaignRole.OWNER)
        campaign_id = uuid.uuid4()

        invite = await service.create_invite(
            db=mock_db,
            campaign_id=campaign_id,
            email="new@test.com",
            role="manager",
            creator=creator,
        )

        assert invite.token is not None
        assert invite.campaign_id == campaign_id
        assert invite.email == "new@test.com"
        assert invite.role == "manager"
        # Expiry is ~7 days from now
        delta = invite.expires_at - utcnow()
        assert delta.days >= 6  # at least 6 days remaining
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()

    async def test_rejects_if_caller_role_below_invited_role(
        self, service, mock_db
    ):
        """Admin cannot invite another admin or owner."""
        creator = _make_user(role=CampaignRole.ADMIN)

        with pytest.raises(InsufficientPermissionsError):
            await service.create_invite(
                db=mock_db,
                campaign_id=uuid.uuid4(),
                email="peer@test.com",
                role="admin",
                creator=creator,
            )

    async def test_rejects_duplicate_pending_invite(self, service, mock_db):
        """Duplicate pending invite for same email+campaign raises ValueError."""
        existing_invite = _make_invite()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        creator = _make_user(role=CampaignRole.OWNER)

        with pytest.raises(ValueError, match="pending invite already exists"):
            await service.create_invite(
                db=mock_db,
                campaign_id=existing_invite.campaign_id,
                email=existing_invite.email,
                role="manager",
                creator=creator,
            )


class TestValidateInvite:
    """Tests for validate_invite."""

    async def test_returns_invite_if_valid(self, service, mock_db):
        """Valid, non-expired, non-revoked, non-accepted token returns invite."""
        invite = _make_invite()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.validate_invite(mock_db, invite.token)
        assert result is not None
        assert result.id == invite.id

    async def test_returns_none_for_expired_token(self, service, mock_db):
        """Expired token returns None."""
        invite = _make_invite(
            expires_at=utcnow() - timedelta(hours=1)
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.validate_invite(mock_db, invite.token)
        assert result is None

    async def test_returns_none_for_revoked_token(self, service, mock_db):
        """Revoked token returns None."""
        invite = _make_invite(revoked_at=utcnow())
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.validate_invite(mock_db, invite.token)
        assert result is None


class TestAcceptInvite:
    """Tests for accept_invite."""

    async def test_creates_member_and_assigns_zitadel_role(
        self, service, mock_db, mock_zitadel
    ):
        """Accept creates campaign_member, assigns ZITADEL role, marks accepted."""
        invite = _make_invite(email="user@test.com")
        user = _make_user(email="user@test.com")

        # First call: validate_invite lookup
        # Second call: member lookup (None = no existing member)
        validate_result = MagicMock()
        validate_result.scalar_one_or_none.return_value = invite
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(
            side_effect=[validate_result, member_result]
        )

        result = await service.accept_invite(
            mock_db, invite.token, user, mock_zitadel
        )

        assert result.accepted_at is not None
        mock_db.add.assert_called_once()  # New CampaignMember
        mock_zitadel.assign_project_role.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    async def test_rejects_if_email_doesnt_match(
        self, service, mock_db, mock_zitadel
    ):
        """Accept rejects if authenticated user email doesn't match invite."""
        invite = _make_invite(email="correct@test.com")
        user = _make_user(email="wrong@test.com")

        validate_result = MagicMock()
        validate_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=validate_result)

        with pytest.raises(ValueError, match="Email does not match"):
            await service.accept_invite(
                mock_db, invite.token, user, mock_zitadel
            )


class TestRevokeInvite:
    """Tests for revoke_invite."""

    async def test_sets_revoked_at(self, service, mock_db):
        """Revoke sets revoked_at timestamp."""
        invite = _make_invite()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.revoke_invite(mock_db, invite.id)
        assert result.revoked_at is not None
        mock_db.commit.assert_awaited_once()


class TestListInvites:
    """Tests for list_invites."""

    async def test_returns_pending_invites(self, service, mock_db):
        """list_invites returns only pending invites for campaign."""
        invites = [_make_invite(), _make_invite(email="other@test.com")]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = invites
        mock_db.execute = AsyncMock(return_value=mock_result)

        campaign_id = uuid.uuid4()
        result = await service.list_invites(mock_db, campaign_id)
        assert len(result) == 2
