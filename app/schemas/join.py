"""Pydantic schemas for the public volunteer join flow.

These schemas are intentionally minimal — they expose only the fields a
prospective volunteer needs to see before authenticating and registering.
"""

from __future__ import annotations

from datetime import date

from app.schemas.common import BaseSchema


class CampaignPublicInfo(BaseSchema):
    """Public-facing campaign information displayed on the join landing page.

    Does not include internal fields such as ZITADEL org IDs or FIPS codes.

    Attributes:
        slug: URL-safe campaign identifier used in join links.
        name: Campaign name.
        candidate_name: Name of the candidate (optional).
        party_affiliation: Party the campaign is affiliated with (optional).
        election_date: Date of the relevant election (optional).
        type: Campaign type (federal, state, local, ballot).
        jurisdiction_name: Human-readable jurisdiction description (optional).
    """

    slug: str
    name: str
    candidate_name: str | None
    party_affiliation: str | None
    election_date: date | None
    type: str
    jurisdiction_name: str | None


class JoinResponse(BaseSchema):
    """Response returned after a successful volunteer self-registration.

    Attributes:
        campaign_id: UUID of the campaign the volunteer joined (as a string
            for easy frontend consumption).
        campaign_slug: URL-safe slug of the campaign.
        volunteer_id: UUID of the newly created Volunteer record (as a string).
        message: Human-readable confirmation message.
    """

    campaign_id: str
    campaign_slug: str
    volunteer_id: str
    message: str
