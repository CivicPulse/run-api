"""Unit tests for volunteer application intake and approval service."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.campaign import Campaign
from app.models.volunteer_application import VolunteerApplication
from app.services.volunteer_application import VolunteerApplicationService


def _make_link(**kwargs):
    link = MagicMock()
    link.id = uuid.uuid4()
    link.label = "Weekend volunteers"
    for key, value in kwargs.items():
        setattr(link, key, value)
    return link


def _make_campaign(**kwargs):
    campaign = MagicMock(spec=Campaign)
    campaign.id = uuid.uuid4()
    campaign.organization_id = uuid.uuid4()
    campaign.zitadel_org_id = "zitadel-org-1"
    for key, value in kwargs.items():
        setattr(campaign, key, value)
    return campaign


def _make_application(**kwargs):
    application = MagicMock(spec=VolunteerApplication)
    application.id = uuid.uuid4()
    application.campaign_id = uuid.uuid4()
    application.signup_link_id = uuid.uuid4()
    application.signup_link_label = "Weekend volunteers"
    application.applicant_user_id = "user-1"
    application.first_name = "Pat"
    application.last_name = "Doe"
    application.email = "pat@example.com"
    application.phone = "555-111-2222"
    application.notes = "Ready to help"
    application.status = "pending"
    application.reviewed_by = None
    application.reviewed_at = None
    application.rejection_reason = None
    for key, value in kwargs.items():
        setattr(application, key, value)
    return application


class TestVolunteerApplicationService:
    @pytest.mark.anyio
    async def test_submit_application_returns_existing_match(self):
        service = VolunteerApplicationService()
        db = AsyncMock()
        db.add = MagicMock()
        db.scalar = AsyncMock(
            side_effect=[
                _make_application(),  # existing application
            ]
        )
        service._signup_link_service.get_public_link = AsyncMock(
            return_value=(_make_link(), _make_campaign(), None)
        )

        application = await service.submit_application(
            db,
            uuid.uuid4(),
            applicant_user_id="user-1",
            first_name="Pat",
            last_name="Doe",
            email="pat@example.com",
            phone=None,
            notes=None,
        )

        assert application.status == "pending"
        db.add.assert_not_called()
        db.commit.assert_not_awaited()

    @pytest.mark.anyio
    async def test_submit_application_allows_anonymous_pending_submission(self):
        service = VolunteerApplicationService()
        db = AsyncMock()
        db.add = MagicMock()
        db.scalar = AsyncMock(side_effect=[None])
        service._signup_link_service.get_public_link = AsyncMock(
            return_value=(_make_link(), _make_campaign(), None)
        )

        application = await service.submit_application(
            db,
            uuid.uuid4(),
            applicant_user_id=None,
            first_name="Pat",
            last_name="Doe",
            email="pat@example.com",
            phone=None,
            notes="Ready",
        )

        assert application.status == "pending"
        assert application.applicant_user_id is None
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    @pytest.mark.anyio
    async def test_submit_application_ignores_rejected_history_and_creates_fresh_row(
        self,
    ):
        service = VolunteerApplicationService()
        db = AsyncMock()
        db.add = MagicMock()
        db.scalar = AsyncMock(side_effect=[None])
        service._signup_link_service.get_public_link = AsyncMock(
            return_value=(_make_link(), _make_campaign(), None)
        )

        application = await service.submit_application(
            db,
            uuid.uuid4(),
            applicant_user_id="user-1",
            first_name="Pat",
            last_name="Doe",
            email="pat@example.com",
            phone=None,
            notes=None,
        )

        assert application.status == "pending"
        db.add.assert_called_once()

    @pytest.mark.anyio
    async def test_approve_application_creates_access_and_marks_approved(self):
        service = VolunteerApplicationService()
        db = AsyncMock()
        db.add = MagicMock()
        application = _make_application()
        campaign = _make_campaign(campaign_id=application.campaign_id)
        service._build_review_context = AsyncMock(return_value=MagicMock())
        db.scalar = AsyncMock(
            side_effect=[
                application,  # application lookup
                campaign,  # campaign lookup
                None,  # user lookup
                None,  # member lookup
                None,  # volunteer lookup
                None,  # org lookup
            ]
        )
        zitadel = AsyncMock()

        approved = await service.approve_application(
            db,
            application.campaign_id,
            application.id,
            "reviewer-1",
            zitadel,
        )

        assert approved.status == "approved"
        assert approved.reviewed_by == "reviewer-1"
        assert approved.reviewed_at is not None
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(application)
        zitadel.assign_project_role.assert_awaited_once()

    @pytest.mark.anyio
    async def test_approve_application_queues_invite_for_anonymous_applicant(self):
        service = VolunteerApplicationService()
        db = AsyncMock()
        db.add = MagicMock()
        application = _make_application(applicant_user_id=None)
        campaign = _make_campaign(campaign_id=application.campaign_id)
        service._build_review_context = AsyncMock(
            return_value=MagicMock(approval_delivery="queued")
        )
        db.scalar = AsyncMock(
            side_effect=[
                application,  # application lookup
                campaign,  # campaign lookup
                None,  # resolve user by email
                None,  # org lookup
            ]
        )
        service._invite_service.create_invite = AsyncMock(
            return_value=MagicMock(email_delivery_status="queued")
        )
        zitadel = AsyncMock()

        approved = await service.approve_application(
            db,
            application.campaign_id,
            application.id,
            "reviewer-1",
            zitadel,
        )

        assert approved.status == "approved"
        assert approved.review_context.approval_delivery == "queued"
        service._invite_service.create_invite.assert_awaited_once()
        zitadel.assign_project_role.assert_not_awaited()
