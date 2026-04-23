"""Unit tests for ``InviteService.accept_invite_native``.

Covers the Step-4 rewrite of the invite-accept path: no ZITADEL, no
pre-existing authenticated user, and a hashed-password + email_verified
user row created in a single transaction.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi_users import InvalidPasswordException

from app.auth.manager import UserManager
from app.core.time import utcnow
from app.models.campaign_member import CampaignMember
from app.models.invite import Invite
from app.models.user import User
from app.services.invite import InviteService


class _FakeUserDB:
    """Minimal user-db stand-in used only to instantiate ``UserManager``."""

    async def get(self, _id: str) -> None:  # pragma: no cover -- unused
        return None


def _make_invite(email: str = "invitee@example.com", role: str = "manager") -> Invite:
    return Invite(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        email=email,
        role=role,
        token=uuid.uuid4(),
        expires_at=utcnow() + timedelta(days=7),
        accepted_at=None,
        revoked_at=None,
        created_by="creator-1",
        created_at=utcnow(),
    )


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    db.scalar = AsyncMock()
    return db


@pytest.fixture
def user_manager() -> UserManager:
    return UserManager(_FakeUserDB())  # type: ignore[arg-type]


def _configure_db_for_accept(
    mock_db: Any,
    invite: Invite,
    existing_user: User | None = None,
) -> None:
    """Wire up ``mock_db`` for a successful ``accept_invite_native`` call.

    Calls in order:
      1. ``validate_invite`` -> ``db.execute`` -> invite lookup result.
      2. ``db.execute`` -> campaign lookup result.
      3. ``db.scalar`` -> existing-user-by-email lookup.
      4. ``db.execute`` -> Volunteer back-fill UPDATE (returns rowcount stub).
    """
    invite_lookup = MagicMock()
    invite_lookup.scalar_one_or_none.return_value = invite
    campaign = MagicMock()
    campaign.zitadel_org_id = "org-1"
    campaign.organization_id = None
    campaign_lookup = MagicMock()
    campaign_lookup.scalar_one_or_none.return_value = campaign
    volunteer_update = MagicMock()
    mock_db.execute = AsyncMock(
        side_effect=[invite_lookup, campaign_lookup, volunteer_update]
    )
    mock_db.scalar = AsyncMock(return_value=existing_user)


class TestAcceptInviteNative:
    async def test_creates_user_with_hashed_password_and_verified_flags(
        self, mock_db, user_manager
    ) -> None:
        invite = _make_invite(role="volunteer")
        _configure_db_for_accept(mock_db, invite)

        service = InviteService()
        result_invite, result_user = await service.accept_invite_native(
            db=mock_db,
            token=invite.token,
            password="correct-horse-battery-staple-42",
            display_name="Nellie Newcomer",
            user_manager=user_manager,
        )

        assert result_invite.accepted_at is not None
        assert result_user.hashed_password is not None
        assert result_user.hashed_password != "correct-horse-battery-staple-42"
        assert result_user.is_active is True
        assert result_user.is_verified is True
        assert result_user.email_verified is True
        assert result_user.email == invite.email.lower()

        # db.add() is called at least twice: once for the User, once for the
        # CampaignMember. Confirm a CampaignMember row with the invite role.
        added_types = [type(c.args[0]) for c in mock_db.add.call_args_list]
        assert User in added_types
        assert CampaignMember in added_types
        for call in mock_db.add.call_args_list:
            obj = call.args[0]
            if isinstance(obj, CampaignMember):
                assert obj.role == invite.role
                assert obj.campaign_id == invite.campaign_id
                assert obj.user_id == result_user.id

        mock_db.commit.assert_awaited()

    async def test_rejects_weak_password(self, mock_db, user_manager) -> None:
        invite = _make_invite()
        _configure_db_for_accept(mock_db, invite)

        service = InviteService()
        with pytest.raises(InvalidPasswordException):
            await service.accept_invite_native(
                db=mock_db,
                token=invite.token,
                password="password1234",
                display_name="Weak",
                user_manager=user_manager,
            )

    async def test_rejects_invalid_token(self, mock_db, user_manager) -> None:
        # validate_invite returns None -> ValueError
        empty = MagicMock()
        empty.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=empty)

        service = InviteService()
        with pytest.raises(ValueError, match="Invalid or expired"):
            await service.accept_invite_native(
                db=mock_db,
                token=uuid.uuid4(),
                password="correct-horse-battery-staple-42",
                display_name="Whoever",
                user_manager=user_manager,
            )

    async def test_reuses_existing_user_and_updates_password(
        self, mock_db, user_manager
    ) -> None:
        """If a user row already exists for the invited email, reuse it."""
        invite = _make_invite(email="returning@example.com")
        existing = User(
            id="legacy-zitadel-sub",
            email="returning@example.com",
            display_name="Old Name",
            hashed_password=None,
            is_active=True,
            is_superuser=False,
            is_verified=False,
            email_verified=False,
        )
        _configure_db_for_accept(mock_db, invite, existing_user=existing)

        service = InviteService()
        _, user = await service.accept_invite_native(
            db=mock_db,
            token=invite.token,
            password="correct-horse-battery-staple-42",
            display_name="New Name",
            user_manager=user_manager,
        )

        assert user.id == "legacy-zitadel-sub"
        assert user.hashed_password is not None
        assert user.email_verified is True
        assert user.is_verified is True
        assert user.display_name == "New Name"
