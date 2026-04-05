"""Tenant-isolation IDOR tests (Phase 71 Wave 0 -- red state).

These tests prove the IDOR vulnerabilities described in
CODEBASE-REVIEW-2026-04-04.md sections C1-C4 still exist in the
current codebase.  Each cross-campaign assertion expects a 404
(enumeration-safe) response; on the unfixed codebase these tests
FAIL because the service layer does not yet enforce campaign_id.

Addresses requirements: SEC-01, SEC-02, SEC-03, SEC-04, SEC-13.

Plans 71-02 (service scoping) and 71-03 (route/tag guards) will
turn these tests green.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import CampaignRole
from tests.integration.test_rls_api_smoke import _make_app_for_campaign


def _client_for_campaign_a(data, app_user_engine, superuser_engine):
    """Build an ASGI client acting as Campaign A's admin user."""
    app, _ = _make_app_for_campaign(
        data["user_a_id"],
        data["org_a_id"],
        data["campaign_a_id"],
        app_user_engine,
        superuser_engine=superuser_engine,
        role=CampaignRole.ADMIN,
    )
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.integration
class TestListCampaignsScoping:
    """SEC-01: GET /api/v1/campaigns must be scoped to membership."""

    async def test_list_campaigns_scoped(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """User A sees Campaign A but not Campaign B in list_campaigns."""
        data = two_campaigns_with_resources
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get("/api/v1/campaigns")

        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json().get("items", [])]
        assert str(data["campaign_a_id"]) in ids
        assert str(data["campaign_b_id"]) not in ids


@pytest.mark.integration
class TestVoterListScoping:
    """SEC-02: VoterListService must enforce campaign_id on every query."""

    async def test_voter_list_get_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(f"/api/v1/campaigns/{cid_a}/lists/{list_b}")
        assert resp.status_code == 404

    async def test_voter_list_patch_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{cid_a}/lists/{list_b}",
                json={"name": "hacked"},
            )
        assert resp.status_code == 404

    async def test_voter_list_delete_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.delete(f"/api/v1/campaigns/{cid_a}/lists/{list_b}")
        assert resp.status_code == 404

    async def test_voter_list_add_members_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/lists/{list_b}/members",
                json={"voter_ids": [str(data["voter_a_id"])]},
            )
        assert resp.status_code == 404

    async def test_voter_list_remove_members_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.request(
                "DELETE",
                f"/api/v1/campaigns/{cid_a}/lists/{list_b}/members",
                json={"voter_ids": [str(data["voter_a_id"])]},
            )
        assert resp.status_code == 404

    async def test_voter_list_same_campaign_ok(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """Positive regression: A's list is reachable via A."""
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_a = data["voter_list_a_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(f"/api/v1/campaigns/{cid_a}/lists/{list_a}")
        assert resp.status_code == 200


@pytest.mark.integration
class TestImportJobScoping:
    """SEC-03: ImportJob routes must verify campaign_id match."""

    async def test_import_detect_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        job_b = data["import_job_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/imports/{job_b}/detect"
            )
        assert resp.status_code == 404

    async def test_import_confirm_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        job_b = data["import_job_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/imports/{job_b}/confirm",
                json={"field_mapping": {}},
            )
        assert resp.status_code == 404

    async def test_import_cancel_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        job_b = data["import_job_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/imports/{job_b}/cancel"
            )
        assert resp.status_code == 404

    async def test_import_get_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        job_b = data["import_job_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(f"/api/v1/campaigns/{cid_a}/imports/{job_b}")
        assert resp.status_code == 404


@pytest.mark.integration
class TestRevokeInviteScoping:
    """SEC-04: InviteService.revoke_invite must check campaign_id."""

    async def test_revoke_invite_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        invite_b = data["invite_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.delete(f"/api/v1/campaigns/{cid_a}/invites/{invite_b}")
        assert resp.status_code == 404

    async def test_revoke_invite_same_campaign_ok(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """Positive regression: legitimate revoke succeeds."""
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        invite_a = data["invite_a_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.delete(f"/api/v1/campaigns/{cid_a}/invites/{invite_a}")
        assert resp.status_code in (200, 204)


@pytest.mark.integration
class TestVoterTagScoping:
    """SEC-13: voter_tags.add_tag must verify tag belongs to campaign."""

    async def test_add_tag_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """POST a tag from Campaign B onto a voter in Campaign A → 404."""
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        voter_a = data["voter_a_id"]
        tag_b = data["voter_tag_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/voters/{voter_a}/tags",
                json={"tag_id": str(tag_b)},
            )
        assert resp.status_code == 404


@pytest.mark.integration
class TestSurveyScoping:
    """SEC-13: survey script/question routes must enforce campaign_id."""

    async def test_survey_script_get_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        script_b = data["survey_script_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.get(f"/api/v1/campaigns/{cid_a}/surveys/{script_b}")
        assert resp.status_code == 404

    async def test_survey_script_patch_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        script_b = data["survey_script_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{cid_a}/surveys/{script_b}",
                json={"title": "hacked"},
            )
        assert resp.status_code == 404

    async def test_survey_add_question_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        script_b = data["survey_script_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.post(
                f"/api/v1/campaigns/{cid_a}/surveys/{script_b}/questions",
                json={
                    "position": 2,
                    "question_text": "hacked?",
                    "question_type": "free_text",
                },
            )
        assert resp.status_code == 404

    async def test_survey_update_question_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """PATCH a question belonging to Campaign B via Campaign A's script."""
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        script_a = data["survey_script_a_id"]
        question_b = data["survey_question_b_id"]
        async with _client_for_campaign_a(
            data, app_user_engine, superuser_engine
        ) as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{cid_a}/surveys/{script_a}/questions/{question_b}",
                json={"question_text": "hacked?"},
            )
        assert resp.status_code == 404
