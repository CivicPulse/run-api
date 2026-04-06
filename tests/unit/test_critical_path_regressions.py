"""Regression tests for critical-path bug fixes.

R012: create_campaign must insert a CampaignMember with role='owner'.
R003: Voter lists hook must select .items from paginated response.
R004: VoterEditSheet must use __none__ sentinel for nullable selects.
R010: useVoterListVoters hook URL must match the API route pattern.
R013: Campaign layout must handle campaign-not-found error state.
R014: Voter views must use calculateAge for age display.
R015: Frontend must reference created_by_name for audit display.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Project root for source-presence assertions
# ---------------------------------------------------------------------------
# The test working directory is the repo root, so relative paths like
# web/src/... resolve correctly.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


# ---------------------------------------------------------------------------
# R012: create_campaign inserts CampaignMember with role='owner'
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_campaign_inserts_owner_as_member():
    """R012 regression: create_campaign must add a CampaignMember(role='owner') for the creator."""
    from app.models.campaign_member import CampaignMember
    from app.services.campaign import CampaignService

    svc = CampaignService()

    # --- Mock the DB session ---
    mock_session = AsyncMock()

    # Make session.execute return an org with the required attributes
    mock_org = MagicMock()
    mock_org.id = uuid.uuid4()
    mock_org.zitadel_org_id = "zorg-123"
    mock_org.zitadel_project_grant_id = "grant-abc"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_org
    mock_session.execute = AsyncMock(return_value=mock_result)

    # Track all objects passed to session.add
    added_objects: list = []
    mock_session.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    # --- Mock the authenticated user ---
    mock_user = MagicMock()
    mock_user.id = "user-creator-001"

    # --- Mock ZitadelService ---
    mock_zitadel = AsyncMock()
    mock_zitadel.assign_project_role = AsyncMock()

    # --- Mock _generate_unique_slug ---
    with patch.object(
        svc, "_generate_unique_slug", new=AsyncMock(return_value="test-campaign")
    ):
        campaign = await svc.create_campaign(
            db=mock_session,
            name="Test Campaign",
            campaign_type="FEDERAL",
            user=mock_user,
            zitadel=mock_zitadel,
            organization_id=mock_org.id,
        )

    # Verify that a CampaignMember with role='owner' was added
    member_adds = [obj for obj in added_objects if isinstance(obj, CampaignMember)]
    assert len(member_adds) == 1, (
        f"Expected exactly 1 CampaignMember to be added, got {len(member_adds)}"
    )
    member = member_adds[0]
    assert member.role == "owner", (
        f"CampaignMember role should be 'owner', got '{member.role}'"
    )
    assert member.user_id == "user-creator-001", (
        f"CampaignMember user_id should match creator, got '{member.user_id}'"
    )


# ---------------------------------------------------------------------------
# Source-presence regression tests (frontend fixes)
# ---------------------------------------------------------------------------


def _read_source(relative_path: str) -> str:
    """Read a source file relative to the project root."""
    path = PROJECT_ROOT / relative_path
    assert path.exists(), f"Source file not found: {path}"
    return path.read_text()


class TestFrontendSourcePresence:
    """Source-presence assertions verifying frontend bug-fix patterns remain in place."""

    def test_r003_voter_lists_hook_selects_items(self):
        """R003 regression: useVoterLists hook must select .items from paginated API response.

        Without this, the hook returns the full paginated envelope
        {items: [...], total: N} instead of just the voter list array.
        """
        source = _read_source("web/src/hooks/useVoterLists.ts")
        assert "data.items" in source or "data => data.items" in source, (
            "useVoterLists.ts must contain data.items selection from paginated response"
        )

    def test_r004_select_item_none_sentinel(self):
        """R004 regression: VoterEditSheet must use __none__ sentinel for nullable select fields.

        Without this sentinel value, selecting 'None' in a dropdown sends
        an empty string instead of null, corrupting voter data.
        """
        source = _read_source("web/src/components/voters/VoterEditSheet.tsx")
        assert "__none__" in source, (
            "VoterEditSheet.tsx must contain __none__ sentinel for nullable selects"
        )

    def test_r010_voter_list_voters_url(self):
        """R010 regression: useVoterListVoters hook URL must match the API route.

        The API route is /campaigns/{campaign_id}/lists/{list_id}/voters.
        The hook must use the same pattern with template literals.
        """
        source = _read_source("web/src/hooks/useVoterLists.ts")
        # The hook should contain the pattern: lists/${listId}/voters
        assert "lists/" in source and "/voters" in source, (
            "useVoterLists.ts must contain a URL matching /lists/{id}/voters"
        )

    def test_r013_campaign_not_found(self):
        """R013 regression: Campaign layout must show 'Campaign not found' on error.

        Without this, a 404 for a campaign leaves users on a blank/broken page
        with no way to navigate back.
        """
        source = _read_source("web/src/routes/campaigns/$campaignId.tsx")
        assert (
            "Campaign not found" in source or "campaign not found" in source.lower()
        ), "$campaignId.tsx layout must handle campaign-not-found error state"

    def test_r014_calculate_age_usage(self):
        """R014 regression: Voter views must use calculateAge for age display.

        Without this, voter ages are either missing or hard-coded
        instead of computed from date_of_birth.
        """
        voters_index = _read_source(
            "web/src/routes/campaigns/$campaignId/voters/index.tsx"
        )
        voter_detail = _read_source(
            "web/src/routes/campaigns/$campaignId/voters/$voterId.tsx"
        )
        assert "calculateAge" in voters_index or "calculateAge" in voter_detail, (
            "Voter index or detail view must use calculateAge for age computation"
        )

    def test_r015_created_by_name(self):
        """R015 regression: Frontend must reference created_by_name for audit display.

        Without this field, the UI shows a raw user ID or nothing in places
        where the creator's name should appear.
        """
        # Check in type definitions and components
        types_source = _read_source("web/src/types/voter.ts")
        history_source = _read_source("web/src/components/voters/HistoryTab.tsx")
        assert (
            "created_by_name" in types_source or "created_by_name" in history_source
        ), "Frontend must reference created_by_name in voter types or history component"
