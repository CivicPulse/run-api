"""V1 API router -- aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    call_lists,
    campaigns,
    config,
    dashboard,
    dnc,
    field,
    imports,
    invites,
    join,
    members,
    org,
    phone_banks,
    shifts,
    surveys,
    turfs,
    users,
    voice,
    volunteers,
    voter_contacts,
    voter_interactions,
    voter_lists,
    voter_tags,
    voters,
    walk_lists,
    webhooks,
)

router = APIRouter(prefix="/api/v1")

router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
router.include_router(join.router, tags=["join"])
router.include_router(users.router, prefix="/me", tags=["users"])
router.include_router(invites.router, tags=["invites"])
router.include_router(members.router, tags=["members"])
router.include_router(org.router, prefix="/org", tags=["org"])
router.include_router(imports.router, tags=["imports"])
router.include_router(voter_interactions.router, tags=["voter-interactions"])
router.include_router(voter_contacts.router, tags=["voter-contacts"])
router.include_router(voters.router, tags=["voters"])
router.include_router(voter_lists.router, tags=["voter-lists"])
router.include_router(voter_tags.router, tags=["voter-tags"])
router.include_router(surveys.router, tags=["surveys"])
router.include_router(turfs.router, tags=["turfs"])
router.include_router(walk_lists.router, tags=["walk-lists"])
router.include_router(call_lists.router, tags=["call-lists"])
router.include_router(dnc.router, tags=["dnc"])
router.include_router(phone_banks.router, tags=["phone-banks"])
router.include_router(volunteers.router, tags=["volunteers"])
router.include_router(shifts.router, tags=["shifts"])
router.include_router(dashboard.router, tags=["dashboard"])
router.include_router(field.router, tags=["field"])
router.include_router(config.router, tags=["config"])
router.include_router(voice.campaign_router, prefix="/campaigns", tags=["voice"])
router.include_router(voice.twiml_router, prefix="/voice", tags=["voice"])
router.include_router(webhooks.router, prefix="/webhooks/twilio", tags=["webhooks"])
